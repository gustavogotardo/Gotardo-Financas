import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { PrismaModule, PrismaService } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AccountsModule } from '../accounts/accounts.module';
import { StorageModule } from '../storage/storage.module';
import { ImportsModule } from '../imports/imports.module';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

process.env.DATABASE_URL = 'postgresql://gotardo:gotardo@localhost:5432/gotardo_test?schema=public';
process.env.JWT_ACCESS_SECRET = 'e2e-jwt-secret';
process.env.JWT_ACCESS_TTL = '15m';
process.env.JWT_REFRESH_TTL = '30d';

const CSV_SAMPLE = [
  'data;descricao;valor',
  '01/08/2026;PADARIA CENTRAL;-18,50',
  '05/08/2026;SALARIO;+3250,00',
  '10/08/2026;MERCADO;-120,30',
].join('\n');

const OFX_SAMPLE = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
<OFX>
<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20260812</DTPOSTED><TRNAMT>-45,90</TRNAMT><FITID>OFX001</FITID><NAME>FARMACIA</NAME></STMTTRN>
<STMTTRN><TRNTYPE>CREDIT</TRNTYPE><DTPOSTED>20260814</DTPOSTED><TRNAMT>150,00</TRNAMT><FITID>OFX002</FITID><NAME>REEMBOLSO</NAME></STMTTRN>
</BANKTRANLIST>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>`;

type TokensResponse = { accessToken: string; refreshToken: string };
type MeResponse = { id: string; email: string; role: string; familyId: string };

describe('Importação de extratos (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const suffix = randomUUID().slice(0, 8);
  const domain = `${suffix}.e2e.gotardo`;
  const createdFamilies: string[] = [];

  const emailFor = (tag: string): string => `${tag}@${domain}`;

  const register = (name: string, email: string, familyName: string) =>
    request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ name, email, password: 'senha-segura-123', familyName });

  const me = (token: string) =>
    request(app.getHttpServer()).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);

  const createAccount = (token: string, name: string) =>
    request(app.getHttpServer())
      .post('/api/v1/accounts')
      .set('Authorization', `Bearer ${token}`)
      .send({ name, type: 'CHECKING' });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PrismaModule,
        StorageModule,
        AuthModule,
        AccountsModule,
        ImportsModule,
      ],
      providers: [
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
    );
    await app.init();
    prisma = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.$transaction([
      prisma.transaction.deleteMany({ where: { familyId: { in: createdFamilies } } }),
      prisma.document.deleteMany({ where: { familyId: { in: createdFamilies } } }),
      prisma.account.deleteMany({ where: { familyId: { in: createdFamilies } } }),
      prisma.refreshToken.deleteMany({
        where: { user: { familyId: { in: createdFamilies } } },
      }),
      prisma.user.deleteMany({ where: { familyId: { in: createdFamilies } } }),
      prisma.family.deleteMany({ where: { id: { in: createdFamilies } } }),
    ]);
    await app.close();
  });

  it('importa um CSV e cria transações PENDING com source IMPORT', async () => {
    const email = emailFor('imp-csv');
    const reg = await register('Imp CSV', email, `Família Imp CSV ${suffix}`);
    const tokens = reg.body as TokensResponse;
    const meRes = await me(tokens.accessToken);
    const family = (meRes.body as MeResponse).familyId;
    createdFamilies.push(family);

    const account = await createAccount(tokens.accessToken, 'Conta Imp CSV');
    const accountId = (account.body as { id: string }).id;

    const upload = await request(app.getHttpServer())
      .post('/api/v1/imports')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .field('accountId', accountId)
      .attach('file', Buffer.from(CSV_SAMPLE, 'utf8'), 'extrato.csv');

    expect(upload.status).toBe(201);
    const imported = upload.body as { id: string; status: string; transactionCount: number };
    expect(imported.status).toBe('PROCESSED');
    expect(imported.transactionCount).toBe(3);

    const transactions = await prisma.transaction.findMany({
      where: { documentId: imported.id },
    });
    expect(transactions).toHaveLength(3);
    expect(transactions.every((tx) => tx.status === 'PENDING')).toBe(true);
    expect(transactions.every((tx) => tx.source === 'IMPORT')).toBe(true);
    const salario = transactions.find((tx) => tx.description === 'salario');
    expect(salario?.amount.toString()).toBe('3250');
  });

  it('deduplica ao importar o mesmo CSV de novo', async () => {
    const email = emailFor('imp-dedup');
    const reg = await register('Imp Dedup', email, `Família Imp Dedup ${suffix}`);
    const tokens = reg.body as TokensResponse;
    const meRes = await me(tokens.accessToken);
    const family = (meRes.body as MeResponse).familyId;
    createdFamilies.push(family);

    const account = await createAccount(tokens.accessToken, 'Conta Dedup');
    const accountId = (account.body as { id: string }).id;

    const first = await request(app.getHttpServer())
      .post('/api/v1/imports')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .field('accountId', accountId)
      .attach('file', Buffer.from(CSV_SAMPLE, 'utf8'), 'extrato.csv');
    expect(first.status).toBe(201);

    const second = await request(app.getHttpServer())
      .post('/api/v1/imports')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .field('accountId', accountId)
      .attach('file', Buffer.from(CSV_SAMPLE, 'utf8'), 'extrato.csv');
    expect(second.status).toBe(201);
    const secondBody = second.body as { id: string; transactionCount: number };
    expect(secondBody.transactionCount).toBe(0);

    const all = await prisma.transaction.findMany({ where: { familyId: family } });
    expect(all).toHaveLength(3);
  });

  it('importa OFX e usa FITID como externalId', async () => {
    const email = emailFor('imp-ofx');
    const reg = await register('Imp OFX', email, `Família Imp OFX ${suffix}`);
    const tokens = reg.body as TokensResponse;
    const meRes = await me(tokens.accessToken);
    const family = (meRes.body as MeResponse).familyId;
    createdFamilies.push(family);

    const account = await createAccount(tokens.accessToken, 'Conta OFX');
    const accountId = (account.body as { id: string }).id;

    const upload = await request(app.getHttpServer())
      .post('/api/v1/imports')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .field('accountId', accountId)
      .attach('file', Buffer.from(OFX_SAMPLE, 'utf8'), 'extrato.ofx');

    expect(upload.status).toBe(201);
    const imported = upload.body as { id: string; transactionCount: number };
    expect(imported.transactionCount).toBe(2);

    const transactions = await prisma.transaction.findMany({
      where: { documentId: imported.id },
      orderBy: { date: 'asc' },
    });
    expect(transactions).toHaveLength(2);
    expect(transactions[0]?.externalId).toBe('OFX001');
    expect(transactions[0]?.type).toBe('EXPENSE');
    expect(transactions[1]?.externalId).toBe('OFX002');
    expect(transactions[1]?.type).toBe('INCOME');
  });

  it('rejeita formato não suportado', async () => {
    const email = emailFor('imp-bad');
    const reg = await register('Imp Bad', email, `Família Imp Bad ${suffix}`);
    const tokens = reg.body as TokensResponse;
    const meRes = await me(tokens.accessToken);
    const family = (meRes.body as MeResponse).familyId;
    createdFamilies.push(family);

    const account = await createAccount(tokens.accessToken, 'Conta Bad');
    const accountId = (account.body as { id: string }).id;

    const upload = await request(app.getHttpServer())
      .post('/api/v1/imports')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .field('accountId', accountId)
      .attach('file', Buffer.from('texto aleatório', 'utf8'), 'notas.txt');

    expect(upload.status).toBe(400);
  });
});