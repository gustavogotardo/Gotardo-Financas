import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { AccountType, Currency } from '@gotardo/db';

export class UpdateAccountDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsEnum(AccountType)
  type?: AccountType;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  institution?: string;

  @IsOptional()
  @IsEnum(Currency)
  currency?: Currency;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  creditLimit?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(28)
  billingDay?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(28)
  dueDay?: number;
}
