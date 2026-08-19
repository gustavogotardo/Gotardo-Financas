import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TransactionStatus, TransactionType } from '@gotardo/db';
import { PrismaService } from '../prisma/prisma.module';
import type { AuthUser } from '../common/auth-user';
import type { CreateEnvelopeDto } from './dto/create-envelope.dto';
import type { UpdateEnvelopeDto } from './dto/update-envelope.dto';
import type { CreateAllocationDto } from './dto/create-allocation.dto';

const ENVELOPE_SELECT = {
  id: true,
  name: true,
  icon: true,
  color: true,
  targetAmount: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

type EnvelopeBase = Prisma.EnvelopeGetPayload<{ select: typeof ENVELOPE_SELECT }>;

export type EnvelopeWithSummary = EnvelopeBase & {
  allocated: string;
  spent: string;
  balance: string;
};

const ALLOCATION_SELECT = {
  id: true,
  amount: true,
  date: true,
  note: true,
  createdAt: true,
} as const;

export type EnvelopeAllocationRecord = Prisma.EnvelopeAllocationGetPayload<{
  select: typeof ALLOCATION_SELECT;
}>;

@Injectable()
export class EnvelopesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: AuthUser): Promise<EnvelopeWithSummary[]> {
    const envelopes = await this.prisma.envelope.findMany({
      where: { familyId: user.familyId },
      select: ENVELOPE_SELECT,
      orderBy: { name: 'asc' },
    });
    return this.withSummaries(user, envelopes);
  }

  async create(user: AuthUser, dto: CreateEnvelopeDto): Promise<EnvelopeWithSummary> {
    const envelope = await this.prisma.envelope.create({
      data: {
        name: dto.name,
        icon: dto.icon,
        color: dto.color,
        targetAmount: dto.targetAmount,
        familyId: user.familyId,
      },
      select: ENVELOPE_SELECT,
    });
    return { ...envelope, allocated: '0', spent: '0', balance: '0' };
  }

  async getById(user: AuthUser, id: string): Promise<EnvelopeWithSummary> {
    const envelope = await this.prisma.envelope.findFirst({
      where: { id, familyId: user.familyId },
      select: ENVELOPE_SELECT,
    });
    if (!envelope) {
      throw new NotFoundException('Envelope não encontrado');
    }
    return (await this.withSummaries(user, [envelope]))[0]!;
  }

  async update(user: AuthUser, id: string, dto: UpdateEnvelopeDto): Promise<EnvelopeWithSummary> {
    await this.getById(user, id);
    const envelope = await this.prisma.envelope.update({
      where: { id },
      data: {
        name: dto.name,
        icon: dto.icon,
        color: dto.color,
        targetAmount: dto.targetAmount,
        isActive: dto.isActive,
      },
      select: ENVELOPE_SELECT,
    });
    return (await this.withSummaries(user, [envelope]))[0]!;
  }

  async remove(user: AuthUser, id: string): Promise<void> {
    await this.getById(user, id);
    const hasTransactions = await this.prisma.transaction.count({
      where: { envelopeId: id, deletedAt: null },
    });
    if (hasTransactions > 0) {
      throw new ConflictException('Mova ou exclua as transações do envelope primeiro');
    }
    await this.prisma.$transaction([
      this.prisma.envelopeAllocation.deleteMany({ where: { envelopeId: id } }),
      this.prisma.envelope.delete({ where: { id } }),
    ]);
  }

  async allocate(
    user: AuthUser,
    envelopeId: string,
    dto: CreateAllocationDto,
  ): Promise<EnvelopeAllocationRecord> {
    await this.getById(user, envelopeId);
    return this.prisma.envelopeAllocation.create({
      data: {
        envelopeId,
        amount: dto.amount,
        date: dto.date ?? new Date(),
        note: dto.note,
      },
      select: ALLOCATION_SELECT,
    });
  }

  async listAllocations(user: AuthUser, envelopeId: string): Promise<EnvelopeAllocationRecord[]> {
    await this.getById(user, envelopeId);
    return this.prisma.envelopeAllocation.findMany({
      where: { envelopeId },
      select: ALLOCATION_SELECT,
      orderBy: { date: 'desc' },
    });
  }

  private async withSummaries(
    user: AuthUser,
    envelopes: EnvelopeBase[],
  ): Promise<EnvelopeWithSummary[]> {
    const ids = envelopes.map((e) => e.id);
    if (ids.length === 0) {
      return [];
    }
    const [allocated, spent] = await Promise.all([
      this.prisma.envelopeAllocation.groupBy({
        by: ['envelopeId'],
        where: { envelopeId: { in: ids } },
        _sum: { amount: true },
      }),
      this.prisma.transaction.groupBy({
        by: ['envelopeId'],
        where: {
          envelopeId: { in: ids },
          familyId: user.familyId,
          type: TransactionType.EXPENSE,
          status: TransactionStatus.CONFIRMED,
          deletedAt: null,
        },
        _sum: { amount: true },
      }),
    ]);
    const allocatedMap = new Map(
      allocated.map((a) => [a.envelopeId, a._sum.amount ?? new Prisma.Decimal(0)]),
    );
    const spentMap = new Map(
      spent.map((s) => [s.envelopeId, s._sum.amount ?? new Prisma.Decimal(0)]),
    );
    return envelopes.map((envelope) => {
      const allocatedValue = allocatedMap.get(envelope.id) ?? new Prisma.Decimal(0);
      const spentValue = spentMap.get(envelope.id) ?? new Prisma.Decimal(0);
      return {
        ...envelope,
        allocated: allocatedValue.toString(),
        spent: spentValue.toString(),
        balance: allocatedValue.minus(spentValue).toString(),
      };
    });
  }
}
