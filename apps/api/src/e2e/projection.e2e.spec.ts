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
import { DebtsModule } from '../debts/debts.module';
import { GoalsModule } from '../goals/goals.module';
import { ReportsModule } from '../reports/reports.module';
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
type GoalResponse = { id: string; status: string };
type DebtResponse = { id: string; status: string };

type ProjectionMonth = {
  month: string;
  income: string;
  expense: string;
  savingsCapacity: string;
  balance: string;
};

type ProjectionResponse = {
  scenario: string;
  startingBalance: string;
  goalMonthlyContribution: string;
  debtInstallmentTotal: string;
  months: ProjectionMonth[];
};

describe('Motor de projeção (e2e)', () => {
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

  const createTransaction = (token: string, body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post('/api/v1/transactions')
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'CONFIRMED', ...body });

  const createGoal = async (
    token: string,
    body: Record<string, unknown>,
  ): Promise<GoalResponse> => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/goals')
      .set('Authorization', `Bearer ${token}`)
      .send(body);
    return res.body as GoalResponse;
  };

  const updateGoal = (token: string, id: string, body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .patch(`/api/v1/goals/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);

  const createDebt = async (
    token: string,
    body: Record<string, unknown>,
  ): Promise<DebtResponse> => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/debts')
      .set('Authorization', `Bearer ${token}`)
      .send(body);
    return res.body as DebtResponse;
  };

  const updateDebt = (token: string, id: string, body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .patch(`/api/v1/debts/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);

  const getProjection = (token: string, query: Record<string, string | number> = {}) =>
    request(app.getHttpServer())
      .get('/api/v1/reports/projection')
      .query(query)
      .set('Authorization', `Bearer ${token}`);

  /** Start-of-month date, `monthsAgo` calendar months before "now" (0 = current month). */
  const monthDate = (monthsAgo: number, day = 10): Date => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() - monthsAgo, day, 12, 0, 0);
  };

  /** Same UTC "YYYY-MM after now" label convention used by `ReportsService.projection`. */
  const monthLabel = (monthsFromNow: number): string => {
    const now = new Date();
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + monthsFromNow, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  };

  /** Seeds a family with a clean trailing-3-month history: income 3000 / expense 1000 per month. */
  const seedTrailingHistory = async (token: string, familyId: string): Promise<void> => {
    const accountId = await createAccount(token);
    await prisma.family.update({ where: { id: familyId }, data: { createdAt: monthDate(2) } });
    for (let monthsAgo = 0; monthsAgo <= 2; monthsAgo++) {
      await createTransaction(token, {
        accountId,
        description: 'Salário',
        amount: 3000,
        type: 'INCOME',
        date: monthDate(monthsAgo).toISOString(),
      });
      await createTransaction(token, {
        accountId,
        description: 'Contas fixas',
        amount: 1000,
        type: 'EXPENSE',
        date: monthDate(monthsAgo).toISOString(),
      });
    }
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PrismaModule,
        AuthModule,
        AccountsModule,
        TransactionsModule,
        DebtsModule,
        GoalsModule,
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
    await prisma.$transaction([
      prisma.transaction.deleteMany({ where: { familyId: { in: createdFamilies } } }),
      prisma.debtPayment.deleteMany({ where: { debt: { familyId: { in: createdFamilies } } } }),
      prisma.debt.deleteMany({ where: { familyId: { in: createdFamilies } } }),
      prisma.financialGoalAllocation.deleteMany({
        where: { goal: { familyId: { in: createdFamilies } } },
      }),
      prisma.financialGoal.deleteMany({ where: { familyId: { in: createdFamilies } } }),
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

  it('cenário BASE produz a sequência exata de income/expense/balance esperada à mão', async () => {
    const { token, familyId } = await setupFamily('base-exact');
    await seedTrailingHistory(token, familyId);

    // avgIncome = 3000, avgExpense = 1000 (trailing 3 meses).
    // startingBalance = saldo da conta = 3 x (3000 - 1000) = 6000.
    await createGoal(token, { name: 'Reserva', targetAmount: 10000, monthlyContribution: 200 });
    await createDebt(token, { name: 'Empréstimo', totalAmount: 5000, installmentAmount: 100 });

    const res = await getProjection(token, { scenario: 'BASE', months: 2 });
    expect(res.status).toBe(200);
    const body = res.body as ProjectionResponse;

    expect(body.scenario).toBe('BASE');
    expect(body.startingBalance).toBe('6000.00');
    expect(body.goalMonthlyContribution).toBe('200.00');
    expect(body.debtInstallmentTotal).toBe('100.00');
    expect(body.months).toHaveLength(2);

    // BASE: incomeMultiplier=1, expenseMultiplier=1, inflationDelta=0, sem
    // incomeGrowthRate/baseMonthlyInflation informados (default 0) -> income
    // e expense constantes em 3000/1000 em todos os meses.
    // m=1: balance = 6000 - 200 - 100 + 3000 - 1000 = 7700.
    // m=2: balance = 7700 - 200 - 100 + 3000 - 1000 = 9400.
    expect(body.months[0]).toEqual({
      month: monthLabel(1),
      income: '3000.00',
      expense: '1000.00',
      savingsCapacity: '2000.00',
      balance: '7700.00',
    });
    expect(body.months[1]).toEqual({
      month: monthLabel(2),
      income: '3000.00',
      expense: '1000.00',
      savingsCapacity: '2000.00',
      balance: '9400.00',
    });
  });

  it('cenário CONSERVATIVE produz saldo final menor que OPTIMISTIC para os mesmos dados', async () => {
    const { token, familyId } = await setupFamily('scenario-compare');
    await seedTrailingHistory(token, familyId);
    await createGoal(token, { name: 'Reserva', targetAmount: 10000, monthlyContribution: 200 });
    await createDebt(token, { name: 'Empréstimo', totalAmount: 5000, installmentAmount: 100 });

    const conservative = await getProjection(token, { scenario: 'CONSERVATIVE', months: 6 });
    const base = await getProjection(token, { scenario: 'BASE', months: 6 });
    const optimistic = await getProjection(token, { scenario: 'OPTIMISTIC', months: 6 });

    expect(conservative.status).toBe(200);
    expect(base.status).toBe(200);
    expect(optimistic.status).toBe(200);

    const conservativeBody = conservative.body as ProjectionResponse;
    const baseBody = base.body as ProjectionResponse;
    const optimisticBody = optimistic.body as ProjectionResponse;

    const lastConservative = Number(conservativeBody.months.at(-1)?.balance);
    const lastBase = Number(baseBody.months.at(-1)?.balance);
    const lastOptimistic = Number(optimisticBody.months.at(-1)?.balance);

    expect(lastConservative).toBeLessThan(lastBase);
    expect(lastBase).toBeLessThan(lastOptimistic);
  });

  it('months tem default 6 quando omitido, e retorna exatamente 12 entradas quando months=12', async () => {
    const { token, familyId } = await setupFamily('months-defaults');
    await seedTrailingHistory(token, familyId);

    const defaultRes = await getProjection(token);
    expect(defaultRes.status).toBe(200);
    expect((defaultRes.body as ProjectionResponse).months).toHaveLength(6);

    const twelveRes = await getProjection(token, { months: 12 });
    expect(twelveRes.status).toBe(200);
    expect((twelveRes.body as ProjectionResponse).months).toHaveLength(12);
  });

  it('rejeita months fora do intervalo permitido (1-12)', async () => {
    const { token } = await setupFamily('months-out-of-range');
    const res = await getProjection(token, { months: 13 });
    expect(res.status).toBe(400);
  });

  it('não vaza renda/metas/dívidas de outra família na projeção (isolamento multi-tenant)', async () => {
    const familyA = await setupFamily('tenant-a-projection');
    const familyB = await setupFamily('tenant-b-projection');

    await seedTrailingHistory(familyA.token, familyA.familyId);
    await createGoal(familyA.token, {
      name: 'Reserva A',
      targetAmount: 10000,
      monthlyContribution: 200,
    });
    await createDebt(familyA.token, {
      name: 'Empréstimo A',
      totalAmount: 5000,
      installmentAmount: 100,
    });

    // Family B has no accounts, transactions, goals, or debts at all.
    const resA = await getProjection(familyA.token, { months: 1 });
    const resB = await getProjection(familyB.token, { months: 1 });

    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);

    const bodyA = resA.body as ProjectionResponse;
    const bodyB = resB.body as ProjectionResponse;

    expect(bodyA.startingBalance).toBe('6000.00');
    expect(bodyA.goalMonthlyContribution).toBe('200.00');
    expect(bodyA.debtInstallmentTotal).toBe('100.00');

    // Family B must not see any of Family A's income/goals/debts.
    expect(bodyB.startingBalance).toBe('0.00');
    expect(bodyB.goalMonthlyContribution).toBe('0.00');
    expect(bodyB.debtInstallmentTotal).toBe('0.00');
    expect(bodyB.months[0]).toEqual({
      month: monthLabel(1),
      income: '0.00',
      expense: '0.00',
      savingsCapacity: '0.00',
      balance: '0.00',
    });
  });

  it('soma monthlyContribution/installmentAmount apenas de metas/dívidas ACTIVE', async () => {
    const { token, familyId } = await setupFamily('active-only');
    await seedTrailingHistory(token, familyId);

    const activeGoal = await createGoal(token, {
      name: 'Meta ativa',
      targetAmount: 10000,
      monthlyContribution: 200,
    });
    const pausedGoal = await createGoal(token, {
      name: 'Meta pausada',
      targetAmount: 10000,
      monthlyContribution: 9999,
    });
    await updateGoal(token, pausedGoal.id, { status: 'PAUSED' });

    const activeDebt = await createDebt(token, {
      name: 'Dívida ativa',
      totalAmount: 5000,
      installmentAmount: 100,
    });
    const cancelledDebt = await createDebt(token, {
      name: 'Dívida cancelada',
      totalAmount: 5000,
      installmentAmount: 9999,
    });
    await updateDebt(token, cancelledDebt.id, { status: 'CANCELLED' });

    void activeGoal;
    void activeDebt;

    const res = await getProjection(token, { months: 1 });
    expect(res.status).toBe(200);
    const body = res.body as ProjectionResponse;
    // Só a meta e a dívida ACTIVE entram na soma: 200 e 100, não 9999.
    expect(body.goalMonthlyContribution).toBe('200.00');
    expect(body.debtInstallmentTotal).toBe('100.00');
  });

  it('cenário CUSTOM aplica os multiplicadores/delta informados via query', async () => {
    const { token, familyId } = await setupFamily('custom-scenario');
    await seedTrailingHistory(token, familyId);

    const res = await getProjection(token, {
      scenario: 'CUSTOM',
      months: 1,
      incomeMultiplier: 2,
      expenseMultiplier: 0,
      inflationDelta: 0,
    });
    expect(res.status).toBe(200);
    const body = res.body as ProjectionResponse;
    expect(body.scenario).toBe('CUSTOM');
    // avgIncome=3000 (ver seedTrailingHistory) × multiplicador 2 = 6000; despesa zerada.
    expect(body.months[0]?.income).toBe('6000.00');
    expect(body.months[0]?.expense).toBe('0.00');
  });

  it('rejeita incomeMultiplier/expenseMultiplier fora do intervalo permitido', async () => {
    const { token } = await setupFamily('custom-bounds');

    const negative = await getProjection(token, {
      scenario: 'CUSTOM',
      incomeMultiplier: -50,
    });
    expect(negative.status).toBe(400);

    const tooHigh = await getProjection(token, {
      scenario: 'CUSTOM',
      expenseMultiplier: 999,
    });
    expect(tooHigh.status).toBe(400);
  });
});
