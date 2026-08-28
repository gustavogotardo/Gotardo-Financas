import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { FamilyRole } from '@gotardo/db';
import { TransactionsService, type TransactionRecord } from './transactions.service';
import type { AuthUser } from '../common/auth-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';

@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactions: TransactionsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('memberId') memberId?: string,
  ): Promise<TransactionRecord[]> {
    return this.transactions.list(user, memberId);
  }

  @Roles(FamilyRole.OWNER, FamilyRole.ADMIN)
  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateTransactionDto,
  ): Promise<TransactionRecord> {
    return this.transactions.create(user, dto);
  }

  @Get(':id')
  getById(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<TransactionRecord> {
    return this.transactions.getById(user, id);
  }

  @Roles(FamilyRole.OWNER, FamilyRole.ADMIN)
  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateTransactionDto,
  ): Promise<TransactionRecord> {
    return this.transactions.update(user, id, dto);
  }

  @Roles(FamilyRole.OWNER, FamilyRole.ADMIN)
  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<void> {
    await this.transactions.remove(user, id);
  }
}
