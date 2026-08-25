import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateCategoryDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  icon?: string;

  @IsOptional()
  @IsString()
  parentId?: string | null;

  // isEssential/isFixed são colunas NOT NULL — um `null` explícito no corpo
  // da requisição passaria batido por @IsOptional() (que trata null como
  // "ausente") e quebraria no Prisma com um erro não tratado. Trata null
  // como equivalente a "não informado" antes da validação rodar.
  @IsOptional()
  @Transform(({ value }) => (value === null ? undefined : value))
  @IsBoolean()
  isEssential?: boolean;

  @IsOptional()
  @Transform(({ value }) => (value === null ? undefined : value))
  @IsBoolean()
  isFixed?: boolean;
}
