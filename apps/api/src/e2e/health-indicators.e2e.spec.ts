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
import { IncomeSourcesModule } from '../income-sources/income-sources.module';
import { TransactionsModule } from '../transactions/transactions.module';
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
type CategoryResponse = {
  id: string;
  name: string;
  isEssential: boolean;
  isFixed: boolean;
};

type HealthIndicator = {
  value: string;
  status: 'good' | 'warning' | 'critical';
  trend: 'up' | 'down' | 'stable' | null;
};

type HealthIndicatorsResponse = {
  savingsRate: HealthIndicator;
  emergencyReserve: HealthIndicator;
  commitment: HealthIndicator;
  essentialRatio: HealthIndicator;
  fixedRatio: HealthIndicator;
  incomeDiversification: HealthIndicator;
};

type IncomeSourceResponse = { id: string; name: string };

describe('Indicadores de saúde financeira (e2e)', () => {
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

  const createCategory = async (
    token: string,
    body: Record<string, unknown>,
  ): Promise<CategoryResponse> => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${token}`)
      .send(body);
    return res.body as CategoryResponse;
  };

  const getHealthIndicators = (token: string) =>
    request(app.getHttpServer())
      .get('/api/v1/reports/health-indicators')
      .set('Authorization', `Bearer ${token}`);

  const createIncomeSource = async (token: string, name: string): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/income-sources')
      .set('Authorization', `Bearer ${token}`)
      .send({ name });
    return (res.body as IncomeSourceResponse).id;
  };

  /** Start-of-month date, `monthsAgo` calendar months before "now" (0 = current month). */
  const monthDate = (monthsAgo: number, day = 10): Date => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() - monthsAgo, day, 12, 0, 0);
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PrismaModule,
        AuthModule,
        AccountsModule,
        CategoriesModule,
        IncomeSourcesModule,
        TransactionsModule,
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
      prisma.incomeSource.deleteMany({ where: { familyId: { in: createdFamilies } } }),
      prisma.category.deleteMany({ where: { familyId: { in: createdFamilies } } }),
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

  it('calcula taxa de poupança "good" para receita 5000 / despesa 2000 no mês atual', async () => {
    const { token } = await setupFamily('good-rate');
    const accountId = await createAccount(token);

    await createTransaction(token, {
      accountId,
      description: 'Salário',
      amount: 5000,
      type: 'INCOME',
      date: monthDate(0).toISOString(),
    });
    await createTransaction(token, {
      accountId,
      description: 'Contas',
      amount: 2000,
      type: 'EXPENSE',
      date: monthDate(0).toISOString(),
    });

    const res = await getHealthIndicators(token);
    expect(res.status).toBe(200);
    const body = res.body as HealthIndicatorsResponse;
    // (5000 - 2000) / 5000 * 100 = 60.0
    expect(body.savingsRate.value).toBe('60.0');
    expect(body.savingsRate.status).toBe('good');
  });

  it('calcula taxa de poupança "critical" quando a economia do mês é baixa', async () => {
    const { token } = await setupFamily('critical-rate');
    const accountId = await createAccount(token);

    await createTransaction(token, {
      accountId,
      description: 'Salário',
      amount: 2000,
      type: 'INCOME',
      date: monthDate(0).toISOString(),
    });
    await createTransaction(token, {
      accountId,
      description: 'Contas',
      amount: 1900,
      type: 'EXPENSE',
      date: monthDate(0).toISOString(),
    });

    const res = await getHealthIndicators(token);
    expect(res.status).toBe(200);
    const body = res.body as HealthIndicatorsResponse;
    // (2000 - 1900) / 2000 * 100 = 5.0 < 10 -> critical
    expect(body.savingsRate.value).toBe('5.0');
    expect(body.savingsRate.status).toBe('critical');
  });

  it('calcula reserva de emergência e comprometimento de renda com dados de 3 meses', async () => {
    const { token, familyId } = await setupFamily('trailing-3-months');
    const accountId = await createAccount(token);
    // A família precisa "existir" desde antes da janela de 3 meses, senão o
    // divisor da média é clampado ao número de meses desde a criação (ver
    // reports.service.ts) em vez de 3, o que este teste depende para os
    // valores esperados abaixo.
    await prisma.family.update({ where: { id: familyId }, data: { createdAt: monthDate(2) } });

    // Trailing 3-month window: current month + the 2 before it.
    // Income: 3000 in each of the 3 months = avg 3000.
    // Expense: 1000 in each of the 3 months = avg 1000.
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

    // Account balance after 3x(3000 - 1000) confirmed transactions = 6000.
    const account = await prisma.account.findFirst({ where: { id: accountId } });
    expect(account?.balance.toString()).toBe('6000');

    const res = await getHealthIndicators(token);
    expect(res.status).toBe(200);
    const body = res.body as HealthIndicatorsResponse;
    // saldo total (6000) / despesa média mensal (1000) = 6.0 months -> good (>= 6)
    expect(body.emergencyReserve.value).toBe('6.0');
    expect(body.emergencyReserve.status).toBe('good');
    expect(body.emergencyReserve.trend).toBeNull();
    // despesa média (1000) / receita média (3000) * 100 = 33.3 -> good (< 50)
    expect(body.commitment.value).toBe('33.3');
    expect(body.commitment.status).toBe('good');
    expect(body.commitment.trend).toBeNull();
  });

  it('não dilui a média para família nova com menos de 3 meses de histórico', async () => {
    const { token } = await setupFamily('new-family-short-history');
    const accountId = await createAccount(token);
    // Família criada "agora" (padrão do registro) — só o mês corrente tem
    // dado. Sem o clamp do divisor pelo tempo de existência da família, a
    // média seria diluída por 3 (incluindo meses "vazios" anteriores à
    // criação), inflando artificialmente a reserva de emergência.
    await createTransaction(token, {
      accountId,
      description: 'Aluguel',
      amount: 3000,
      type: 'EXPENSE',
      date: monthDate(0).toISOString(),
    });

    const account = await prisma.account.findFirst({ where: { id: accountId } });
    expect(account?.balance.toString()).toBe('-3000');

    const res = await getHealthIndicators(token);
    expect(res.status).toBe(200);
    const body = res.body as HealthIndicatorsResponse;
    // saldo (-3000) / despesa média (3000, dividido por 1 mês, não 3) = -1.0 mês -> critical
    expect(body.emergencyReserve.value).toBe('-1.0');
    expect(body.emergencyReserve.status).toBe('critical');
  });

  it('não quebra quando não há receita (divisão por zero) e retorna resposta neutra', async () => {
    const { token } = await setupFamily('zero-income');
    const accountId = await createAccount(token);

    await createTransaction(token, {
      accountId,
      description: 'Aluguel',
      amount: 1500,
      type: 'EXPENSE',
      date: monthDate(0).toISOString(),
    });

    const res = await getHealthIndicators(token);
    expect(res.status).toBe(200);
    const body = res.body as HealthIndicatorsResponse;
    expect(body.savingsRate.value).toBe('0.0');
    expect(body.savingsRate.status).toBe('warning');
    expect(body.savingsRate.trend).toBeNull();
    expect(body.commitment.value).toBe('0.0');
    expect(body.commitment.status).toBe('warning');
  });

  it('não vaza transações de outra família nos indicadores (isolamento multi-tenant)', async () => {
    const familyA = await setupFamily('tenant-a-health');
    const familyB = await setupFamily('tenant-b-health');

    const accountA = await createAccount(familyA.token, 'Conta A');
    const accountB = await createAccount(familyB.token, 'Conta B');

    // Family A: healthy savings rate.
    await createTransaction(familyA.token, {
      accountId: accountA,
      description: 'Salário A',
      amount: 4000,
      type: 'INCOME',
      date: monthDate(0).toISOString(),
    });
    await createTransaction(familyA.token, {
      accountId: accountA,
      description: 'Contas A',
      amount: 1000,
      type: 'EXPENSE',
      date: monthDate(0).toISOString(),
    });

    // Family B: no transactions at all, only an account with balance 0.
    void accountB;

    const resA = await getHealthIndicators(familyA.token);
    const resB = await getHealthIndicators(familyB.token);

    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);

    const bodyA = resA.body as HealthIndicatorsResponse;
    const bodyB = resB.body as HealthIndicatorsResponse;

    // (4000 - 1000) / 4000 * 100 = 75.0
    expect(bodyA.savingsRate.value).toBe('75.0');
    expect(bodyA.savingsRate.status).toBe('good');

    // Family B has zero income/expense: should not see Family A's data.
    expect(bodyB.savingsRate.value).toBe('0.0');
    expect(bodyB.savingsRate.status).toBe('warning');
    expect(bodyB.emergencyReserve.value).toBe('0.0');
  });

  it('cria, consulta e atualiza a classificação essencial/fixa de categorias', async () => {
    const { token } = await setupFamily('category-flags');

    const essential = await createCategory(token, { name: 'Moradia', isEssential: true });
    expect(essential.isEssential).toBe(true);
    expect(essential.isFixed).toBe(false);

    const fixed = await createCategory(token, { name: 'Assinaturas', isFixed: true });
    expect(fixed.isEssential).toBe(false);
    expect(fixed.isFixed).toBe(true);

    const plain = await createCategory(token, { name: 'Lazer' });
    expect(plain.isEssential).toBe(false);
    expect(plain.isFixed).toBe(false);

    const getRes = await request(app.getHttpServer())
      .get(`/api/v1/categories/${essential.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(getRes.status).toBe(200);
    expect((getRes.body as CategoryResponse).isEssential).toBe(true);

    const listRes = await request(app.getHttpServer())
      .get('/api/v1/categories')
      .set('Authorization', `Bearer ${token}`);
    const listed = listRes.body as CategoryResponse[];
    expect(listed.find((c) => c.id === fixed.id)?.isFixed).toBe(true);

    const patchRes = await request(app.getHttpServer())
      .patch(`/api/v1/categories/${plain.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ isEssential: true, isFixed: true });
    expect(patchRes.status).toBe(200);
    const patched = patchRes.body as CategoryResponse;
    expect(patched.isEssential).toBe(true);
    expect(patched.isFixed).toBe(true);
  });

  it('trata isEssential/isFixed nulos como "não informado" em vez de quebrar (colunas NOT NULL)', async () => {
    const { token } = await setupFamily('category-null-flags');

    const created = await request(app.getHttpServer())
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Transporte', isEssential: null, isFixed: null });
    expect(created.status).toBe(201);
    const category = created.body as CategoryResponse;
    expect(category.isEssential).toBe(false);
    expect(category.isFixed).toBe(false);

    const patched = await request(app.getHttpServer())
      .patch(`/api/v1/categories/${category.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ isEssential: null });
    expect(patched.status).toBe(200);
    expect((patched.body as CategoryResponse).isEssential).toBe(false);
  });

  it('calcula essentialRatio e fixedRatio ignorando categorias não classificadas no numerador', async () => {
    const { token } = await setupFamily('essential-fixed-ratio');
    const accountId = await createAccount(token);

    const essentialCategory = await createCategory(token, {
      name: 'Moradia',
      isEssential: true,
    });
    const fixedCategory = await createCategory(token, { name: 'Assinaturas', isFixed: true });
    const plainCategory = await createCategory(token, { name: 'Lazer' });

    // Total de despesas confirmadas no mês corrente: 700 + 200 + 100 = 1000.
    await createTransaction(token, {
      accountId,
      categoryId: essentialCategory.id,
      description: 'Aluguel',
      amount: 700,
      type: 'EXPENSE',
      date: monthDate(0).toISOString(),
    });
    await createTransaction(token, {
      accountId,
      categoryId: fixedCategory.id,
      description: 'Streaming',
      amount: 200,
      type: 'EXPENSE',
      date: monthDate(0).toISOString(),
    });
    // Categoria não classificada: entra no total, mas não no numerador de
    // nenhum dos dois indicadores.
    await createTransaction(token, {
      accountId,
      categoryId: plainCategory.id,
      description: 'Cinema',
      amount: 100,
      type: 'EXPENSE',
      date: monthDate(0).toISOString(),
    });

    const res = await getHealthIndicators(token);
    expect(res.status).toBe(200);
    const body = res.body as HealthIndicatorsResponse;
    // 700 / 1000 * 100 = 70.0 -> não é < 60 nem > 80 -> warning
    expect(body.essentialRatio.value).toBe('70.0');
    expect(body.essentialRatio.status).toBe('warning');
    expect(body.essentialRatio.trend).toBeNull();
    // 200 / 1000 * 100 = 20.0 -> < 50 -> good
    expect(body.fixedRatio.value).toBe('20.0');
    expect(body.fixedRatio.status).toBe('good');
    expect(body.fixedRatio.trend).toBeNull();
  });

  it('calcula essentialRatio e fixedRatio "critical" quando quase todo gasto é essencial/fixo', async () => {
    const { token } = await setupFamily('essential-fixed-critical');
    const accountId = await createAccount(token);

    const bothCategory = await createCategory(token, {
      name: 'Financiamento da casa',
      isEssential: true,
      isFixed: true,
    });
    const plainCategory = await createCategory(token, { name: 'Diversos' });

    await createTransaction(token, {
      accountId,
      categoryId: bothCategory.id,
      description: 'Parcela do financiamento',
      amount: 900,
      type: 'EXPENSE',
      date: monthDate(0).toISOString(),
    });
    await createTransaction(token, {
      accountId,
      categoryId: plainCategory.id,
      description: 'Compras diversas',
      amount: 100,
      type: 'EXPENSE',
      date: monthDate(0).toISOString(),
    });

    const res = await getHealthIndicators(token);
    expect(res.status).toBe(200);
    const body = res.body as HealthIndicatorsResponse;
    // 900 / 1000 * 100 = 90.0 -> > 80 -> critical
    expect(body.essentialRatio.value).toBe('90.0');
    expect(body.essentialRatio.status).toBe('critical');
    // 900 / 1000 * 100 = 90.0 -> > 70 -> critical
    expect(body.fixedRatio.value).toBe('90.0');
    expect(body.fixedRatio.status).toBe('critical');
  });

  it('essentialRatio/fixedRatio não quebram quando não há despesa no mês corrente', async () => {
    const { token } = await setupFamily('essential-fixed-zero');
    const accountId = await createAccount(token);

    // Só receita no mês corrente, sem despesa nenhuma.
    await createTransaction(token, {
      accountId,
      description: 'Salário',
      amount: 5000,
      type: 'INCOME',
      date: monthDate(0).toISOString(),
    });

    const res = await getHealthIndicators(token);
    expect(res.status).toBe(200);
    const body = res.body as HealthIndicatorsResponse;
    expect(body.essentialRatio.value).toBe('0.0');
    expect(body.essentialRatio.status).toBe('warning');
    expect(body.essentialRatio.trend).toBeNull();
    expect(body.fixedRatio.value).toBe('0.0');
    expect(body.fixedRatio.status).toBe('warning');
    expect(body.fixedRatio.trend).toBeNull();
  });

  it('incomeDiversification é "critical" com valor "0" sem fontes de renda classificadas no mês', async () => {
    const { token } = await setupFamily('income-diversification-zero');
    const accountId = await createAccount(token);

    // Receita confirmada no mês, mas sem `incomeSourceId` — não deve contar
    // como fonte de renda distinta.
    await createTransaction(token, {
      accountId,
      description: 'Salário sem fonte classificada',
      amount: 3000,
      type: 'INCOME',
      date: monthDate(0).toISOString(),
    });

    const res = await getHealthIndicators(token);
    expect(res.status).toBe(200);
    const body = res.body as HealthIndicatorsResponse;
    expect(body.incomeDiversification.value).toBe('0');
    expect(body.incomeDiversification.status).toBe('critical');
    expect(body.incomeDiversification.trend).toBeNull();
  });

  it('incomeDiversification é "critical" com valor "1" para exatamente uma fonte distinta', async () => {
    const { token } = await setupFamily('income-diversification-one');
    const accountId = await createAccount(token);
    const source = await createIncomeSource(token, 'Salário CLT');

    await createTransaction(token, {
      accountId,
      incomeSourceId: source,
      description: 'Salário',
      amount: 4000,
      type: 'INCOME',
      date: monthDate(0).toISOString(),
    });
    // Uma segunda transação da mesma fonte não deve inflar a contagem.
    await createTransaction(token, {
      accountId,
      incomeSourceId: source,
      description: '13º salário',
      amount: 4000,
      type: 'INCOME',
      date: monthDate(0).toISOString(),
    });

    const res = await getHealthIndicators(token);
    expect(res.status).toBe(200);
    const body = res.body as HealthIndicatorsResponse;
    expect(body.incomeDiversification.value).toBe('1');
    expect(body.incomeDiversification.status).toBe('critical');
  });

  it('incomeDiversification é "warning" com valor "2" para exatamente duas fontes distintas', async () => {
    const { token } = await setupFamily('income-diversification-two');
    const accountId = await createAccount(token);
    const sourceA = await createIncomeSource(token, 'Salário CLT');
    const sourceB = await createIncomeSource(token, 'Freelance');

    await createTransaction(token, {
      accountId,
      incomeSourceId: sourceA,
      description: 'Salário',
      amount: 4000,
      type: 'INCOME',
      date: monthDate(0).toISOString(),
    });
    await createTransaction(token, {
      accountId,
      incomeSourceId: sourceB,
      description: 'Projeto freelance',
      amount: 1000,
      type: 'INCOME',
      date: monthDate(0).toISOString(),
    });
    // Receita sem fonte classificada: não deve contar como fonte adicional.
    await createTransaction(token, {
      accountId,
      description: 'Reembolso avulso',
      amount: 200,
      type: 'INCOME',
      date: monthDate(0).toISOString(),
    });

    const res = await getHealthIndicators(token);
    expect(res.status).toBe(200);
    const body = res.body as HealthIndicatorsResponse;
    expect(body.incomeDiversification.value).toBe('2');
    expect(body.incomeDiversification.status).toBe('warning');
  });

  it('incomeDiversification é "good" com valor "3" para três ou mais fontes distintas', async () => {
    const { token } = await setupFamily('income-diversification-three');
    const accountId = await createAccount(token);
    const sourceA = await createIncomeSource(token, 'Salário CLT');
    const sourceB = await createIncomeSource(token, 'Freelance');
    const sourceC = await createIncomeSource(token, 'Aluguel de imóvel');

    for (const source of [sourceA, sourceB, sourceC]) {
      await createTransaction(token, {
        accountId,
        incomeSourceId: source,
        description: 'Receita',
        amount: 1000,
        type: 'INCOME',
        date: monthDate(0).toISOString(),
      });
    }

    const res = await getHealthIndicators(token);
    expect(res.status).toBe(200);
    const body = res.body as HealthIndicatorsResponse;
    expect(body.incomeDiversification.value).toBe('3');
    expect(body.incomeDiversification.status).toBe('good');
  });
});
