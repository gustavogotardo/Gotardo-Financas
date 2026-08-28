import { Transform, Type } from 'class-transformer';
import {
  IsDate,
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
import { PaymentMethod, TransactionSource, TransactionStatus, TransactionType } from '@gotardo/db';

// Uma string vazia num campo de referência opcional (categoryId/envelopeId/
// incomeSourceId) não deve ser tratada como "sem valor" e nem validada como
// um id — sem isso, "" passa direto pela checagem de posse (ensureOptionalRefs
// trata string vazia como falsy e pula) e quebra no Prisma com FK constraint
// (500 não tratado) em vez de simplesmente ser ignorada como "não informado".
const emptyStringToUndefined = ({ value }: { value: unknown }) =>
  value === '' ? undefined : value;

export class CreateTransactionDto {
  @IsString()
  accountId!: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  categoryId?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  envelopeId?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  incomeSourceId?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  memberId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(300)
  description!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount!: number;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  date?: Date;

  @IsOptional()
  @IsEnum(TransactionType)
  type?: TransactionType;

  @IsOptional()
  @IsEnum(TransactionStatus)
  status?: TransactionStatus;

  @IsOptional()
  @IsEnum(TransactionSource)
  source?: TransactionSource;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(60)
  installments?: number;
}
