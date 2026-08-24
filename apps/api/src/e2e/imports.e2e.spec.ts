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

process.env.DATABASE_URL = 'postgresql://gotardo_test:gotardo_test@localhost:5433/gotardo_test?schema=public';
process.env.JWT_ACCESS_SECRET = 'e2e-jwt-secret';
process.env.JWT_ACCESS_TTL = '15m';
process.env.JWT_REFRESH_TTL = '30d';

const CSV_SAMPLE = [
  'data;descricao;valor',
  '01/08/2026;PADARIA CENTRAL;-18,50',
  '05/08/2026;SALARIO;+3250,00',
  '10/08/2026;MERCADO;-120,30',
].join('\n');

const BRADESCO_CSV_SAMPLE = [
  'Extrato de: Ag: 1234 | Conta: 123456-7 | Entre 01/01/2026 e 31/01/2026',
  'Data;Histórico;Docto.;Crédito (R$);Débito (R$);Saldo (R$);',
  '30/12/25;SALDO ANTERIOR;;;;"1,00";',
  '05/01/26; Resgate Inv Fac;5050404;"329,63";;"330,63";',
  '05/01/26; Rent.inv.facil;5050404;"0,04";;"330,67";',
  '06/01/26; Pagamento boleto;5050404;;"25,00";"305,67";',
  ';Total;;"12.746,08";"-12.746,08";"1,00";',
].join('\r');

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

  it('importa CSV do Bradesco (colunas crédito/débito, ano 2 dígitos)', async () => {
    const email = emailFor('imp-bradesco');
    const reg = await register('Imp Bradesco', email, `Família Imp Bradesco ${suffix}`);
    const tokens = reg.body as TokensResponse;
    const meRes = await me(tokens.accessToken);
    const family = (meRes.body as MeResponse).familyId;
    createdFamilies.push(family);

    const account = await createAccount(tokens.accessToken, 'Conta Bradesco');
    const accountId = (account.body as { id: string }).id;

    const upload = await request(app.getHttpServer())
      .post('/api/v1/imports')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .field('accountId', accountId)
      .attach('file', Buffer.from(BRADESCO_CSV_SAMPLE, 'latin1'), 'bradesco.csv');

    expect(upload.status).toBe(201);
    const imported = upload.body as { id: string; status: string; transactionCount: number };
    expect(imported.status).toBe('PROCESSED');
    expect(imported.transactionCount).toBe(3);

    const transactions = await prisma.transaction.findMany({ where: { documentId: imported.id } });
    const resgate = transactions.find((tx) => tx.description === 'resgate inv fac');
    const boleto = transactions.find((tx) => tx.description === 'pagamento boleto');
    expect(resgate?.amount.toString()).toBe('329.63');
    expect(resgate?.type).toBe('INCOME');
    expect(resgate?.date.toISOString().slice(0, 10)).toBe('2026-01-05');
    expect(boleto?.amount.toString()).toBe('-25');
    expect(boleto?.type).toBe('EXPENSE');
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