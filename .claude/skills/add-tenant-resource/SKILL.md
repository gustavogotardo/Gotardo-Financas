---
name: add-tenant-resource
description: Scaffold a new Family-scoped (tenant) domain resource end-to-end — Prisma model, shared TS types, NestJS module/service/controller/DTOs, and tenant-isolation e2e tests. Use when adding a brand-new resource type to the API (e.g. a new model like Account/Category/Envelope), not for editing an existing one.
---

Reference implementation for every step below: `apps/api/src/accounts/accounts.service.ts`.

1. **Prisma model** — add it to `packages/db/prisma/schema.prisma`:
   - Include `familyId` and `@@index([familyId])`.
   - Add `deletedAt DateTime?` if the resource should support soft delete.
   - New enums go here AND must be mirrored in `packages/shared/src` — change both together.

2. **Migrate + build** — `pnpm --filter @gotardo/db db:migrate` (name the migration), then `pnpm build` at repo root so the regenerated Prisma client is picked up by `apps/api`.

3. **Shared types** — add/extend request/response shapes and enums in `packages/shared/src`, consumed by both `apps/api` and `apps/web`.

4. **Nest module** — create `apps/api/src/<resource>/`:
   - `<resource>.module.ts`, `<resource>.controller.ts`, `<resource>.service.ts`, `dto/` (class-validator DTOs).
   - Tenant isolation, exactly like `accounts.service.ts`: every query scoped `where: { familyId: user.familyId, ... }`; single-record lookups use `findFirst({ where: { id, familyId } })`, never `findUnique`.
   - Services take `AuthUser` (from `@CurrentUser()`) as their first argument instead of re-deriving familyId/role.

5. **Guards/roles** — routes are protected by default (global `JwtAuthGuard` + `RolesGuard`). Use `@Roles(FamilyRole.OWNER, FamilyRole.ADMIN)` on write endpoints per the OWNER/ADMIN-write, all-roles-read convention, unless this resource needs something different.

6. **Money fields** — use Prisma `Decimal`, serialize as string across the API boundary. Never `number`.

7. **Soft delete** — if applicable, every read query must explicitly filter `deletedAt: null` (no automatic middleware does this).

8. **Wire it up** — register the new module in `apps/api/src/app.module.ts`.

9. **e2e test** — add `apps/api/src/e2e/<resource>.e2e.spec.ts`; must assert cross-tenant access to another family's record 404s (pattern followed by every existing resource).

10. **Validate** — ensure infra is up (`make infra-up`, `make test-db-setup` if not already done), then:
    ```
    pnpm build && pnpm --filter @gotardo/api test && pnpm --filter @gotardo/api lint && pnpm typecheck
    ```
