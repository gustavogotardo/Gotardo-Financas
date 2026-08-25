import { FamilyRole } from '@gotardo/db';

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

/**
 * Constrói um `AuthUser` "de sistema" para uso em jobs de background (cron,
 * workers) que precisam chamar serviços request-scoped (ex.: `GoalsService`,
 * `AccountsService`) apenas para reaproveitar seu escopo por tenant
 * (`familyId`). `id`/`email` ficam vazios e `role` é fixado em `OWNER` — os
 * chamadores autorizados a usar isso não devem depender desses campos para
 * nada além de `familyId`. Não use isto para simular um usuário real; é
 * exclusivamente a via sancionada para contexto de sistema/cron.
 */
export function systemAuthUser(familyId: string): AuthUser {
  return { id: '', email: '', familyId, role: FamilyRole.OWNER };
}
