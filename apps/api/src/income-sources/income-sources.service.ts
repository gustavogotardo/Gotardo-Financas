import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@gotardo/db';
import { PrismaService } from '../prisma/prisma.module';
import type { AuthUser } from '../common/auth-user';
import type { CreateIncomeSourceDto } from './dto/create-income-source.dto';
import type { UpdateIncomeSourceDto } from './dto/update-income-source.dto';

export type IncomeSourceRecord = Prisma.IncomeSourceGetPayload<true>;

@Injectable()
export class IncomeSourcesService {
  constructor(private readonly prisma: PrismaService) {}

  list(user: AuthUser): Promise<IncomeSourceRecord[]> {
    return this.prisma.incomeSource.findMany({
      where: { familyId: user.familyId },
      orderBy: { name: 'asc' },
    });
  }

  create(user: AuthUser, dto: CreateIncomeSourceDto): Promise<IncomeSourceRecord> {
    return this.prisma.incomeSource.create({
      data: {
        name: dto.name,
        description: dto.description,
        expectedAmount: dto.expectedAmount,
        isActive: dto.isActive,
        familyId: user.familyId,
      },
    });
  }

  async getById(user: AuthUser, id: string): Promise<IncomeSourceRecord> {
    const incomeSource = await this.prisma.incomeSource.findFirst({
      where: { id, familyId: user.familyId },
    });
    if (!incomeSource) {
      throw new NotFoundException('Fonte de renda não encontrada');
    }
    return incomeSource;
  }

  async update(
    user: AuthUser,
    id: string,
    dto: UpdateIncomeSourceDto,
  ): Promise<IncomeSourceRecord> {
    await this.getById(user, id);
    return this.prisma.incomeSource.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        expectedAmount: dto.expectedAmount,
        isActive: dto.isActive,
      },
    });
  }

  async remove(user: AuthUser, id: string): Promise<void> {
    await this.getById(user, id);
    await this.prisma.incomeSource.delete({ where: { id } });
  }
}
