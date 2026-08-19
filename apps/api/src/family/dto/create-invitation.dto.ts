import { IsEmail, IsEnum, IsOptional } from 'class-validator';
import { FamilyRole } from '@gotardo/db';

export class CreateInvitationDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsEnum(FamilyRole)
  role?: FamilyRole;
}
