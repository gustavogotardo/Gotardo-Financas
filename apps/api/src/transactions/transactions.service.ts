import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
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
    const suggestedCategoryId = dto.categoryId
      ? undefined
      : await this.suggester.suggest(user.familyId, dto.description);

    if (dto.installments && dto.installments >= 2) {
      if (Math.floor(Math.round(dto.amount * 100) / dto.installments) < 1) {
        throw new BadRequestException('Valor muito baixo para o número de parcelas informado');
      }
      return this.createInstallments(user, dto, suggestedCategoryId);
    }

    const type = dto.type ?? TransactionType.EXPENSE;
    const status = dto.status ?? TransactionStatus.PENDING;
    const delta = this.balanceDelta(type, new Prisma.Decimal(dto.amount));
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

  /**
   * Cria uma compra parcelada como N transações PENDING vinculadas por
   * `installmentGroupId`. Nenhuma delta de saldo é aplicado na criação, já
   * que todas as parcelas nascem PENDING (mesmo comportamento do fluxo
   * PENDING de uma transação avulsa). Retorna a primeira parcela.
   */
  private async createInstallments(
    user: AuthUser,
    dto: CreateTransactionDto,
    suggestedCategoryId: string | null | undefined,
  ): Promise<TransactionRecord> {
    const total = dto.installments!;
    const amounts = this.splitAmount(dto.amount, total);
    const baseDate = dto.date ?? new Date();
    const type = dto.type ?? TransactionType.EXPENSE;
    const installmentGroupId = randomUUID();

    return this.prisma.$transaction(async (tx) => {
      let first: TransactionRecord | undefined;
      for (let i = 0; i < total; i++) {
        const installmentNumber = i + 1;
        const created = await tx.transaction.create({
          data: {
            familyId: user.familyId,
            accountId: dto.accountId,
            categoryId: dto.categoryId,
            suggestedCategoryId,
            envelopeId: dto.envelopeId,
            description: dto.description,
            amount: amounts[i]!,
            type,
            status: TransactionStatus.PENDING,
            source: dto.source ?? TransactionSource.MANUAL,
            paymentMethod: dto.paymentMethod,
            date: this.addMonthsUtc(baseDate, i),
            installmentNumber,
            installmentTotal: total,
            installmentGroupId,
          },
          include: TX_INCLUDE,
        });
        if (installmentNumber === 1) {
          first = created;
        }
      }
      return first!;
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

    // Campos compartilhados de parcelamento: description/categoryId/envelopeId/paymentMethod
    // propagam para as parcelas irmãs PENDING (amount/date/status/type/accountId são
    // legitimamente por parcela e nunca propagam).
    const sharedChanges: Prisma.TransactionUncheckedUpdateManyInput = {};
    if (dto.description !== undefined) {
      sharedChanges.description = dto.description;
    }
    if (dto.categoryId !== undefined) {
      sharedChanges.categoryId = dto.categoryId;
    }
    if (dto.envelopeId !== undefined) {
      sharedChanges.envelopeId = dto.envelopeId;
    }
    if (dto.paymentMethod !== undefined) {
      sharedChanges.paymentMethod = dto.paymentMethod;
    }
    const hasSharedChanges = Object.keys(sharedChanges).length > 0;

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
      if (current.installmentGroupId && hasSharedChanges) {
        await tx.transaction.updateMany({
          where: {
            installmentGroupId: current.installmentGroupId,
            status: TransactionStatus.PENDING,
            id: { not: id },
            deletedAt: null,
            familyId: user.familyId,
          },
          data: sharedChanges,
        });
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

  /**
   * Divide `amount` em `count` parcelas iguais (2 casas decimais), colocando
   * qualquer resto de arredondamento na última parcela para que a soma seja
   * exatamente igual ao valor original.
   */
  private splitAmount(amount: number, count: number): string[] {
    const totalCents = Math.round(amount * 100);
    const baseCents = Math.floor(totalCents / count);
    const amounts: string[] = [];
    for (let i = 0; i < count; i++) {
      amounts.push((baseCents / 100).toFixed(2));
    }
    const remainderCents = totalCents - baseCents * count;
    const lastIndex = count - 1;
    amounts[lastIndex] = ((baseCents + remainderCents) / 100).toFixed(2);
    return amounts;
  }

  /**
   * Soma `months` meses a `date`, preservando o horário (aritmética em UTC).
   * Quando o dia original não existe no mês de destino (ex.: 31 em um mês
   * com 30 dias, ou 29/30/31 de fevereiro), o dia é ajustado ("clampado")
   * para o último dia válido do mês de destino, em vez de deixar o
   * `Date.UTC` normalizar (rolar) para o mês seguinte.
   */
  private addMonthsUtc(date: Date, months: number): Date {
    const targetYear = date.getUTCFullYear();
    const targetMonth = date.getUTCMonth() + months;
    const lastDayOfTargetMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
    const day = Math.min(date.getUTCDate(), lastDayOfTargetMonth);
    return new Date(
      Date.UTC(
        targetYear,
        targetMonth,
        day,
        date.getUTCHours(),
        date.getUTCMinutes(),
        date.getUTCSeconds(),
        date.getUTCMilliseconds(),
      ),
    );
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
