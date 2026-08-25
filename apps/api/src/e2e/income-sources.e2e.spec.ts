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
import { IncomeSourcesModule } from '../income-sources/income-sources.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

process.env.DATABASE_URL =
  'postgresql://gotardo_test:gotardo_test@localhost:5433/gotardo_test?schema=public';
process.env.JWT_ACCESS_SECRET = 'e2e-jwt-secret';
process.env.JWT_ACCESS_TTL = '15m';
process.env.JWT_REFRESH_TTL = '30d';

type TokensResponse = { accessToken: string; refreshToken: string };
type MeResponse = { id: string; email: string; role: string; familyId: string };
type AccountResponse = { id: string; name: string; balance: string };

type IncomeSourceResponse = {
  id: string;
  familyId: string;
  name: string;
  description: string | null;
  expectedAmount: string | null;
  isActive: boolean;
};

describe('Fontes de renda (e2e)', () => {
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

  const setupFamily = async (tag: string) => {
    const email = emailFor(tag);
    const reg = await register(tag, email, `Família ${tag} ${suffix}`);
    const tokens = reg.body as TokensResponse;
    const meRes = await me(tokens.accessToken);
    const familyId = (meRes.body as MeResponse).familyId;
    createdFamilies.push(familyId);
    return { token: tokens.accessToken, familyId };
  };

  const createAccount = async (token: string, name = 'Conta corrente'): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/accounts')
      .set('Authorization', `Bearer ${token}`)
      .send({ name, type: 'CHECKING' });
    return (res.body as AccountResponse).id;
  };

  const createIncomeSource = (token: string, body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post('/api/v1/income-sources')
      .set('Authorization', `Bearer ${token}`)
      .send(body);

  const getIncomeSource = (token: string, id: string) =>
    request(app.getHttpServer())
      .get(`/api/v1/income-sources/${id}`)
      .set('Authorization', `Bearer ${token}`);

  const listIncomeSources = (token: string) =>
    request(app.getHttpServer())
      .get('/api/v1/income-sources')
      .set('Authorization', `Bearer ${token}`);

  const updateIncomeSource = (token: string, id: string, body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .patch(`/api/v1/income-sources/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);

  const deleteIncomeSource = (token: string, id: string) =>
    request(app.getHttpServer())
      .delete(`/api/v1/income-sources/${id}`)
      .set('Authorization', `Bearer ${token}`);

  const createTransaction = (token: string, body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post('/api/v1/transactions')
      .set('Authorization', `Bearer ${token}`)
      .send(body);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PrismaModule,
        AuthModule,
        AccountsModule,
        IncomeSourcesModule,
        TransactionsModule,
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
      prisma.incomeSource.deleteMany({ where: { familyId: { in: createdFamilies } } }),
      prisma.account.deleteMany({ where: { familyId: { in: createdFamilies } } }),
      prisma.notification.deleteMany({ where: { familyId: { in: createdFamilies } } }),
      prisma.refreshToken.deleteMany({
        where: { user: { familyId: { in: createdFamilies } } },
      }),
      prisma.user.deleteMany({ where: { familyId: { in: createdFamilies } } }),
      prisma.family.deleteMany({ where: { id: { in: createdFamilies } } }),
    ]);
    await app.close();
  });

  it('cria, lista, busca, atualiza e remove uma fonte de renda', async () => {
    const { token } = await setupFamily('crud');

    const created = await createIncomeSource(token, {
      name: 'Salário CLT',
      description: 'Salário mensal da empresa X',
      expectedAmount: 5000,
    });
    expect(created.status).toBe(201);
    const source = created.body as IncomeSourceResponse;
    expect(source.name).toBe('Salário CLT');
    expect(source.description).toBe('Salário mensal da empresa X');
    expect(source.expectedAmount).toBe('5000');
    expect(source.isActive).toBe(true);

    const fetched = await getIncomeSource(token, source.id);
    expect(fetched.status).toBe(200);
    expect((fetched.body as IncomeSourceResponse).id).toBe(source.id);

    const list = await listIncomeSources(token);
    expect(list.status).toBe(200);
    expect((list.body as IncomeSourceResponse[]).some((s) => s.id === source.id)).toBe(true);

    const updated = await updateIncomeSource(token, source.id, {
      name: 'Salário CLT (atualizado)',
      isActive: false,
    });
    expect(updated.status).toBe(200);
    const updatedBody = updated.body as IncomeSourceResponse;
    expect(updatedBody.name).toBe('Salário CLT (atualizado)');
    expect(updatedBody.isActive).toBe(false);

    const removed = await deleteIncomeSource(token, source.id);
    expect(removed.status).toBe(204);

    const afterDelete = await getIncomeSource(token, source.id);
    expect(afterDelete.status).toBe(404);

    const listAfterDelete = await listIncomeSources(token);
    expect((listAfterDelete.body as IncomeSourceResponse[]).some((s) => s.id === source.id)).toBe(
      false,
    );
  });

  it('família diferente não consegue ver, atualizar ou remover fonte de renda de outra família (404)', async () => {
    const owner = await setupFamily('tenant-a');
    const intruder = await setupFamily('tenant-b');

    const created = await createIncomeSource(owner.token, { name: 'Aluguel de imóvel' });
    const sourceId = (created.body as IncomeSourceResponse).id;

    const asOwner = await getIncomeSource(owner.token, sourceId);
    expect(asOwner.status).toBe(200);

    const asIntruder = await getIncomeSource(intruder.token, sourceId);
    expect(asIntruder.status).toBe(404);

    const updateAsIntruder = await updateIncomeSource(intruder.token, sourceId, {
      name: 'Hackeado',
    });
    expect(updateAsIntruder.status).toBe(404);

    const deleteAsIntruder = await deleteIncomeSource(intruder.token, sourceId);
    expect(deleteAsIntruder.status).toBe(404);

    // A fonte da família dona segue intacta.
    const stillThere = await getIncomeSource(owner.token, sourceId);
    expect(stillThere.status).toBe(200);
  });

  it('rejeita transação com incomeSourceId de outra família (404)', async () => {
    const owner = await setupFamily('tx-tenant-a');
    const intruder = await setupFamily('tx-tenant-b');

    const foreignSource = await createIncomeSource(owner.token, { name: 'Fonte da família A' });
    const foreignSourceId = (foreignSource.body as IncomeSourceResponse).id;

    const intruderAccountId = await createAccount(intruder.token, 'Conta B');

    const rejected = await createTransaction(intruder.token, {
      accountId: intruderAccountId,
      incomeSourceId: foreignSourceId,
      description: 'Tentativa de usar fonte alheia',
      amount: 1000,
      type: 'INCOME',
      status: 'PENDING',
      date: new Date().toISOString(),
    });
    expect(rejected.status).toBe(404);

    // Com uma fonte da própria família, a transação é aceita normalmente.
    const ownSource = await createIncomeSource(intruder.token, { name: 'Fonte da família B' });
    const ownSourceId = (ownSource.body as IncomeSourceResponse).id;

    const accepted = await createTransaction(intruder.token, {
      accountId: intruderAccountId,
      incomeSourceId: ownSourceId,
      description: 'Uso legítimo da própria fonte',
      amount: 1000,
      type: 'INCOME',
      status: 'PENDING',
      date: new Date().toISOString(),
    });
    expect(accepted.status).toBe(201);
    expect((accepted.body as { incomeSourceId: string | null }).incomeSourceId).toBe(ownSourceId);
  });
});
