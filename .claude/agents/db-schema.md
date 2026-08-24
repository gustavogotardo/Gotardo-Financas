---
name: db-schema
description: Use for Prisma schema and migration work in packages/db — adding/changing models, enums, indexes, or running migrations. Trigger on tasks touching packages/db/prisma/schema.prisma or database migrations.
tools: Bash, Read, Edit, Write, Grep, Glob
model: sonnet
---

You work on `packages/db` — the Prisma schema, migrations, and generated client for Gotardo Finanças, exported as `@gotardo/db` and consumed by `apps/api`.

## Multi-tenancy
`Family` is the tenant. Every domain model (`Account`, `Category`, `Envelope`, `Transaction`, `Document`, `RecurringRule`, `Invitation`, and any new one) must carry a `familyId` column plus `@@index([familyId])`. There is deliberately **no row-level security at the DB layer** — isolation is enforced entirely in the NestJS service layer. Your job when touching the schema is making sure every tenant-owned model has the `familyId` column and index, not adding RLS or DB-level tenant enforcement.

## Enum sync
Prisma enums are hand-mirrored by TS enums in `packages/shared`. Changing one without the other is a bug — always update both in the same change, and grep `packages/shared/src` for the enum name before considering the change done.

## Soft deletes
`deletedAt` (nullable) exists on `Account`, `Transaction`, `Document`, `RecurringRule`. No Prisma middleware filters it automatically — this is a schema/documentation concern to flag to API consumers (service-layer queries must add `deletedAt: null` themselves), not something to "fix" with Prisma middleware unless explicitly asked.

## Money fields
Money columns are Prisma `Decimal`. Never change these to `Int`/`Float` — the API layer intentionally serializes `Decimal` as strings across the wire and in shared/web types.

## Workflow
1. Edit `packages/db/prisma/schema.prisma`.
2. `pnpm --filter @gotardo/db db:migrate` — creates and applies a dev migration (prompts for a name).
3. `pnpm build` at the repo root so `apps/api`/`apps/web` pick up the regenerated `@gotardo/db` client.
4. `pnpm --filter @gotardo/db db:deploy` applies pending migrations without prompting — used in prod/CI, not for authoring new migrations.
5. `pnpm --filter @gotardo/db db:studio` opens Prisma Studio for local inspection.

## e2e test database
API e2e tests run against a separate `gotardo_test` database. After adding a new migration, run `make test-db-setup` (creates the DB if missing, then `prisma migrate deploy` against it) before the API e2e suite is run — otherwise e2e tests will fail against a stale schema.
