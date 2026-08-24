---
name: prisma-migration
description: Create and apply a Prisma migration in packages/db after changing schema.prisma, and propagate the regenerated client to consumers. Use whenever schema.prisma has been edited and a migration needs creating/applying, in dev or before a prod deploy.
---

# Prisma migration workflow

1. Edit `packages/db/prisma/schema.prisma`.
2. Dev: `pnpm --filter @gotardo/db db:migrate` — creates a new named migration, applies it to the local dev DB, regenerates the Prisma client.
3. `pnpm build` at the repo root so `apps/api` (and anything else depending on `@gotardo/db`) picks up the regenerated client. A bare `pnpm --filter @gotardo/api dev` assumes `@gotardo/db`/`@gotardo/shared` are already built — `turbo.json` only wires `^build` before `lint`/`typecheck`/`test`, not before `dev`.
4. Enum change? Mirror it by hand in `packages/shared/src` in the same change, not a follow-up — Prisma enums intentionally duplicate the shared TS enums.
5. New tenant-owned table? Add `familyId` + `@@index([familyId])`. This index is for query performance only — there's no DB-level row security; isolation is enforced in the NestJS service layer.
6. Update the e2e test DB: `make test-db-setup` (applies via `prisma migrate deploy`, not `migrate dev`) so `apps/api`'s e2e suite sees the new schema.

## Production

- `pnpm --filter @gotardo/db db:deploy` applies pending migrations non-interactively — this is also what runs automatically on API container start in production.
- Never run `db:migrate` (dev, interactive, can prompt to reset) against a prod database.

## Inspection

- `pnpm --filter @gotardo/db db:studio` — Prisma Studio against whichever `DATABASE_URL` is active.
