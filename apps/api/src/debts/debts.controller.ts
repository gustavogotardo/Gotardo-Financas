import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { FamilyRole } from '@gotardo/db';
import { DebtsService, type DebtPaymentRecord, type DebtWithSummary } from './debts.service';
import type { AuthUser } from '../common/auth-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateDebtDto } from './dto/create-debt.dto';
import { UpdateDebtDto } from './dto/update-debt.dto';
import { CreateDebtPaymentDto } from './dto/create-debt-payment.dto';

@Controller('debts')
export class DebtsController {
  constructor(private readonly debts: DebtsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<DebtWithSummary[]> {
    return this.debts.list(user);
  }

  @Roles(FamilyRole.OWNER, FamilyRole.ADMIN)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateDebtDto): Promise<DebtWithSummary> {
    return this.debts.create(user, dto);
  }

  @Get(':id')
  getById(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<DebtWithSummary> {
    return this.debts.getById(user, id);
  }

  @Roles(FamilyRole.OWNER, FamilyRole.ADMIN)
  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateDebtDto,
  ): Promise<DebtWithSummary> {
    return this.debts.update(user, id, dto);
  }

  @Roles(FamilyRole.OWNER, FamilyRole.ADMIN)
  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<void> {
    await this.debts.remove(user, id);
  }

  @Roles(FamilyRole.OWNER, FamilyRole.ADMIN)
  @Post(':id/payments')
  addPayment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CreateDebtPaymentDto,
  ): Promise<DebtPaymentRecord> {
    return this.debts.addPayment(user, id, dto);
  }

  @Get(':id/payments')
  listPayments(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<DebtPaymentRecord[]> {
    return this.debts.listPayments(user, id);
  }
}
