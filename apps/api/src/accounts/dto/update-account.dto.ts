import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
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
}
