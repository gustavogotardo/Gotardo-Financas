import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator';
import type { ProjectionScenario } from '../reports.service';

const PROJECTION_SCENARIOS: readonly ProjectionScenario[] = [
  'CONSERVATIVE',
  'BASE',
  'OPTIMISTIC',
  'CUSTOM',
];

export class ProjectionQueryDto {
  @IsOptional()
  @IsIn(PROJECTION_SCENARIOS)
  scenario?: ProjectionScenario;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  months?: number;

  /** Taxa mensal de crescimento de renda (ex.: 0.01 = 1% ao mês). */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-1)
  @Max(1)
  incomeGrowthRate?: number;

  /** Inflação mensal-base informada pelo chamador (ex.: uma leitura atual do IPCA). */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-1)
  @Max(1)
  baseMonthlyInflation?: number;

  /** Só é considerado quando `scenario=CUSTOM`. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  incomeMultiplier?: number;

  /** Só é considerado quando `scenario=CUSTOM`. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  expenseMultiplier?: number;

  /** Só é considerado quando `scenario=CUSTOM`. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-1)
  @Max(1)
  inflationDelta?: number;
}
