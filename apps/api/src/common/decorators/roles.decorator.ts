import { SetMetadata } from '@nestjs/common';
import type { FamilyRole } from '@gotardo/db';

export const ROLES_KEY = 'roles';

export const Roles = (...roles: FamilyRole[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);
