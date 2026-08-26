import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@gotardo/db';
import { PrismaService } from '../prisma/prisma.module';
import type { AuthUser } from '../common/auth-user';
import type { CreateDebtDto } from './dto/create-debt.dto';
import type { UpdateDebtDto } from './dto/update-debt.dto';
import type { CreateDebtPaymentDto } from './dto/create-debt-payment.dto';

const DEBT_SELECT = {
  id: true,
  name: true,
  creditor: true,
  totalAmount: true,
  interestRate: true,
  installmentAmount: true,
  dueDay: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;

type DebtBase = Prisma.DebtGetPayload<{ select: typeof DEBT_SELECT }>;

export type DebtWithSummary = DebtBase & {
  paidAmount: string;
  remainingAmount: string;
};

const PAYMENT_SELECT = {
  id: true,
  amount: true,
  date: true,
  note: true,
  createdAt: true,
} as const;

export type DebtPaymentRecord = Prisma.DebtPaymentGetPayload<{ select: typeof PAYMENT_SELECT }>;

@Injectable()
export class DebtsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: AuthUser): Promise<DebtWithSummary[]> {
    const debts = await this.prisma.debt.findMany({
      where: { familyId: user.familyId, deletedAt: null },
      select: DEBT_SELECT,
      orderBy: { name: 'asc' },
    });
    return this.withSummaries(debts);
  }

  async create(user: AuthUser, dto: CreateDebtDto): Promise<DebtWithSummary> {
    const debt = await this.prisma.debt.create({
      data: {
        familyId: user.familyId,
        name: dto.name,
        creditor: dto.creditor,
        totalAmount: dto.totalAmount,
        interestRate: dto.interestRate,
        installmentAmount: dto.installmentAmount,
        dueDay: dto.dueDay,
      },
      select: DEBT_SELECT,
    });
    return (await this.withSummaries([debt]))[0]!;
  }

  async getById(user: AuthUser, id: string): Promise<DebtWithSummary> {
    const debt = await this.findDebtOrThrow(user, id);
    return (await this.withSummaries([debt]))[0]!;
  }

  async update(user: AuthUser, id: string, dto: UpdateDebtDto): Promise<DebtWithSummary> {
    await this.findDebtOrThrow(user, id);
    const debt = await this.prisma.debt.update({
      where: { id },
      data: {
        name: dto.name,
        creditor: dto.creditor,
        totalAmount: dto.totalAmount,
        interestRate: dto.interestRate,
        installmentAmount: dto.installmentAmount,
        dueDay: dto.dueDay,
        status: dto.status,
      },
      select: DEBT_SELECT,
    });
    return (await this.withSummaries([debt]))[0]!;
  }

  async remove(user: AuthUser, id: string): Promise<void> {
    await this.findDebtOrThrow(user, id);
    await this.prisma.debt.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async addPayment(
    user: AuthUser,
    debtId: string,
    dto: CreateDebtPaymentDto,
  ): Promise<DebtPaymentRecord> {
    await this.findDebtOrThrow(user, debtId);
    return this.prisma.debtPayment.create({
      data: {
        debtId,
        amount: dto.amount,
        date: dto.date ?? new Date(),
        note: dto.note,
      },
      select: PAYMENT_SELECT,
    });
  }

  async listPayments(user: AuthUser, debtId: string): Promise<DebtPaymentRecord[]> {
    await this.findDebtOrThrow(user, debtId);
    return this.prisma.debtPayment.findMany({
      where: { debtId },
      select: PAYMENT_SELECT,
      orderBy: { date: 'desc' },
    });
  }

  private async findDebtOrThrow(user: AuthUser, id: string): Promise<DebtBase> {
    const debt = await this.prisma.debt.findFirst({
      where: { id, familyId: user.familyId, deletedAt: null },
      select: DEBT_SELECT,
    });
    if (!debt) {
      throw new NotFoundException('Dívida não encontrada');
    }
    return debt;
  }

  private async withSummaries(debts: DebtBase[]): Promise<DebtWithSummary[]> {
    const ids = debts.map((d) => d.id);
    if (ids.length === 0) {
      return [];
    }
    const paid = await this.prisma.debtPayment.groupBy({
      by: ['debtId'],
      where: { debtId: { in: ids } },
      _sum: { amount: true },
    });
    const paidAmountMap = new Map(paid.map((p) => [p.debtId, p._sum.amount ?? new Prisma.Decimal(0)]));

    return debts.map((debt) => {
      const paidAmount = paidAmountMap.get(debt.id) ?? new Prisma.Decimal(0);
      const remainingAmount = Prisma.Decimal.max(0, debt.totalAmount.minus(paidAmount));

      return {
        ...debt,
        paidAmount: paidAmount.toString(),
        remainingAmount: remainingAmount.toString(),
      };
    });
  }
}
