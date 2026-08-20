import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import request from 'supertest';
import { createServer, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { PrismaModule, PrismaService } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AccountsModule } from '../accounts/accounts.module';
import { CategoriesModule } from '../categories/categories.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { ImportsModule } from '../imports/imports.module';
import { StorageModule } from '../storage/storage.module';
import { ReportsModule } from '../reports/reports.module';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

process.env.DATABASE_URL = 'postgresql://gotardo:gotardo@localhost:5432/gotardo_test?schema=public';
process.env.JWT_ACCESS_SECRET = 'e2e-jwt-secret';
process.env.JWT_ACCESS_TTL = '15m';
process.env.JWT_REFRESH_TTL = '30d';

const RULES: Array<[string, string]> = [
  ['padaria', 'Alimentação'],
  ['supermercado', 'Alimentação'],
  ['posto', 'Transporte'],
  ['aluguel', 'Moradia'],
];

type TokensResponse = { accessToken: string; refreshToken: string };

describe('Sugestão de categoria via ML (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let stub: Server;
  let mlPort: number;
  const suffix = randomUUID().slice(0, 8);
  const domain = `${suffix}.e2e.gotardo`;
  const createdFamilies: string[] = [];

  const register = (name: string, email: string, familyName: string) =>
    request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ name, email, password: 'senha-segura-123', familyName });

  const me = (token: string) =>
    request(app.getHttpServer()).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    stub = createServer((req, res) => {
      let body = '';
      req.on('data', (chunk: Buffer) => {
        body += chunk.toString();
      });
      req.on('end', () => {
        if (req.url?.includes('/anomalies')) {
          try {
            const payload = JSON.parse(body) as {
              transactions?: Array<{ id: string; amount: string }>;
            };
            const anomalies = (payload.transactions ?? []).map((tx) => {
              const value = Math.abs(Number(tx.amount));
              const isAnomaly = Number(tx.amount) < 0 && value >= 5000;
              return {
                id: tx.id,
                isAnomaly,
                reason: isAnomaly ? `Valor ${value} muito acima do padrão` : null,
              };
            });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ anomalies }));
          } catch {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ anomalies: [] }));
          }
          return;
        }
        let category: string | null = null;
        try {
          const payload = JSON.parse(body) as { description?: string };
          const normalized = (payload.description ?? '').toLowerCase();
          for (const [keyword, label] of RULES) {
            if (normalized.includes(keyword)) {
              category = label;
              break;
            }
          }
        } catch {
          category = null;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ category, confidence: category ? 1 : 0, matched: category }));
      });
    });
    await new Promise<void>((resolve) => {
      stub.listen(0, '127.0.0.1', () => {
        const address = stub.address();
        if (address && typeof address !== 'string') {
          mlPort = address.port;
        }
        resolve();
      });
    });
    process.env.ML_URL = `http://127.0.0.1:${mlPort}`;

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PrismaModule,
        AuthModule,
        AccountsModule,
        CategoriesModule,
        TransactionsModule,
        ImportsModule,
        StorageModule,
        ReportsModule,
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
    delete process.env.ML_URL;
    stub.close();
    await prisma.$transaction([
      prisma.transaction.deleteMany({ where: { familyId: { in: createdFamilies } } }),
      prisma.document.deleteMany({ where: { familyId: { in: createdFamilies } } }),
      prisma.category.deleteMany({ where: { familyId: { in: createdFamilies } } }),
      prisma.account.deleteMany({ where: { familyId: { in: createdFamilies } } }),
      prisma.refreshToken.deleteMany({
        where: { user: { familyId: { in: createdFamilies } } },
      }),
      prisma.user.deleteMany({ where: { familyId: { in: createdFamilies } } }),
      prisma.family.deleteMany({ where: { id: { in: createdFamilies } } }),
    ]);
    await app.close();
  });

  it('sugere categoria em transação manual e permite aplicar', async () => {
    const email = `sug-${suffix}@${domain}`;
    const reg = await register('Sug', email, `Família Sug ${suffix}`);
    const tokens = reg.body as TokensResponse;
    const meRes = await me(tokens.accessToken);
    const family = (meRes.body as { familyId: string }).familyId;
    createdFamilies.push(family);

    const account = await request(app.getHttpServer())
      .post('/api/v1/accounts')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .send({ name: 'Conta Sug', type: 'CHECKING' });
    const accountId = (account.body as { id: string }).id;

    const category = await request(app.getHttpServer())
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .send({ name: 'Alimentação' });
    const categoryId = (category.body as { id: string }).id;

    const created = await request(app.getHttpServer())
      .post('/api/v1/transactions')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .send({
        accountId,
        description: 'PADARIA CENTRAL',
        amount: 18.5,
        type: 'EXPENSE',
        status: 'PENDING',
        date: '2026-08-15T12:00:00.000Z',
      });

    expect(created.status).toBe(201);
    const body = created.body as {
      id: string;
      suggestedCategory: { id: string; name: string } | null;
      category: { id: string; name: string } | null;
    };
    expect(body.suggestedCategory?.name).toBe('Alimentação');
    expect(body.suggestedCategory?.id).toBe(categoryId);

    const applied = await request(app.getHttpServer())
      .patch(`/api/v1/transactions/${body.id}`)
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .send({ categoryId });
    expect(applied.status).toBe(200);
    const appliedBody = applied.body as { category: { id: string } | null };
    expect(appliedBody.category?.id).toBe(categoryId);
  });

  it('sugere categoria em transações importadas', async () => {
    const email = `sugimp-${suffix}@${domain}`;
    const reg = await register('SugImp', email, `Família SugImp ${suffix}`);
    const tokens = reg.body as TokensResponse;
    const meRes = await me(tokens.accessToken);
    const family = (meRes.body as { familyId: string }).familyId;
    createdFamilies.push(family);

    await request(app.getHttpServer())
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .send({ name: 'Alimentação' });

    const account = await request(app.getHttpServer())
      .post('/api/v1/accounts')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .send({ name: 'Conta SugImp', type: 'CHECKING' });
    const accountId = (account.body as { id: string }).id;

    const csv = ['data;descricao;valor', '01/08/2026;PADARIA CENTRAL;-18,50'].join('\n');
    const upload = await request(app.getHttpServer())
      .post('/api/v1/imports')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .field('accountId', accountId)
      .attach('file', Buffer.from(csv, 'utf8'), 'extrato.csv');

    expect(upload.status).toBe(201);
    const imported = upload.body as { id: string; transactionCount: number };
    expect(imported.transactionCount).toBe(1);

    const tx = await prisma.transaction.findFirst({
      where: { documentId: imported.id },
      include: { suggestedCategory: { select: { name: true } } },
    });
    expect(tx?.suggestedCategory?.name).toBe('Alimentação');
  });

  it('marca transações anômalas via relatório', async () => {
    const email = `suganom-${suffix}@${domain}`;
    const reg = await register('SugAnom', email, `Família SugAnom ${suffix}`);
    const tokens = reg.body as TokensResponse;
    const meRes = await me(tokens.accessToken);
    const family = (meRes.body as { familyId: string }).familyId;
    createdFamilies.push(family);

    const account = await request(app.getHttpServer())
      .post('/api/v1/accounts')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .send({ name: 'Conta Anom', type: 'CHECKING' });
    const accountId = (account.body as { id: string }).id;

    const create = (description: string, amount: number) =>
      request(app.getHttpServer())
        .post('/api/v1/transactions')
        .set('Authorization', `Bearer ${tokens.accessToken}`)
        .send({
          accountId,
          description,
          amount,
          type: 'EXPENSE',
          status: 'CONFIRMED',
          date: '2026-08-15T12:00:00.000Z',
        });

    const rows: Array<[string, number]> = [
      ['Mercado', 120],
      ['Mercado', 130],
      ['Mercado', 110],
      ['Mercado', 125],
      ['Compra grande', 50000],
    ];
    for (const [desc, amount] of rows) {
      const res = await create(desc, amount);
      expect(res.status).toBe(201);
    }

    const report = await request(app.getHttpServer())
      .get('/api/v1/reports/anomalies?from=2026-08-01&to=2026-08-31')
      .set('Authorization', `Bearer ${tokens.accessToken}`);

    expect(report.status).toBe(200);
    const flagged = (report.body as Array<{ isAnomaly: boolean }>).filter((row) => row.isAnomaly);
    expect(flagged).toHaveLength(1);
  });
});
