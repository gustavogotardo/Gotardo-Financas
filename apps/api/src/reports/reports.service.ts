import { Injectable, NotFoundException } from '@nestjs/common';
import { PaymentMethod, Prisma, TransactionStatus, TransactionType } from '@gotardo/db';
import { PrismaService } from '../prisma/prisma.module';
import { MlClient } from '../ml/ml.client';
import type { AuthUser } from '../common/auth-user';

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
};

const CONFIRMED = TransactionStatus.CONFIRMED;

/** Trend is only "meaningful" once the delta exceeds this many percentage points. */
const TREND_EPSILON = 0.5;

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ml: MlClient,
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
   * §2.9 / §27.1 "Indicadores de Saúde" — Taxa de Poupança, Reserva de Emergência,
   * Comprometimento de Renda, Gasto Essencial/Total e Recorrência/Total. The other 2
   * indicators from §27.1 (Dívida/Renda, Diversificação de Fontes) are out of scope:
   * this app has no debt tracking or income-source data to compute them from.
   */
  async healthIndicators(user: AuthUser): Promise<HealthIndicatorsResponse> {
    const now = new Date();
    // Mês corrente/anterior calculados em UTC, mesma convenção já usada em
    // todo o resto do app pra "que mês é agora" (AccountsService.getInvoice,
    // NotificationsCheckerService, GoalsService) — evita depender do fuso do
    // processo do servidor.
    const currentMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const currentMonthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    const previousMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    /**
     * Trailing 3 calendar months = the current (possibly partial) month plus the two
     * full calendar months before it. E.g. on any day in 2026-08 the window is
     * [2026-06-01, 2026-09-01).
     */
    const windowStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1));
    const windowEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

    const currentMonthExpenseWhere: Prisma.TransactionWhereInput = {
      familyId: user.familyId,
      deletedAt: null,
      status: CONFIRMED,
      type: TransactionType.EXPENSE,
      date: { gte: currentMonthStart, lt: currentMonthEnd },
    };

    const [rows, balanceAgg, family, essentialExpenseAgg, fixedExpenseAgg] = await Promise.all([
      this.prisma.$queryRaw<CashflowRow[]>(
        Prisma.sql`
          SELECT to_char(date_trunc('month', date), 'YYYY-MM') AS month,
                 COALESCE(SUM(CASE WHEN type = 'INCOME' THEN amount ELSE 0 END), 0) AS income,
                 COALESCE(SUM(CASE WHEN type = 'EXPENSE' THEN amount ELSE 0 END), 0) AS expense
          FROM "Transaction"
          WHERE "familyId" = ${user.familyId}
            AND "deletedAt" IS NULL
            AND status = 'CONFIRMED'
            AND date >= ${windowStart}
            AND date < ${windowEnd}
          GROUP BY month
        `,
      ),
      // "Saldo total" — same definition as the dashboard's stat card: sum of balance
      // across active (non-archived, non-deleted) accounts.
      this.prisma.account.aggregate({
        where: { familyId: user.familyId, deletedAt: null, isArchived: false },
        _sum: { balance: true },
      }),
      this.prisma.family.findUniqueOrThrow({
        where: { id: user.familyId },
        select: { createdAt: true },
      }),
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
    ]);

    const byMonth = new Map(rows.map((row) => [row.month, row]));
    const currentRow = byMonth.get(this.monthKey(currentMonthStart));
    const previousRow = byMonth.get(this.monthKey(previousMonthStart));

    const currentIncome = currentRow?.income ?? new Prisma.Decimal(0);
    const currentExpense = currentRow?.expense ?? new Prisma.Decimal(0);

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

    const essentialExpense = essentialExpenseAgg._sum.amount ?? new Prisma.Decimal(0);
    const fixedExpense = fixedExpenseAgg._sum.amount ?? new Prisma.Decimal(0);

    return {
      savingsRate: this.buildSavingsRate(currentIncome, currentExpense, previousRow),
      emergencyReserve: this.buildEmergencyReserve(totalBalance, avgExpense),
      commitment: this.buildCommitment(avgExpense, avgIncome),
      essentialRatio: this.buildEssentialRatio(essentialExpense, currentExpense),
      fixedRatio: this.buildFixedRatio(fixedExpense, currentExpense),
    };
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
