import { Transform, Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PaymentMethod, TransactionSource, TransactionStatus, TransactionType } from '@gotardo/db';

// Uma string vazia num campo de referência opcional/anulável (categoryId/
// envelopeId/incomeSourceId) é tratada como equivalente a `null` explícito
// (limpar a referência), não como um id de fato — sem isso, "" passa direto
// pela checagem de posse em ensureOptionalRefs (que trata string vazia como
// falsy e pula) e quebra no Prisma com FK constraint (500 não tratado).
const emptyStringToNull = ({ value }: { value: unknown }) => (value === '' ? null : value);

export class UpdateTransactionDto {
  @IsOptional()
  @IsString()
  accountId?: string;

  @IsOptional()
  @Transform(emptyStringToNull)
  @IsString()
  categoryId?: string | null;

  @IsOptional()
  @Transform(emptyStringToNull)
  @IsString()
  envelopeId?: string | null;

  @IsOptional()
  @Transform(emptyStringToNull)
  @IsString()
  incomeSourceId?: string | null;

  @IsOptional()
  @Transform(emptyStringToNull)
  @IsString()
  memberId?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  description?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount?: number;

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
  paymentMethod?: PaymentMethod | null;
}
