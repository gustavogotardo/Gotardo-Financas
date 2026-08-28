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

describe('Transações: atribuição de membro (e2e)', () => {
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
    const { familyId, id: userId } = meRes.body as MeResponse;
    createdFamilies.push(familyId);
    return { token: tokens.accessToken, familyId, userId };
  };

  const createCheckingAccount = (token: string, name: string) =>
    request(app.getHttpServer())
      .post('/api/v1/accounts')
      .set('Authorization', `Bearer ${token}`)
      .send({ name, type: 'CHECKING' });

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

  it('cria transação pessoal (memberId de um membro da própria família) e inclui o membro na resposta', async () => {
    const { token, userId } = await setupFamily('member-own');
    const account = await createCheckingAccount(token, 'Conta pessoal');
    const accountId = (account.body as { id: string }).id;

    const created = await createTransaction(token, {
      accountId,
      description: 'Assinatura pessoal',
      amount: 30,
      type: 'EXPENSE',
      memberId: userId,
    });

    expect(created.status).toBe(201);
    const body = created.body as { memberId: string; member: { id: string; name: string } };
    expect(body.memberId).toBe(userId);
    expect(body.member.id).toBe(userId);
  });

  it('transação sem memberId é conjunta (memberId nulo)', async () => {
    const { token } = await setupFamily('member-shared');
    const account = await createCheckingAccount(token, 'Conta conjunta');
    const accountId = (account.body as { id: string }).id;

    const created = await createTransaction(token, {
      accountId,
      description: 'Aluguel',
      amount: 1500,
      type: 'EXPENSE',
    });

    expect(created.status).toBe(201);
    const body = created.body as { memberId: string | null; member: unknown };
    expect(body.memberId).toBeNull();
    expect(body.member).toBeNull();
  });

  it('rejeita memberId de outra família (404)', async () => {
    const owner = await setupFamily('member-tenant-a');
    const intruder = await setupFamily('member-tenant-b');
    const account = await createCheckingAccount(owner.token, 'Conta tenant a');
    const accountId = (account.body as { id: string }).id;

    const created = await createTransaction(owner.token, {
      accountId,
      description: 'Compra',
      amount: 10,
      type: 'EXPENSE',
      memberId: intruder.userId,
    });

    expect(created.status).toBe(404);
  });

  it('edita memberId (atribui e depois limpa de volta para conjunta)', async () => {
    const { token, userId } = await setupFamily('member-edit');
    const account = await createCheckingAccount(token, 'Conta edição');
    const accountId = (account.body as { id: string }).id;

    const created = await createTransaction(token, {
      accountId,
      description: 'Streaming',
      amount: 40,
      type: 'EXPENSE',
    });
    const id = (created.body as { id: string }).id;

    const assigned = await request(app.getHttpServer())
      .patch(`/api/v1/transactions/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ memberId: userId });
    expect(assigned.status).toBe(200);
    expect((assigned.body as { memberId: string }).memberId).toBe(userId);

    const cleared = await request(app.getHttpServer())
      .patch(`/api/v1/transactions/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ memberId: '' });
    expect(cleared.status).toBe(200);
    expect((cleared.body as { memberId: string | null }).memberId).toBeNull();
  });

  it('filtra a listagem por memberId', async () => {
    const { token, userId } = await setupFamily('member-filter');
    const account = await createCheckingAccount(token, 'Conta filtro');
    const accountId = (account.body as { id: string }).id;

    await createTransaction(token, {
      accountId,
      description: 'Pessoal',
      amount: 20,
      type: 'EXPENSE',
      memberId: userId,
    });
    await createTransaction(token, {
      accountId,
      description: 'Conjunta',
      amount: 80,
      type: 'EXPENSE',
    });

    const filtered = await request(app.getHttpServer())
      .get('/api/v1/transactions')
      .query({ memberId: userId })
      .set('Authorization', `Bearer ${token}`);

    expect(filtered.status).toBe(200);
    const list = filtered.body as Array<{ description: string; memberId: string | null }>;
    expect(list).toHaveLength(1);
    expect(list[0]?.description).toBe('Pessoal');
  });
});
