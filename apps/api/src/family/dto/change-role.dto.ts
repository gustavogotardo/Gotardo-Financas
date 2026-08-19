import { IsEnum } from 'class-validator';
import { FamilyRole } from '@gotardo/db';

export class ChangeRoleDto {
  @IsEnum(FamilyRole)
  role!: FamilyRole;
}
