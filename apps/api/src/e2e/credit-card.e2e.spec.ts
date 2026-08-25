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
import { CategoriesModule } from '../categories/categories.module';
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

describe('Cartões de crédito: fatura e parcelamento (e2e)', () => {
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

  const createCreditCard = (
    token: string,
    overrides: Partial<{
      name: string;
      billingDay: number;
      dueDay: number;
      creditLimit: number;
    }> = {},
  ) =>
    request(app.getHttpServer())
      .post('/api/v1/accounts')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: overrides.name ?? 'Cartão',
        type: 'CREDIT_CARD',
        billingDay: overrides.billingDay ?? 10,
        dueDay: overrides.dueDay ?? 5,
        creditLimit: overrides.creditLimit ?? 1000,
      });

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
        CategoriesModule,
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
      prisma.category.deleteMany({ where: { familyId: { in: createdFamilies } } }),
      prisma.account.deleteMany({ where: { familyId: { in: createdFamilies } } }),
      // Ver comentário equivalente em goals.e2e.spec.ts: o checker global de
      // notificações (E3.2) pode ter criado notificações para estes usuários.
      prisma.notification.deleteMany({ where: { familyId: { in: createdFamilies } } }),
      prisma.refreshToken.deleteMany({
        where: { user: { familyId: { in: createdFamilies } } },
      }),
      prisma.user.deleteMany({ where: { familyId: { in: createdFamilies } } }),
      prisma.family.deleteMany({ where: { id: { in: createdFamilies } } }),
    ]);
    await app.close();
  });

  it('cria cartão de crédito com creditLimit/billingDay/dueDay', async () => {
    const { token } = await setupFamily('cc-create');
    const res = await createCreditCard(token, { billingDay: 10, dueDay: 5, creditLimit: 2500 });
    expect(res.status).toBe(201);
    const body = res.body as {
      type: string;
      creditLimit: string;
      billingDay: number;
      dueDay: number;
    };
    expect(body.type).toBe('CREDIT_CARD');
    expect(body.creditLimit).toBe('2500');
    expect(body.billingDay).toBe(10);
    expect(body.dueDay).toBe(5);
  });

  it('calcula a fatura incluindo/excluindo transações pela janela de fechamento', async () => {
    const { token } = await setupFamily('cc-invoice');
    const account = await createCreditCard(token, { billingDay: 10, dueDay: 5 });
    const accountId = (account.body as { id: string }).id;

    // Fora da janela (antes do início): fatura anterior.
    const before = await createTransaction(token, {
      accountId,
      description: 'Antes da janela',
      amount: 20,
      type: 'EXPENSE',
      date: '2026-07-05T12:00:00.000Z',
    });
    // Dentro da janela (dia seguinte ao fechamento do mês anterior).
    const insideStart = await createTransaction(token, {
      accountId,
      description: 'Início da janela',
      amount: 100,
      type: 'EXPENSE',
      date: '2026-07-11T12:00:00.000Z',
    });
    // Dentro da janela, no próprio dia de fechamento (inclusive).
    const insideEnd = await createTransaction(token, {
      accountId,
      description: 'Fechamento (inclusive)',
      amount: 50,
      type: 'EXPENSE',
      date: '2026-08-10T23:00:00.000Z',
    });
    // Fora da janela (depois do fechamento): próxima fatura.
    const after = await createTransaction(token, {
      accountId,
      description: 'Depois do fechamento',
      amount: 30,
      type: 'EXPENSE',
      date: '2026-08-11T00:00:00.000Z',
    });
    // Estorno (INCOME) dentro da janela reduz o total.
    const refund = await createTransaction(token, {
      accountId,
      description: 'Estorno',
      amount: 10,
      type: 'INCOME',
      date: '2026-08-01T12:00:00.000Z',
    });
    for (const created of [before, insideStart, insideEnd, after, refund]) {
      expect(created.status).toBe(201);
    }

    const invoice = await request(app.getHttpServer())
      .get(`/api/v1/accounts/${accountId}/invoice`)
      .query({ period: '2026-08' })
      .set('Authorization', `Bearer ${token}`);

    expect(invoice.status).toBe(200);
    const body = invoice.body as {
      accountId: string;
      period: string;
      closingDate: string;
      dueDate: string;
      transactions: Array<{ description: string }>;
      total: string;
    };
    expect(body.accountId).toBe(accountId);
    expect(body.period).toBe('2026-08');
    expect(body.closingDate.slice(0, 10)).toBe('2026-08-10');
    expect(body.dueDate.slice(0, 10)).toBe('2026-09-05');
    const descriptions = body.transactions.map((tx) => tx.description).sort();
    expect(descriptions).toEqual(['Estorno', 'Fechamento (inclusive)', 'Início da janela'].sort());
    // total = 100 + 50 (expenses) - 10 (estorno/income) = 140
    expect(body.total).toBe('140');
  });

  it('vencimento cruza o ano quando o fechamento é em dezembro', async () => {
    const { token } = await setupFamily('cc-dec');
    const account = await createCreditCard(token, { billingDay: 28, dueDay: 5 });
    const accountId = (account.body as { id: string }).id;

    const invoice = await request(app.getHttpServer())
      .get(`/api/v1/accounts/${accountId}/invoice`)
      .query({ period: '2026-12' })
      .set('Authorization', `Bearer ${token}`);

    expect(invoice.status).toBe(200);
    const body = invoice.body as { closingDate: string; dueDate: string };
    expect(body.closingDate.slice(0, 10)).toBe('2026-12-28');
    expect(body.dueDate.slice(0, 10)).toBe('2027-01-05');
  });

  it('404 para fatura de conta que não é cartão; 400 quando sem billingDay/dueDay configurado', async () => {
    const { token } = await setupFamily('cc-not-card');
    const checking = await createCheckingAccount(token, 'Conta corrente');
    const checkingId = (checking.body as { id: string }).id;

    const notCard = await request(app.getHttpServer())
      .get(`/api/v1/accounts/${checkingId}/invoice`)
      .set('Authorization', `Bearer ${token}`);
    expect(notCard.status).toBe(404);

    const unconfigured = await request(app.getHttpServer())
      .post('/api/v1/accounts')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Cartão sem config', type: 'CREDIT_CARD' });
    const unconfiguredId = (unconfigured.body as { id: string }).id;
    const invoiceRes = await request(app.getHttpServer())
      .get(`/api/v1/accounts/${unconfiguredId}/invoice`)
      .set('Authorization', `Bearer ${token}`);
    expect(invoiceRes.status).toBe(400);
  });

  it('família diferente não consegue ver a fatura do cartão de outra família (404)', async () => {
    const owner = await setupFamily('cc-tenant-a');
    const intruder = await setupFamily('cc-tenant-b');
    const account = await createCreditCard(owner.token, { billingDay: 10, dueDay: 5 });
    const accountId = (account.body as { id: string }).id;

    const asOwner = await request(app.getHttpServer())
      .get(`/api/v1/accounts/${accountId}/invoice`)
      .set('Authorization', `Bearer ${owner.token}`);
    expect(asOwner.status).toBe(200);

    const asIntruder = await request(app.getHttpServer())
      .get(`/api/v1/accounts/${accountId}/invoice`)
      .set('Authorization', `Bearer ${intruder.token}`);
    expect(asIntruder.status).toBe(404);

    const getAccount = await request(app.getHttpServer())
      .get(`/api/v1/accounts/${accountId}`)
      .set('Authorization', `Bearer ${intruder.token}`);
    expect(getAccount.status).toBe(404);
  });

  it('parcela uma compra em N transações PENDING com valores somando o total original', async () => {
    const { token } = await setupFamily('cc-installments');
    const account = await createCheckingAccount(token, 'Conta parcelas');
    const accountId = (account.body as { id: string }).id;

    const created = await createTransaction(token, {
      accountId,
      description: 'Compra parcelada',
      amount: 100,
      type: 'EXPENSE',
      date: '2026-08-15T12:00:00.000Z',
      installments: 3,
    });
    expect(created.status).toBe(201);
    const first = created.body as {
      id: string;
      status: string;
      installmentNumber: number;
      installmentTotal: number;
      installmentGroupId: string;
      amount: string;
    };
    expect(first.status).toBe('PENDING');
    expect(first.installmentNumber).toBe(1);
    expect(first.installmentTotal).toBe(3);
    expect(first.installmentGroupId).toBeTruthy();

    const all = await prisma.transaction.findMany({
      where: { installmentGroupId: first.installmentGroupId },
      orderBy: { installmentNumber: 'asc' },
    });
    expect(all).toHaveLength(3);
    expect(all.every((tx) => tx.status === 'PENDING')).toBe(true);
    expect(all.map((tx) => tx.installmentNumber)).toEqual([1, 2, 3]);
    expect(all.map((tx) => tx.installmentTotal)).toEqual([3, 3, 3]);

    const sum = all.reduce((acc, tx) => acc + Number(tx.amount), 0);
    expect(Math.round(sum * 100) / 100).toBe(100);
    // resto do arredondamento vai para a última parcela
    expect(all[0]?.amount.toString()).toBe('33.33');
    expect(all[1]?.amount.toString()).toBe('33.33');
    expect(all[2]?.amount.toString()).toBe('33.34');

    // datas espaçadas em um mês
    expect(all[0]?.date.toISOString().slice(0, 10)).toBe('2026-08-15');
    expect(all[1]?.date.toISOString().slice(0, 10)).toBe('2026-09-15');
    expect(all[2]?.date.toISOString().slice(0, 10)).toBe('2026-10-15');
  });

  it('editar categoria de uma parcela PENDING propaga para irmãs PENDING mas não para CONFIRMED', async () => {
    const { token } = await setupFamily('cc-cascade');
    const account = await createCheckingAccount(token, 'Conta cascade');
    const accountId = (account.body as { id: string }).id;

    const catA = await request(app.getHttpServer())
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Categoria A' });
    const catB = await request(app.getHttpServer())
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Categoria B' });
    const catAId = (catA.body as { id: string }).id;
    const catBId = (catB.body as { id: string }).id;

    const created = await createTransaction(token, {
      accountId,
      description: 'Compra em 3x',
      amount: 90,
      type: 'EXPENSE',
      date: '2026-08-15T12:00:00.000Z',
      installments: 3,
      categoryId: catAId,
    });
    const first = created.body as { id: string; installmentGroupId: string };

    const siblings = await prisma.transaction.findMany({
      where: { installmentGroupId: first.installmentGroupId },
      orderBy: { installmentNumber: 'asc' },
    });
    const second = siblings[1]!;
    const third = siblings[2]!;

    // Confirma a segunda parcela (não deve mais receber propagação).
    const confirmSecond = await request(app.getHttpServer())
      .patch(`/api/v1/transactions/${second.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'CONFIRMED' });
    expect(confirmSecond.status).toBe(200);

    // Edita categoria + descrição da primeira parcela (ainda PENDING).
    const editFirst = await request(app.getHttpServer())
      .patch(`/api/v1/transactions/${first.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ categoryId: catBId, description: 'Compra em 3x (editada)' });
    expect(editFirst.status).toBe(200);

    const updatedSecond = await prisma.transaction.findFirstOrThrow({ where: { id: second.id } });
    const updatedThird = await prisma.transaction.findFirstOrThrow({ where: { id: third.id } });

    // Terceira parcela (PENDING) recebeu a propagação.
    expect(updatedThird.categoryId).toBe(catBId);
    expect(updatedThird.description).toBe('Compra em 3x (editada)');
    expect(updatedThird.status).toBe('PENDING');

    // Segunda parcela (CONFIRMED) não foi tocada.
    expect(updatedSecond.categoryId).toBe(catAId);
    expect(updatedSecond.description).toBe('Compra em 3x');
    expect(updatedSecond.status).toBe('CONFIRMED');
  });

  it('parcelamento com compra em 31/jan gera datas 31/jan, 28/fev e 31/mar (sem pular fevereiro)', async () => {
    const { token } = await setupFamily('cc-eom');
    const account = await createCheckingAccount(token, 'Conta fim de mês');
    const accountId = (account.body as { id: string }).id;

    const created = await createTransaction(token, {
      accountId,
      description: 'Compra em 31/jan',
      amount: 300,
      type: 'EXPENSE',
      date: '2026-01-31T12:00:00.000Z',
      installments: 3,
    });
    expect(created.status).toBe(201);
    const first = created.body as { installmentGroupId: string };

    const all = await prisma.transaction.findMany({
      where: { installmentGroupId: first.installmentGroupId },
      orderBy: { installmentNumber: 'asc' },
    });
    expect(all).toHaveLength(3);
    // 2026 não é bissexto, então fevereiro tem 28 dias.
    expect(all.map((tx) => tx.date.toISOString().slice(0, 10))).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
    ]);
  });

  it('rejeita parcelamento cujo valor por parcela arredondaria para zero', async () => {
    const { token } = await setupFamily('cc-low-amount');
    const account = await createCheckingAccount(token, 'Conta valor baixo');
    const accountId = (account.body as { id: string }).id;

    const tooLow = await createTransaction(token, {
      accountId,
      description: 'Compra irrisória',
      amount: 0.01,
      type: 'EXPENSE',
      installments: 60,
    });
    expect(tooLow.status).toBe(400);

    // Caso limite: 60 centavos em 60 parcelas dá exatamente 1 centavo cada,
    // então deve ser aceito.
    const borderline = await createTransaction(token, {
      accountId,
      description: 'Compra no limite',
      amount: 0.6,
      type: 'EXPENSE',
      installments: 60,
    });
    expect(borderline.status).toBe(201);
    const first = borderline.body as { installmentGroupId: string };
    const all = await prisma.transaction.findMany({
      where: { installmentGroupId: first.installmentGroupId },
    });
    expect(all).toHaveLength(60);
    expect(all.every((tx) => tx.amount.toString() === '0.01')).toBe(true);
  });

  it('rejeita creditLimit acima do limite da coluna Decimal(12,2) com 400 (não 500)', async () => {
    const { token } = await setupFamily('cc-limit-overflow');
    const res = await createCreditCard(token, { creditLimit: 99999999999999 });
    expect(res.status).toBe(400);
  });
});
