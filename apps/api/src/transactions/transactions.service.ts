import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TransactionSource, TransactionStatus, TransactionType } from '@gotardo/db';
import { PrismaService } from '../prisma/prisma.module';
import { CategorySuggesterService } from '../ml/category-suggester.service';
import type { AuthUser } from '../common/auth-user';
import type { CreateTransactionDto } from './dto/create-transaction.dto';
import type { UpdateTransactionDto } from './dto/update-transaction.dto';

const TX_INCLUDE = {
  account: { select: { id: true, name: true, type: true, currency: true } },
  category: { select: { id: true, name: true, parentId: true } },
  suggestedCategory: { select: { id: true, name: true } },
} as const;

export type TransactionRecord = Prisma.TransactionGetPayload<{ include: typeof TX_INCLUDE }>;

@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly suggester: CategorySuggesterService,
  ) {}

  list(user: AuthUser): Promise<TransactionRecord[]> {
    return this.prisma.transaction.findMany({
      where: { familyId: user.familyId, deletedAt: null },
      include: TX_INCLUDE,
      orderBy: { date: 'desc' },
    });
  }

  async create(user: AuthUser, dto: CreateTransactionDto): Promise<TransactionRecord> {
    await this.ensureAccount(user, dto.accountId);
    await this.ensureOptionalRefs(user, dto.categoryId, dto.envelopeId);
    const type = dto.type ?? TransactionType.EXPENSE;
    const status = dto.status ?? TransactionStatus.PENDING;
    const delta = this.balanceDelta(type, new Prisma.Decimal(dto.amount));
    const suggestedCategoryId = dto.categoryId
      ? undefined
      : await this.suggester.suggest(user.familyId, dto.description);
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.transaction.create({
        data: {
          familyId: user.familyId,
          accountId: dto.accountId,
          categoryId: dto.categoryId,
          suggestedCategoryId,
          envelopeId: dto.envelopeId,
          description: dto.description,
          amount: dto.amount,
          type,
          status,
          source: dto.source ?? TransactionSource.MANUAL,
          paymentMethod: dto.paymentMethod,
          date: dto.date ?? new Date(),
        },
        include: TX_INCLUDE,
      });
      if (status === TransactionStatus.CONFIRMED) {
        await this.applyDelta(tx, dto.accountId, delta);
      }
      return created;
    });
  }

  async getById(user: AuthUser, id: string): Promise<TransactionRecord> {
    const tx = await this.prisma.transaction.findFirst({
      where: { id, familyId: user.familyId, deletedAt: null },
      include: TX_INCLUDE,
    });
    if (!tx) {
      throw new NotFoundException('Transação não encontrada');
    }
    return tx;
  }

  async update(user: AuthUser, id: string, dto: UpdateTransactionDto): Promise<TransactionRecord> {
    const current = await this.getById(user, id);
    const nextAccountId = dto.accountId ?? current.accountId;
    const nextType = dto.type ?? current.type;
    const nextStatus = dto.status ?? current.status;
    const nextAmount = new Prisma.Decimal(dto.amount ?? Number(current.amount));
    if (nextAccountId !== current.accountId) {
      await this.ensureAccount(user, nextAccountId);
    }
    await this.ensureOptionalRefs(
      user,
      dto.categoryId ?? current.categoryId,
      dto.envelopeId ?? current.envelopeId,
    );
    const wasConfirmed = current.status === TransactionStatus.CONFIRMED;
    const willBeConfirmed = nextStatus === TransactionStatus.CONFIRMED;
    const oldDelta = this.balanceDelta(current.type, new Prisma.Decimal(Number(current.amount)));
    const newDelta = this.balanceDelta(nextType, nextAmount);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.transaction.update({
        where: { id },
        data: {
          description: dto.description,
          accountId: dto.accountId,
          categoryId: dto.categoryId,
          envelopeId: dto.envelopeId,
          date: dto.date,
          type: dto.type,
          status: dto.status,
          source: dto.source,
          paymentMethod: dto.paymentMethod,
          ...(dto.amount !== undefined && { amount: dto.amount }),
        },
        include: TX_INCLUDE,
      });
      if (wasConfirmed) {
        await this.applyDelta(tx, current.accountId, oldDelta.negated());
      }
      if (willBeConfirmed) {
        await this.applyDelta(tx, nextAccountId, newDelta);
      }
      return updated;
    });
  }

  async remove(user: AuthUser, id: string): Promise<void> {
    const current = await this.getById(user, id);
    const delta = this.balanceDelta(current.type, new Prisma.Decimal(Number(current.amount)));
    await this.prisma.$transaction(async (tx) => {
      await tx.transaction.update({ where: { id }, data: { deletedAt: new Date() } });
      if (current.status === TransactionStatus.CONFIRMED) {
        await this.applyDelta(tx, current.accountId, delta.negated());
      }
    });
  }

  private async ensureAccount(user: AuthUser, accountId: string): Promise<void> {
    const account = await this.prisma.account.findFirst({
      where: { id: accountId, familyId: user.familyId },
    });
    if (!account) {
      throw new NotFoundException('Conta não encontrada');
    }
  }

  private async ensureOptionalRefs(
    user: AuthUser,
    categoryId?: string | null,
    envelopeId?: string | null,
  ): Promise<void> {
    if (categoryId) {
      const category = await this.prisma.category.findFirst({
        where: { id: categoryId, familyId: user.familyId },
      });
      if (!category) {
        throw new NotFoundException('Categoria não encontrada');
      }
    }
    if (envelopeId) {
      const envelope = await this.prisma.envelope.findFirst({
        where: { id: envelopeId, familyId: user.familyId },
      });
      if (!envelope) {
        throw new NotFoundException('Envelope não encontrado');
      }
    }
  }

  private balanceDelta(type: TransactionType, amount: Prisma.Decimal): Prisma.Decimal {
    if (type === TransactionType.INCOME) {
      return amount;
    }
    if (type === TransactionType.EXPENSE) {
      return amount.negated();
    }
    return new Prisma.Decimal(0);
  }

  private async applyDelta(
    tx: Prisma.TransactionClient,
    accountId: string,
    delta: Prisma.Decimal,
  ): Promise<void> {
    if (delta.isZero()) {
      return;
    }
    await tx.account.update({
      where: { id: accountId },
      data: { balance: { increment: delta } },
    });
  }
}
