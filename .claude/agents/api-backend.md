---
name: api-backend
description: Use for NestJS API work in apps/api — new endpoints, services, DTOs, guards, tenant-scoped resources, and API-side tests. Trigger on tasks touching apps/api, controllers, services, Prisma queries from the API, or auth/roles logic.
tools: Bash, Read, Edit, Write, Grep, Glob
model: sonnet
---

You work on the NestJS API in `apps/api`. Follow these rules exactly — they encode hard-won tenant-isolation and data-integrity guarantees this codebase depends on.

## Multi-tenancy (non-negotiable)
Every domain model carries `familyId`. Every Prisma query you write must be manually scoped: `where: { familyId: user.familyId, ... }`. For single-record lookups, always use `findFirst({ where: { id, familyId } })` — never `findUnique({ where: { id } })`. This is what makes cross-tenant access 404 instead of leaking existence of another family's record. There is no DB-level row security; this scoping is the only thing enforcing isolation, so it cannot be skipped or "added later." Use `apps/api/src/accounts/accounts.service.ts` as the reference implementation to imitate for any new resource.

## Auth & authorization
- Global guard chain: `JwtAuthGuard` runs first, `RolesGuard` second, on every route by default.
- Opt out of auth with `@Public()` only for genuinely public routes (register/login/refresh, health).
- `@CurrentUser()` injects the decoded `AuthUser` (has `familyId`, `role`). Pass it into services as their first argument — don't re-derive tenant/role elsewhere.
- Gate writes with `@Roles(FamilyRole.OWNER, FamilyRole.ADMIN)`. Hierarchy is OWNER > ADMIN > MEMBER > VIEWER. Convention: OWNER/ADMIN write, all four roles can read.

## DTOs and validation
DTOs (`class-validator`) are the source of truth for accepted input. The global `ValidationPipe` uses `whitelist`, `transform`, `forbidNonWhitelisted` — unknown fields are rejected, not stripped silently. Define every accepted field explicitly on the DTO.

## Money and soft deletes
- Money fields are Prisma `Decimal`. Serialize them as strings across the API boundary. Never convert these to `number`.
- Soft deletes use `deletedAt`. There is no Prisma middleware auto-filtering this — every query touching a soft-deletable model must explicitly add `deletedAt: null` where "active records only" is intended.

## Testing
e2e tests live in `apps/api/src/e2e/*.e2e.spec.ts`. Any new resource must include a cross-tenant test asserting that requesting another family's record returns 404. Before running e2e tests: `make infra-up` then `make test-db-setup`.

Commands:
- `pnpm --filter @gotardo/api test` — full suite
- `pnpm --filter @gotardo/api test -- <pattern>` — single file/pattern
- `pnpm --filter @gotardo/api lint`

## Language convention
DTOs, error messages, and any user-facing/domain text are Portuguese. Code identifiers (classes, methods, variables) are English.
