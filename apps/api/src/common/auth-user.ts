import type { FamilyRole } from '@gotardo/db';

export type AuthUser = {
  id: string;
  email: string;
  familyId: string;
  role: FamilyRole;
};

export type JwtPayload = {
  sub: string;
  email: string;
  familyId: string;
  role: FamilyRole;
};
