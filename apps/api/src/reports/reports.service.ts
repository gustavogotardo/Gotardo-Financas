import { Injectable, NotFoundException } from '@nestjs/common';
import {
  DebtStatus,
  GoalStatus,
  PaymentMethod,
  Prisma,
  TransactionStatus,
  TransactionType,
} from '@gotardo/db';
import { PrismaService } from '../prisma/prisma.module';
import { MlClient } from '../ml/ml.client';
import { DebtsService } from '../debts/debts.service';
import { GoalsService } from '../goals/goals.service';
import { addMonthsUtc } from '../common/date-utils';
import type { AuthUser } from '../common/auth-user';
import type { ProjectionQueryDto } from './dto/projection-query.dto';

export type PaymentMethodRow = {
  method: string | null;
  label: string;
  income: string;
  expense: string;
  count: number;
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  [PaymentMethod.PIX]: 'Pix',
  [PaymentMethod.BOLETO]: 'Boleto',
  [PaymentMethod.CREDIT_CARD]: 'Cartão de crédito',
  [PaymentMethod.DEBIT_CARD]: 'Cartão de débito',
  [PaymentMethod.TRANSFER]: 'Transferência',
  [PaymentMethod.CASH]: 'Dinheiro',
  [PaymentMethod.OTHER]: 'Outro',
};

export type CashflowMonth = {
  month: string;
  income: string;
  expense: string;
  net: string;
};

export type CashflowResponse = {
  from: string | null;
  to: string | null;
  income: string;
  expense: string;
  net: string;
  byMonth: CashflowMonth[];
};

export type CategoryExpenseRow = {
  categoryId: string | null;
  categoryName: string;
  total: string;
};

export type EnvelopeExpenseRow = {
  envelopeId: string | null;
  envelopeName: string;
  total: string;
};

export type AccountStatementTransaction = {
  id: string;
  date: Date;
  description: string;
  amount: string;
  type: string;
  status: string;
  category: { id: string; name: string } | null;
};

export type AccountStatement = {
  account: { id: string; name: string; currency: string };
  from: string | null;
  to: string | null;
  openingBalance: string;
  closingBalance: string;
  income: string;
  expense: string;
  transactions: AccountStatementTransaction[];
};

export type AnomalyRow = {
  transactionId: string;
  isAnomaly: boolean;
  reason: string | null;
};

type CashflowRow = {
  month: string;
  income: Prisma.Decimal;
  expense: Prisma.Decimal;
};

export type HealthIndicatorStatus = 'good' | 'warning' | 'critical';
export type HealthIndicatorTrend = 'up' | 'down' | 'stable' | null;

export type HealthIndicator = {
  /** Formatted number as a string with 1 decimal place (e.g. "26.7"); no unit/suffix. */
  value: string;
  status: HealthIndicatorStatus;
  trend: HealthIndicatorTrend;
};

export type HealthIndicatorsResponse = {
  savingsRate: HealthIndicator;
  emergencyReserve: HealthIndicator;
  commitment: HealthIndicator;
  essentialRatio: HealthIndicator;
  fixedRatio: HealthIndicator;
  incomeDiversification: HealthIndicator;
  debtToIncomeRatio: HealthIndicator;
};

export type ProjectionScenario = 'CONSERVATIVE' | 'BASE' | 'OPTIMISTIC' | 'CUSTOM';

export type ProjectionMonth = {
  month: string;
  income: string;
  expense: string;
  savingsCapacity: string;
  balance: string;
};

export type ProjectionResponse = {
  scenario: ProjectionScenario;
  startingBalance: string;
  goalMonthlyContribution: string;
  debtInstallmentTotal: string;
  months: ProjectionMonth[];
};

type ScenarioParams = {
  incomeMultiplier: Prisma.Decimal;
  expenseMultiplier: Prisma.Decimal;
  inflationDelta: Prisma.Decimal;
};

const CONFIRMED = TransactionStatus.CONFIRMED;

