import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ReportsService,
  type AccountStatement,
  type CashflowResponse,
  type CategoryExpenseRow,
  type EnvelopeExpenseRow,
} from './reports.service';
import type { AuthUser } from '../common/auth-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ReportRangeDto } from './dto/report-range.dto';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('cashflow')
  cashflow(
    @CurrentUser() user: AuthUser,
    @Query() query: ReportRangeDto,
  ): Promise<CashflowResponse> {
    return this.reports.cashflow(user, query.from, query.to);
  }

  @Get('expenses-by-category')
  expensesByCategory(
    @CurrentUser() user: AuthUser,
    @Query() query: ReportRangeDto,
  ): Promise<CategoryExpenseRow[]> {
    return this.reports.expensesByCategory(user, query.from, query.to);
  }

  @Get('expenses-by-envelope')
  expensesByEnvelope(
    @CurrentUser() user: AuthUser,
    @Query() query: ReportRangeDto,
  ): Promise<EnvelopeExpenseRow[]> {
    return this.reports.expensesByEnvelope(user, query.from, query.to);
  }

  @Get('account-statement/:accountId')
  accountStatement(
    @CurrentUser() user: AuthUser,
    @Param('accountId') accountId: string,
    @Query() query: ReportRangeDto,
  ): Promise<AccountStatement> {
    return this.reports.accountStatement(user, accountId, query.from, query.to);
  }
}
