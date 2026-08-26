import { Type } from 'class-transformer';
import { IsDate, IsNumber, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';

export class CreateDebtPaymentDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount!: number;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  date?: Date;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}