/** Trend is only "meaningful" once the delta exceeds this many percentage points. */
const TREND_EPSILON = 0.5;

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ml: MlClient,
    private readonly debts: DebtsService,
    private readonly goals: GoalsService,
  ) {}

  async cashflow(user: AuthUser, from?: Date, to?: Date): Promise<CashflowResponse> {
    const rows = await this.prisma.$queryRaw<CashflowRow[]>(
      Prisma.sql`
        SELECT to_char(date_trunc('month', date), 'YYYY-MM') AS month,
               COALESCE(SUM(CASE WHEN type = 'INCOME' THEN amount ELSE 0 END), 0) AS income,
               COALESCE(SUM(CASE WHEN type = 'EXPENSE' THEN amount ELSE 0 END), 0) AS expense
        FROM "Transaction"
        WHERE "familyId" = ${user.familyId}
          AND "deletedAt" IS NULL
          AND status = 'CONFIRMED'
          ${from ? Prisma.sql`AND date >= ${from}` : Prisma.empty}
          ${to ? Prisma.sql`AND date <= ${to}` : Prisma.empty}
        GROUP BY month
        ORDER BY month
      `,
    );
    const byMonth: CashflowMonth[] = rows.map((row) => ({
      month: row.month,
      income: row.income.toString(),
      expense: row.expense.toString(),
      net: row.income.minus(row.expense).toString(),
    }));
    const income = rows.reduce((acc, row) => acc.plus(row.income), new Prisma.Decimal(0));
    const expense = rows.reduce((acc, row) => acc.plus(row.expense), new Prisma.Decimal(0));
    return {
      from: from ? from.toISOString() : null,
      to: to ? to.toISOString() : null,
      income: income.toString(),
      expense: expense.toString(),
      net: income.minus(expense).toString(),
      byMonth,
    };
  }

  async expensesByCategory(user: AuthUser, from?: Date, to?: Date): Promise<CategoryExpenseRow[]> {
    const groups = await this.prisma.transaction.groupBy({
      by: ['categoryId'],
      where: this.expenseWhere(user, from, to),
      _sum: { amount: true },
    });
    const ids = groups.map((group) => group.categoryId).filter((id): id is string => Boolean(id));
    const categories = ids.length
      ? await this.prisma.category.findMany({
          where: { id: { in: ids }, familyId: user.familyId },
          select: { id: true, name: true },
        })
      : [];
    const nameById = new Map(categories.map((category) => [category.id, category.name]));
    return groups
      .map((group) => ({
        categoryId: group.categoryId,
        categoryName: group.categoryId
          ? (nameById.get(group.categoryId) ?? 'Desconhecida')
          : 'Sem categoria',
        total: (group._sum.amount ?? new Prisma.Decimal(0)).toString(),
      }))
      .sort((a, b) => Number(b.total) - Number(a.total));
  }

  async expensesByEnvelope(user: AuthUser, from?: Date, to?: Date): Promise<EnvelopeExpenseRow[]> {
    const groups = await this.prisma.transaction.groupBy({
      by: ['envelopeId'],
      where: this.expenseWhere(user, from, to),
      _sum: { amount: true },
    });
    const ids = groups.map((group) => group.envelopeId).filter((id): id is string => Boolean(id));
    const envelopes = ids.length
      ? await this.prisma.envelope.findMany({
          where: { id: { in: ids }, familyId: user.familyId },
          select: { id: true, name: true },
        })
      : [];
    const nameById = new Map(envelopes.map((envelope) => [envelope.id, envelope.name]));
    return groups
      .map((group) => ({
        envelopeId: group.envelopeId,
        envelopeName: group.envelopeId
          ? (nameById.get(group.envelopeId) ?? 'Desconhecido')
          : 'Sem envelope',
        total: (group._sum.amount ?? new Prisma.Decimal(0)).toString(),
      }))
      .sort((a, b) => Number(b.total) - Number(a.total));
  }

  async paymentMethods(user: AuthUser, from?: Date, to?: Date): Promise<PaymentMethodRow[]> {
    const rows = await this.prisma.$queryRaw<
      Array<{ method: string; income: Prisma.Decimal; expense: Prisma.Decimal; count: number }>
    >(
      Prisma.sql`
        SELECT COALESCE("paymentMethod"::text, '') AS method,
               COALESCE(SUM(CASE WHEN type = 'INCOME' THEN amount ELSE 0 END), 0) AS income,
               COALESCE(SUM(CASE WHEN type = 'EXPENSE' THEN amount ELSE 0 END), 0) AS expense,
               COUNT(*)::int AS count
        FROM "Transaction"
        WHERE "familyId" = ${user.familyId}
          AND "deletedAt" IS NULL
          AND status = 'CONFIRMED'
          ${from ? Prisma.sql`AND date >= ${from}` : Prisma.empty}
          ${to ? Prisma.sql`AND date <= ${to}` : Prisma.empty}
        GROUP BY "paymentMethod"
        ORDER BY expense DESC, income DESC
      `,
    );
    return rows.map((row) => {
      const isNullMethod = row.method === '';
      return {
        method: isNullMethod ? null : row.method,
        label: isNullMethod ? 'Sem método' : (PAYMENT_METHOD_LABELS[row.method] ?? row.method),
        income: row.income.toString(),
        expense: row.expense.toString(),
        count: Number(row.count),
      };
    });
  }

  async accountStatement(
    user: AuthUser,
    accountId: string,
    from?: Date,
    to?: Date,
  ): Promise<AccountStatement> {
    const account = await this.prisma.account.findFirst({
      where: { id: accountId, familyId: user.familyId },
      select: { id: true, name: true, currency: true },
    });
    if (!account) {
      throw new NotFoundException('Conta não encontrada');
    }
    const baseWhere: Prisma.TransactionWhereInput = {
      accountId,
      familyId: user.familyId,
      deletedAt: null,
      status: CONFIRMED,
    };
    const periodWhere: Prisma.TransactionWhereInput = {
      ...baseWhere,
      ...this.dateFilter(from, to),
    };
    const [income, expense, transactions] = await Promise.all([
      this.prisma.transaction.aggregate({
        where: { ...periodWhere, type: TransactionType.INCOME },
        _sum: { amount: true },
      }),
      this.prisma.transaction.aggregate({
        where: { ...periodWhere, type: TransactionType.EXPENSE },
        _sum: { amount: true },
      }),
      this.prisma.transaction.findMany({
        where: periodWhere,
        orderBy: { date: 'asc' },
        select: {
          id: true,
          date: true,
          description: true,
          amount: true,
          type: true,
          status: true,
          category: { select: { id: true, name: true } },
        },
      }),
    ]);
    let openingBalance = new Prisma.Decimal(0);
    if (from) {
      const [openingIncome, openingExpense] = await Promise.all([
        this.prisma.transaction.aggregate({
          where: {
            ...baseWhere,
            type: TransactionType.INCOME,
            date: { lt: from },
          },
          _sum: { amount: true },
        }),
        this.prisma.transaction.aggregate({
          where: {
            ...baseWhere,
            type: TransactionType.EXPENSE,
            date: { lt: from },
          },
          _sum: { amount: true },
        }),
      ]);
      openingBalance = (openingIncome._sum.amount ?? new Prisma.Decimal(0)).minus(
        openingExpense._sum.amount ?? new Prisma.Decimal(0),
      );
    }
    const incomeValue = income._sum.amount ?? new Prisma.Decimal(0);
    const expenseValue = expense._sum.amount ?? new Prisma.Decimal(0);
    return {
      account,
      from: from ? from.toISOString() : null,
      to: to ? to.toISOString() : null,
      openingBalance: openingBalance.toString(),
      closingBalance: openingBalance.plus(incomeValue).minus(expenseValue).toString(),
      income: incomeValue.toString(),
      expense: expenseValue.toString(),
      transactions: transactions.map((tx) => ({
        id: tx.id,
        date: tx.date,
        description: tx.description,
        amount: tx.amount.toString(),
        type: tx.type,
        status: tx.status,
        category: tx.category,
      })),
    };
  }

  async anomalies(user: AuthUser, from?: Date, to?: Date): Promise<AnomalyRow[]> {
    const transactions = await this.prisma.transaction.findMany({
      where: {
        familyId: user.familyId,
        deletedAt: null,
        status: CONFIRMED,
        ...this.dateFilter(from, to),
      },
      orderBy: { date: 'asc' },
      select: {
        id: true,
        description: true,
        amount: true,
        type: true,
        category: { select: { name: true } },
      },
    });
    if (transactions.length === 0) {
      return [];
    }
    const flags = await this.ml.anomalies(
      transactions.map((tx) => ({
        id: tx.id,
        description: tx.description,
        amount: (tx.type === 'EXPENSE' ? -tx.amount : tx.amount).toString(),
        category: tx.category?.name ?? null,
      })),
    );
    return transactions.map((tx) => {
      const flag = flags.get(tx.id);
      return {
        transactionId: tx.id,
        isAnomaly: flag?.isAnomaly ?? false,
        reason: flag?.reason ?? null,
      };
    });
  }

  /**
   * Trailing 3 calendar months = the current (possibly partial) month plus the two
   * full calendar months before it. E.g. on any day in 2026-08 the window is
   * [2026-06-01, 2026-09-01). Shared by `healthIndicators()` (commitment/emergency
   * reserve) and `projection()` (the projection engine's base income/expense/balance),
   * so both report the same underlying trailing-average numbers.
   */
  private async trailingThreeMonthAverages(user: AuthUser): Promise<{
    rows: CashflowRow[];
    windowStart: Date;
    windowEnd: Date;
    avgIncome: Prisma.Decimal;
    avgExpense: Prisma.Decimal;
    totalBalance: Prisma.Decimal;
  }> {
    const now = new Date();
    // Mês corrente/anterior calculados em UTC, mesma convenção já usada em
    // todo o resto do app pra "que mês é agora" (AccountsService.getInvoice,
    // NotificationsCheckerService, GoalsService) — evita depender do fuso do
    // processo do servidor.
    const windowStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1));
    const windowEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

    const [rows, balanceAgg, family] = await Promise.all([
      this.prisma.$queryRaw<CashflowRow[]>(
        Prisma.sql`
          SELECT to_char(date_trunc('month', t.date), 'YYYY-MM') AS month,
                 COALESCE(SUM(CASE WHEN t.type = 'INCOME' THEN t.amount ELSE 0 END), 0) AS income,
                 COALESCE(SUM(CASE WHEN t.type = 'EXPENSE' THEN t.amount ELSE 0 END), 0) AS expense
          FROM "Transaction" t
          JOIN "Account" a ON a.id = t."accountId"
          WHERE t."familyId" = ${user.familyId}
            AND t."deletedAt" IS NULL
            AND t.status = 'CONFIRMED'
            AND t.date >= ${windowStart}
            AND t.date < ${windowEnd}
            AND a."isArchived" = false
            AND a."deletedAt" IS NULL
          GROUP BY month
        `,
      ),
      // "Saldo total" — same definition as the dashboard's stat card: sum of balance
      // across active (non-archived, non-deleted) accounts. A receita/despesa média
      // acima agora também exclui transações de contas arquivadas (join em Account),
      // pra não divergir dessa mesma definição de "ativo" usada aqui.
      this.prisma.account.aggregate({
        where: { familyId: user.familyId, deletedAt: null, isArchived: false },
        _sum: { balance: true },
      }),
      this.prisma.family.findUniqueOrThrow({
        where: { id: user.familyId },
        select: { createdAt: true },
      }),
    ]);

    // Divide pelo número de meses do período que a família de fato já
    // existia, não sempre por 3 — senão uma família nova (poucas semanas de
    // histórico) tem a média artificialmente diluída por meses "vazios"
    // anteriores à sua criação, subestimando despesa/receita médias (e, no
    // caso da reserva de emergência, superestimando os meses de cobertura).
    const familyCreatedMonthStart = new Date(
      Date.UTC(family.createdAt.getUTCFullYear(), family.createdAt.getUTCMonth(), 1),
    );
    const effectiveWindowStart =
      familyCreatedMonthStart > windowStart ? familyCreatedMonthStart : windowStart;
    const monthsInWindow = Math.max(
      1,
      (windowEnd.getUTCFullYear() - effectiveWindowStart.getUTCFullYear()) * 12 +
        (windowEnd.getUTCMonth() - effectiveWindowStart.getUTCMonth()),
    );

    const totalIncome3 = rows.reduce((acc, row) => acc.plus(row.income), new Prisma.Decimal(0));
    const totalExpense3 = rows.reduce((acc, row) => acc.plus(row.expense), new Prisma.Decimal(0));
    const avgIncome = totalIncome3.dividedBy(monthsInWindow);
    const avgExpense = totalExpense3.dividedBy(monthsInWindow);
    const totalBalance = balanceAgg._sum.balance ?? new Prisma.Decimal(0);

    return { rows, windowStart, windowEnd, avgIncome, avgExpense, totalBalance };
  }

  /**
   * §2.9 / §27.1 "Indicadores de Saúde" — Taxa de Poupança, Reserva de Emergência,
   * Comprometimento de Renda, Gasto Essencial/Total, Recorrência/Total,
   * Diversificação de Fontes e Dívida/Renda Anual. All 7 §27.1 indicators are
   * implemented.
   */
  async healthIndicators(user: AuthUser): Promise<HealthIndicatorsResponse> {
    const { rows, windowStart, windowEnd, avgIncome, avgExpense, totalBalance } =
      await this.trailingThreeMonthAverages(user);

    // currentMonthStart/currentMonthEnd/previousMonthStart derivam de
    // windowStart/windowEnd (em vez de recalcular a partir de `new Date()`
    // outra vez) pra garantir que usam exatamente o mesmo "agora" da janela
    // de 3 meses acima, sem risco de uma corrida rara na virada do mês.
    const currentMonthStart = new Date(
      Date.UTC(windowEnd.getUTCFullYear(), windowEnd.getUTCMonth() - 1, 1),
    );
    const currentMonthEnd = windowEnd;
    const previousMonthStart = new Date(
      Date.UTC(windowStart.getUTCFullYear(), windowStart.getUTCMonth() + 1, 1),
    );

    const currentMonthExpenseWhere: Prisma.TransactionWhereInput = {
      familyId: user.familyId,
      deletedAt: null,
      status: CONFIRMED,
      type: TransactionType.EXPENSE,
      date: { gte: currentMonthStart, lt: currentMonthEnd },
    };

    const [essentialExpenseAgg, fixedExpenseAgg, incomeSourceGroups, debtsList] =
      await Promise.all([
        // Gasto Essencial/Total (§27.1): soma das despesas do mês corrente cuja
        // categoria está marcada como essencial. Transações sem categoria, ou com
        // categoria não-essencial, não entram nessa soma (mas entram no total).
        this.prisma.transaction.aggregate({
          where: { ...currentMonthExpenseWhere, category: { isEssential: true } },
          _sum: { amount: true },
        }),
        // Recorrência/Total (§27.1): mesma lógica, para categorias fixas.
        this.prisma.transaction.aggregate({
          where: { ...currentMonthExpenseWhere, category: { isFixed: true } },
          _sum: { amount: true },
        }),
        // Diversificação de Fontes (§27.1): quantidade de fontes de renda
        // distintas com receita confirmada no mês corrente. Uma transação sem
        // `incomeSourceId` não conta pra nenhuma fonte; um `IncomeSource`
        // cadastrado mas sem receita esse mês também não conta.
        this.prisma.transaction.groupBy({
          by: ['incomeSourceId'],
          where: {
            familyId: user.familyId,
            deletedAt: null,
            status: CONFIRMED,
            type: TransactionType.INCOME,
            incomeSourceId: { not: null },
            date: { gte: currentMonthStart, lt: currentMonthEnd },
          },
        }),
        // Dívida/Renda Anual (§27.1): reusa `DebtsService.list` (mesma
        // agregação de `remainingAmount` usada pela tela de dívidas) em vez de
        // recalcular o saldo devedor aqui — mantém uma única fonte de verdade
        // para "quanto ainda falta pagar" de cada dívida.
        this.debts.list(user),
      ]);

    const byMonth = new Map(rows.map((row) => [row.month, row]));
    const currentRow = byMonth.get(this.monthKey(currentMonthStart));
    const previousRow = byMonth.get(this.monthKey(previousMonthStart));

    const currentIncome = currentRow?.income ?? new Prisma.Decimal(0);
    const currentExpense = currentRow?.expense ?? new Prisma.Decimal(0);

    const essentialExpense = essentialExpenseAgg._sum.amount ?? new Prisma.Decimal(0);
    const fixedExpense = fixedExpenseAgg._sum.amount ?? new Prisma.Decimal(0);

    // Dívida/Renda Anual: soma o saldo devedor (`remainingAmount`) apenas das
    // dívidas ACTIVE — uma dívida quitada (PAID_OFF) ou cancelada
    // (CANCELLED) não deve pesar no indicador mesmo que ainda carregue um
    // `remainingAmount` residual não-zero.
    const totalRemainingDebt = debtsList
      .filter((debt) => debt.status === DebtStatus.ACTIVE)
      .reduce((acc, debt) => acc.plus(debt.remainingAmount), new Prisma.Decimal(0));

    return {
      savingsRate: this.buildSavingsRate(currentIncome, currentExpense, previousRow),
      emergencyReserve: this.buildEmergencyReserve(totalBalance, avgExpense),
      commitment: this.buildCommitment(avgExpense, avgIncome),
      essentialRatio: this.buildEssentialRatio(essentialExpense, currentExpense),
      fixedRatio: this.buildFixedRatio(fixedExpense, currentExpense),
      debtToIncomeRatio: this.buildDebtToIncomeRatio(totalRemainingDebt, avgIncome),
      incomeDiversification: this.buildIncomeDiversification(incomeSourceGroups.length),
    };
  }

  /**
   * §9 "Motor de Projeção" — projeta saldo/renda/despesa mês a mês a partir das
   * mesmas médias móveis de 3 meses usadas em `healthIndicators()`, aplicando os
   * multiplicadores de um cenário (§9.2) e um crescimento de renda/inflação
   * compostos mês a mês (§9.3). Puramente computado sob demanda — nada é
   * persistido (cenários nomeados/salvos ficam para um épico futuro).
   */
  async projection(user: AuthUser, query: ProjectionQueryDto): Promise<ProjectionResponse> {
    const scenario: ProjectionScenario = query.scenario ?? 'BASE';
    const months = query.months ?? 6;
    const incomeGrowthRate = new Prisma.Decimal(query.incomeGrowthRate ?? 0);
    const baseMonthlyInflation = new Prisma.Decimal(query.baseMonthlyInflation ?? 0);

    const { incomeMultiplier, expenseMultiplier, inflationDelta } = this.resolveScenario(
      scenario,
      query,
    );
    const monthlyInflation = baseMonthlyInflation.plus(inflationDelta);

    const [{ avgIncome, avgExpense, totalBalance, windowEnd }, goalsList, debtsList] =
      await Promise.all([
        this.trailingThreeMonthAverages(user),
        this.goals.list(user),
        this.debts.list(user),
      ]);

    // §9.3 "Capacidade de Poupança" reusa a mesma média móvel de 3 meses do
    // `healthIndicators()` como ponto de partida da renda/despesa base.
    const goalMonthlyContribution = goalsList
      .filter((goal) => goal.status === GoalStatus.ACTIVE)
      .reduce(
        (acc, goal) => acc.plus(goal.monthlyContribution ?? new Prisma.Decimal(0)),
        new Prisma.Decimal(0),
      );
    const debtInstallmentTotal = debtsList
      .filter((debt) => debt.status === DebtStatus.ACTIVE)
      .reduce(
        (acc, debt) => acc.plus(debt.installmentAmount ?? new Prisma.Decimal(0)),
        new Prisma.Decimal(0),
      );

    // Deriva os meses projetados de `windowEnd` (já calculado por
    // trailingThreeMonthAverages) em vez de um novo `new Date()` — evitando
    // reintroduzir a mesma corrida de "agora" na virada de mês que a extração
    // desse helper eliminou para healthIndicators(). `windowEnd` já é o
    // início do mês seguinte ao corrente (dia 1), então addMonthsUtc(windowEnd,
    // m - 1) dá o mês `m` a partir de hoje.
    const growthFactorBase = new Prisma.Decimal(1).plus(incomeGrowthRate);
    const inflationFactorBase = new Prisma.Decimal(1).plus(monthlyInflation);

    let balance = totalBalance;
    const monthsOut: ProjectionMonth[] = [];
    for (let m = 1; m <= months; m++) {
      const income = avgIncome.times(incomeMultiplier).times(growthFactorBase.pow(m));
      const expense = avgExpense.times(expenseMultiplier).times(inflationFactorBase.pow(m));
      const savingsCapacity = income.minus(expense);
      // Simplificação conhecida e deliberada (§9, escopo deste primeiro corte
      // do motor): `goalMonthlyContribution` e `debtInstallmentTotal` são
      // aplicados como constantes fixas em todos os meses projetados, mesmo
      // que na prática um objetivo possa ser concluído ou uma dívida quitada
      // no meio da janela, liberando esse valor pros meses seguintes.
      balance = balance
        .minus(goalMonthlyContribution)
        .minus(debtInstallmentTotal)
        .plus(income)
        .minus(expense);

      const monthDate = addMonthsUtc(windowEnd, m - 1);
      monthsOut.push({
        month: this.monthKey(monthDate),
        income: income.toFixed(2),
        expense: expense.toFixed(2),
        savingsCapacity: savingsCapacity.toFixed(2),
        balance: balance.toFixed(2),
      });
    }

    return {
      scenario,
      startingBalance: totalBalance.toFixed(2),
      goalMonthlyContribution: goalMonthlyContribution.toFixed(2),
      debtInstallmentTotal: debtInstallmentTotal.toFixed(2),
      months: monthsOut,
    };
  }

  /** §9.2 tabela de cenários — CUSTOM usa os overrides da query (default 1/1/0). */
  private resolveScenario(scenario: ProjectionScenario, query: ProjectionQueryDto): ScenarioParams {
    switch (scenario) {
      case 'CONSERVATIVE':
        return {
          incomeMultiplier: new Prisma.Decimal(0.95),
          expenseMultiplier: new Prisma.Decimal(1.05),
          inflationDelta: new Prisma.Decimal(0.0008),
        };
      case 'OPTIMISTIC':
        return {
          incomeMultiplier: new Prisma.Decimal(1.05),
          expenseMultiplier: new Prisma.Decimal(0.95),
          inflationDelta: new Prisma.Decimal(-0.0004),
        };
      case 'CUSTOM':
        return {
          incomeMultiplier: new Prisma.Decimal(query.incomeMultiplier ?? 1),
          expenseMultiplier: new Prisma.Decimal(query.expenseMultiplier ?? 1),
          inflationDelta: new Prisma.Decimal(query.inflationDelta ?? 0),
        };
      case 'BASE':
      default:
        return {
          incomeMultiplier: new Prisma.Decimal(1),
          expenseMultiplier: new Prisma.Decimal(1),
          inflationDelta: new Prisma.Decimal(0),
        };
    }
  }

  private monthKey(date: Date): string {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  private buildSavingsRate(
    income: Prisma.Decimal,
    expense: Prisma.Decimal,
    previousRow: CashflowRow | undefined,
  ): HealthIndicator {
    if (income.lessThanOrEqualTo(0)) {
      return { value: '0.0', status: 'warning', trend: null };
    }
    const rate = income.minus(expense).dividedBy(income).times(100);
    const status = this.higherIsBetterStatus(rate, 20, 10);

    let trend: HealthIndicatorTrend = null;
    if (previousRow && previousRow.income.greaterThan(0)) {
      const previousRate = previousRow.income
        .minus(previousRow.expense)
        .dividedBy(previousRow.income)
        .times(100);
      const diff = rate.minus(previousRate);
      if (diff.greaterThan(TREND_EPSILON)) {
        trend = 'up';
      } else if (diff.lessThan(-TREND_EPSILON)) {
        trend = 'down';
      } else {
        trend = 'stable';
      }
    }

    return { value: rate.toFixed(1), status, trend };
  }

  private buildEmergencyReserve(
    totalBalance: Prisma.Decimal,
    avgExpense: Prisma.Decimal,
  ): HealthIndicator {
    // No expense history in the trailing window: the ratio is undefined, not
    // "critical" — surface it as a neutral 0.0/warning instead of crashing (Infinity).
    if (avgExpense.lessThanOrEqualTo(0)) {
      return { value: '0.0', status: 'warning', trend: null };
    }
    const months = totalBalance.dividedBy(avgExpense);
    const status = this.higherIsBetterStatus(months, 6, 3);
    return { value: months.toFixed(1), status, trend: null };
  }

  /**
   * Constrói um indicador "lower is better" — comprometimento de renda,
   * gasto essencial/total e recorrência/total (§27.1) são todos a mesma
   * forma (numerador / denominador × 100, quanto menor melhor), diferindo
   * só nos limiares de bom/crítico.
   */
  private buildLowerIsBetterRatio(
    numerator: Prisma.Decimal,
    denominator: Prisma.Decimal,
    goodThreshold: number,
    criticalThreshold: number,
  ): HealthIndicator {
    if (denominator.lessThanOrEqualTo(0)) {
      return { value: '0.0', status: 'warning', trend: null };
    }
    const ratio = numerator.dividedBy(denominator).times(100);
    const status = this.lowerIsBetterStatus(ratio, goodThreshold, criticalThreshold);
    return { value: ratio.toFixed(1), status, trend: null };
  }

  private buildCommitment(avgExpense: Prisma.Decimal, avgIncome: Prisma.Decimal): HealthIndicator {
    return this.buildLowerIsBetterRatio(avgExpense, avgIncome, 50, 70);
  }

  /**
   * Gasto Essencial/Total (§27.1) — proporção das despesas confirmadas do mês
   * corrente cuja categoria é marcada como essencial. Lower is better: uma família
   * que gasta quase tudo em itens essenciais tem pouca margem pra poupar ou
   * ajustar o orçamento em caso de aperto.
   */
  private buildEssentialRatio(
    essentialExpense: Prisma.Decimal,
    totalExpense: Prisma.Decimal,
  ): HealthIndicator {
    return this.buildLowerIsBetterRatio(essentialExpense, totalExpense, 60, 80);
  }

  /**
   * Recorrência/Total (§27.1) — mesma lógica de `buildEssentialRatio`, mas para
   * despesas de categorias marcadas como fixas (recorrentes).
   */
  private buildFixedRatio(
    fixedExpense: Prisma.Decimal,
    totalExpense: Prisma.Decimal,
  ): HealthIndicator {
    return this.buildLowerIsBetterRatio(fixedExpense, totalExpense, 50, 70);
  }

  /**
   * Dívida/Renda Anual (§27.1) — saldo devedor total das dívidas ACTIVE sobre
   * a renda anualizada (média móvel de 3 meses × 12). Lower is better: quanto
   * maior a dívida remanescente em relação à renda anual, maior o risco.
   */
  private buildDebtToIncomeRatio(
    totalRemainingDebt: Prisma.Decimal,
    avgIncome: Prisma.Decimal,
  ): HealthIndicator {
    const annualIncome = avgIncome.times(12);
    return this.buildLowerIsBetterRatio(totalRemainingDebt, annualIncome, 30, 50);
  }

  /**
   * Diversificação de Fontes (§27.1) — quantidade de fontes de renda distintas
   * com receita confirmada no mês corrente. Higher is better: depender de uma
   * única fonte (ou nenhuma) é um risco de renda maior do que ter várias.
   * `value` é uma contagem inteira, não uma razão — sem casas decimais.
   */
  private buildIncomeDiversification(distinctSourceCount: number): HealthIndicator {
    const status = this.higherIsBetterStatus(new Prisma.Decimal(distinctSourceCount), 3, 2);
    return { value: String(distinctSourceCount), status, trend: null };
  }

  /** Higher is better: >= good → 'good', < critical → 'critical', else 'warning'. */
  private higherIsBetterStatus(
    value: Prisma.Decimal,
    goodThreshold: number,
    criticalThreshold: number,
  ): HealthIndicatorStatus {
    if (value.greaterThanOrEqualTo(goodThreshold)) return 'good';
    if (value.lessThan(criticalThreshold)) return 'critical';
    return 'warning';
  }

  /** Lower is better: < good → 'good', > critical → 'critical', else 'warning'. */
  private lowerIsBetterStatus(
    value: Prisma.Decimal,
    goodThreshold: number,
    criticalThreshold: number,
  ): HealthIndicatorStatus {
    if (value.lessThan(goodThreshold)) return 'good';
    if (value.greaterThan(criticalThreshold)) return 'critical';
    return 'warning';
  }

  private expenseWhere(user: AuthUser, from?: Date, to?: Date): Prisma.TransactionWhereInput {
    return {
      familyId: user.familyId,
      deletedAt: null,
      type: TransactionType.EXPENSE,
      status: CONFIRMED,
      ...this.dateFilter(from, to),
    };
  }

  private dateFilter(from?: Date, to?: Date): Prisma.TransactionWhereInput {
    const date: Prisma.DateTimeFilter = {
      ...(from ? { gte: from } : {}),
      ...(to ? { lte: to } : {}),
    };
    return Object.keys(date).length > 0 ? { date } : {};
  }
}
