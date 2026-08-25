import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateIncomeSourceDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  expectedAmount?: number;

  // isActive é coluna NOT NULL (default true) — um `null` explícito no corpo
  // da requisição passaria batido por @IsOptional() (que trata null como
  // "ausente") e quebraria no Prisma com um erro não tratado. Trata null
  // como equivalente a "não informado" antes da validação rodar.
  @IsOptional()
  @Transform(({ value }) => (value === null ? undefined : value))
  @IsBoolean()
  isActive?: boolean;
}
