import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ReportsService,
  type AccountStatement,
  type AnomalyRow,
  type CashflowResponse,
  type CategoryExpenseRow,
  type EnvelopeExpenseRow,
  type HealthIndicatorsResponse,
  type PaymentMethodRow,
  type ProjectionResponse,
} from './reports.service';
import type { AuthUser } from '../common/auth-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ReportRangeDto } from './dto/report-range.dto';
import { ProjectionQueryDto } from './dto/projection-query.dto';

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

  @Get('payment-methods')
  paymentMethods(
    @CurrentUser() user: AuthUser,
    @Query() query: ReportRangeDto,
  ): Promise<PaymentMethodRow[]> {
    return this.reports.paymentMethods(user, query.from, query.to);
  }

  @Get('anomalies')
  anomalies(
    @CurrentUser() user: AuthUser,
    @Query() query: ReportRangeDto,
  ): Promise<AnomalyRow[]> {
    return this.reports.anomalies(user, query.from, query.to);
  }

  @Get('health-indicators')
  healthIndicators(@CurrentUser() user: AuthUser): Promise<HealthIndicatorsResponse> {
    return this.reports.healthIndicators(user);
  }

  @Get('projection')
  projection(
    @CurrentUser() user: AuthUser,
    @Query() query: ProjectionQueryDto,
  ): Promise<ProjectionResponse> {
    return this.reports.projection(user, query);
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
