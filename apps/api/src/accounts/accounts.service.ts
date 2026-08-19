import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@gotardo/db';
import { PrismaService } from '../prisma/prisma.module';
import type { AuthUser } from '../common/auth-user';
import type { CreateAccountDto } from './dto/create-account.dto';
import type { UpdateAccountDto } from './dto/update-account.dto';

export type AccountRecord = Prisma.AccountGetPayload<true>;

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
}
