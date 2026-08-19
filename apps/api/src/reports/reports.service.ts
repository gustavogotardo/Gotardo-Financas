import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TransactionStatus, TransactionType } from '@gotardo/db';
import { PrismaService } from '../prisma/prisma.module';
import type { AuthUser } from '../common/auth-user';

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

type CashflowRow = {
  month: string;
  income: Prisma.Decimal;
  expense: Prisma.Decimal;
};

const CONFIRMED = TransactionStatus.CONFIRMED;

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

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
