import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AccountType, Prisma, TransactionStatus } from '@gotardo/db';
import { PrismaService } from '../prisma/prisma.module';
import type { AuthUser } from '../common/auth-user';
import type { CreateAccountDto } from './dto/create-account.dto';
import type { UpdateAccountDto } from './dto/update-account.dto';

export type AccountRecord = Prisma.AccountGetPayload<true>;

const INVOICE_TX_SELECT = {
  id: true,
  description: true,
  amount: true,
  type: true,
  status: true,
  date: true,
  installmentNumber: true,
  installmentTotal: true,
  installmentGroupId: true,
  categoryId: true,
} as const;

export type InvoiceTransaction = Prisma.TransactionGetPayload<{
  select: typeof INVOICE_TX_SELECT;
}>;

export type AccountInvoice = {
  accountId: string;
  period: string;
  closingDate: Date;
  dueDate: Date;
  transactions: InvoiceTransaction[];
  total: string;
};

const PERIOD_PATTERN = /^(\d{4})-(\d{2})$/;

@Injectable()
export class AccountsService {
  constructor(private readonly prisma: PrismaService) {}

  list(user: AuthUser): Promise<AccountRecord[]> {
    return this.prisma.account.findMany({
      where: { familyId: user.familyId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
  }

  create(user: AuthUser, dto: CreateAccountDto): Promise<AccountRecord> {
    return this.prisma.account.create({
      data: {
        name: dto.name,
        type: dto.type,
        institution: dto.institution,
        currency: dto.currency,
        creditLimit: dto.creditLimit,
        billingDay: dto.billingDay,
        dueDay: dto.dueDay,
        familyId: user.familyId,
      },
    });
  }

  async getById(user: AuthUser, id: string): Promise<AccountRecord> {
    const account = await this.prisma.account.findFirst({
      where: { id, familyId: user.familyId, deletedAt: null },
    });
    if (!account) {
      throw new NotFoundException('Conta não encontrada');
    }
    return account;
  }

  async update(user: AuthUser, id: string, dto: UpdateAccountDto): Promise<AccountRecord> {
    await this.getById(user, id);
    return this.prisma.account.update({
      where: { id },
      data: {
        name: dto.name,
        type: dto.type,
        institution: dto.institution,
        currency: dto.currency,
        creditLimit: dto.creditLimit,
        billingDay: dto.billingDay,
        dueDay: dto.dueDay,
      },
    });
  }

  async remove(user: AuthUser, id: string): Promise<void> {
    await this.getById(user, id);
    await this.prisma.account.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  /**
   * Fatura (invoice) de um cartão de crédito, computada sob demanda (não persistida).
   *
   * Ciclo de faturamento: a fatura do mês M fecha no `billingDay` do mês M e contém
   * transações datadas do dia seguinte ao `billingDay` do mês M-1 até o `billingDay`
   * do mês M, inclusive. O vencimento (`dueDate`) é sempre o `dueDay` do mês seguinte
   * ao mês de fechamento.
   */
  async getInvoice(user: AuthUser, accountId: string, period?: string): Promise<AccountInvoice> {
    const account = await this.prisma.account.findFirst({
      where: {
        id: accountId,
        familyId: user.familyId,
        type: AccountType.CREDIT_CARD,
        deletedAt: null,
      },
    });
    if (!account) {
      throw new NotFoundException('Conta não encontrada');
    }
    if (account.billingDay === null || account.dueDay === null) {
      throw new BadRequestException('Cartão sem dia de fechamento/vencimento configurado');
    }

    const { year, monthIndex0, label } = this.resolvePeriod(period);
    const billingDay = account.billingDay;
    const dueDay = account.dueDay;

    // Janela: (billingDay+1 do mês anterior, 00:00) até (billingDay do mês M, 23:59:59.999).
    const windowStart = new Date(Date.UTC(year, monthIndex0 - 1, billingDay + 1, 0, 0, 0, 0));
    const closingDate = new Date(Date.UTC(year, monthIndex0, billingDay, 23, 59, 59, 999));
    // Vencimento: sempre o dueDay do mês seguinte ao mês de fechamento.
    const dueDate = new Date(Date.UTC(year, monthIndex0 + 1, dueDay, 0, 0, 0, 0));

    const transactions = await this.prisma.transaction.findMany({
      where: {
        accountId,
        familyId: user.familyId,
        deletedAt: null,
        status: { not: TransactionStatus.REJECTED },
        date: { gte: windowStart, lte: closingDate },
      },
      select: INVOICE_TX_SELECT,
      orderBy: { date: 'asc' },
    });

    const total = transactions.reduce((sum, tx) => {
      if (tx.type === 'EXPENSE') {
        return sum.plus(tx.amount);
      }
      if (tx.type === 'INCOME') {
        return sum.minus(tx.amount);
      }
      return sum;
    }, new Prisma.Decimal(0));

    return {
      accountId,
      period: label,
      closingDate,
      dueDate,
      transactions,
      total: total.toString(),
    };
  }

  private resolvePeriod(period?: string): { year: number; monthIndex0: number; label: string } {
    if (!period) {
      const now = new Date();
      return {
        year: now.getUTCFullYear(),
        monthIndex0: now.getUTCMonth(),
        label: `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`,
      };
    }
    const match = PERIOD_PATTERN.exec(period);
    if (!match) {
      throw new BadRequestException('Período inválido, use o formato AAAA-MM');
    }
    const year = Number(match[1]);
    const month = Number(match[2]);
    if (month < 1 || month > 12) {
      throw new BadRequestException('Período inválido, use o formato AAAA-MM');
    }
    return { year, monthIndex0: month - 1, label: period };
  }
}
