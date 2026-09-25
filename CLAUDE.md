# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Gotardo Finanças — a multi-tenant family finance/budgeting SaaS for the Brazilian market (BRL, LGPD). pnpm/Turborepo monorepo: NestJS API, Next.js web app, a shared TS types package, a Prisma/PostgreSQL package, and two Python (FastAPI) microservices. All product/domain text (UI, error messages, DTOs) is in Portuguese; code identifiers are in English.

Roadmap and data model detail live in `docs/planejamento.md` and `docs/especificacao-tecnica.md` — check these for anything not obvious from the code.

## Commands

```bash
# install (root)
pnpm install

# dev: api on :3000, web on :3001, both watching
pnpm dev

# validation (all run through turbo, respect workspace dependency graph)
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm format          # prettier --write .

# run a single workspace's task
pnpm --filter @gotardo/api test
pnpm --filter @gotardo/api test -- accounts.controller   # single test file/pattern (jest)
pnpm --filter @gotardo/web lint

# Prisma (packages/db)
pnpm --filter @gotardo/db db:migrate   # new dev migration
pnpm --filter @gotardo/db db:deploy    # apply migrations (prod)
pnpm --filter @gotardo/db db:studio

# API e2e tests need TWO stacks + a gotardo_test database
make infra-up          # dev stack (compose.dev.yaml: postgres :5432, redis :6379, minio :9000) — e2e specs fall back to its Redis/MinIO
make test-up           # test stack (compose.test.yaml: postgres :5433, redis :6380, minio :9100) — required before test-db-setup
make test-db-setup     # creates gotardo_test db on the test postgres and applies migrations (execs into gotardo-test-postgres-1)
# then: pnpm --filter @gotardo/api test  (src/e2e/*.e2e.spec.ts run via the same jest config)

# Python services (services/ml, services/ocr — managed with uv)
make py-install
make py-test
make py-lint

# production (on-prem, Docker Compose) — see Makefile for full target list
make prod-up
make prod-logs
make prod-backup
```

Node >= 20, pnpm >= 9, Python >= 3.11 required. Copy `.env.example` to `.env` (repo root) before running `make infra-up`.

The single `.env` lives at the repo root. The API (`ConfigModule` `envFilePath` in `app.module.ts`) and the `@gotardo/db` scripts (`db:migrate`/`db:deploy`/`db:studio`, via `dotenv-cli`) load it explicitly because their cwd is `apps/api` / `packages/db`. Turborepo runs tasks in strict env mode (no `env`/`passThroughEnv` in `turbo.json`), so exporting variables in your shell does **not** reach `pnpm dev` — rely on the `.env` file. MinIO images come from `quay.io/minio/*` (they are no longer published on Docker Hub).

## Architecture

### Monorepo layout
- `apps/api` — NestJS backend, all domain logic. REST under `/api/v1`.
- `apps/web` — Next.js (App Router) PWA-first frontend, plain `fetch`-based API client (no data-fetching library).
- `packages/shared` — cross-cutting TS types/enums (`TransactionType`, `ApiEnvelope<T>`, `NormalizedTransaction`, etc.) consumed by both `apps/api` and `apps/web`. Prisma enums in `packages/db/prisma/schema.prisma` intentionally mirror these — keep both in sync when changing one.
- `packages/db` — Prisma schema, migrations, and generated client, exported as `@gotardo/db`.
- `services/ml` — FastAPI service for category-suggestion and anomaly detection (rule-based, see `app/rules.py`). Optional: the API only calls it if `ML_URL` is set.
- `services/ocr` — FastAPI skeleton, deferred feature (P3), health endpoint only.
- `apps/api/src/family` — family (tenant) settings, member roles, and invitations (token-based, `randomToken`, 7-day expiry). `apps/web/app/familia` is its UI.

Turborepo tasks (`turbo.json`) build `^build` before `lint`/`typecheck`/`test`, so workspace-local commands generally still need `@gotardo/db` and `@gotardo/shared` built first (`pnpm build` at the root handles this; running `pnpm --filter @gotardo/api dev` alone assumes those are already built).

### Multi-tenancy: everything hangs off `Family`
`Family` is the tenant. Every domain model (`Account`, `Category`, `Envelope`, `Transaction`, `Document`, `RecurringRule`, `Invitation`) has a `familyId` and a `@@index([familyId])`. There is **no row-level security at the DB layer** — isolation is enforced entirely in the NestJS service layer: every Prisma query is manually scoped with `where: { familyId: user.familyId, ... }`, and single-record lookups use `findFirst({ where: { id, familyId, ... } })` (not `findUnique`) so a request for another family's record 404s instead of leaking existence. When adding a new resource, follow this exact pattern — see `apps/api/src/accounts/accounts.service.ts` as the reference implementation. e2e tests (`apps/api/src/e2e/*.e2e.spec.ts`) specifically assert cross-tenant access returns 404.

### Auth & authorization
- Global guards (`apps/api/src/app.module.ts`): `JwtAuthGuard` (Passport JWT) runs first for every route, `RolesGuard` second.
- Routes are protected by default; opt out with `@Public()` (see `common/decorators/public.decorator.ts`) — used for register/login/refresh and health checks.
- `@CurrentUser()` injects the decoded `AuthUser` (`common/auth-user.ts`), which carries `familyId` and `role` — services take this as their first argument instead of re-deriving tenant/role from the request.
- Role gating uses `@Roles(FamilyRole.OWNER, FamilyRole.ADMIN)` on controller methods; `FamilyRole` is `OWNER > ADMIN > MEMBER > VIEWER`. Convention across the app: OWNER/ADMIN can write, MEMBER/VIEWER are read-only, all four can read.
- Refresh tokens rotate (`RefreshToken.replacedById` chain) and are revocable; the web client (`apps/web/lib/api.ts`) handles concurrent-refresh races via a `localStorage`-based lock (`REFRESH_LOCK_KEY`) since multiple tabs share one refresh token.

### API conventions
- Global prefix `api/v1`, global `ValidationPipe({ whitelist, transform, forbidNonWhitelisted })` — DTOs (`class-validator`) are the source of truth for accepted fields; unknown fields are rejected.
- Request logging middleware in `main.ts` logs method/path/status/duration and whether an `Authorization` header was present (not its value).
- Prisma `Decimal` fields (money) are serialized as strings across the API boundary and in `packages/shared`/`apps/web` types — don't switch these to `number`.

### Imports & ML integration
- `apps/api/src/imports` parses uploaded OFX/CSV/XLSX bank statements, plus Itaú's PDF statement specifically (`parsers/pdf-itau.ts`, via `pdf2json` — text-embedded PDFs only, one parser per bank, no other bank supported yet) (`ALLOWED_EXTENSIONS`, 5MB cap) into `Document` + `Transaction(source: IMPORT, status: REVIEW/PENDING)` records, using BullMQ (`Queue`/`Worker`, backed by Redis) for async processing and MinIO (`storage.service.ts`) for the raw file.
- `MlClient` (`apps/api/src/ml/ml.client.ts`) calls the Python `services/ml` FastAPI service over HTTP for category suggestions and anomaly flags. It is soft-fail by design: unset `ML_URL`, network errors, timeouts, or non-2xx responses all degrade to "no suggestion" rather than throwing — never make this a hard dependency when touching import/categorization code.
- `Transaction.suggestedCategoryId` (ML's guess) is separate from `Transaction.categoryId` (confirmed); a suggestion never auto-writes the confirmed category.

### Domain state machines worth knowing
- `Transaction.status`: `PENDING → CONFIRMED` (confirming a transaction updates the linked `Account.balance`; editing/deleting a confirmed transaction reverts/adjusts the balance accordingly — see `transactions.service.ts`), plus `REJECTED`/`REVIEW` for imported rows needing a human look.
- `Envelope` balance is computed, not stored: `allocated` (sum of `EnvelopeAllocation`) minus `spent` (sum of confirmed `EXPENSE` transactions linked to the envelope) — see `EnvelopeWithSummary` in `envelopes.service.ts`.
- Soft deletes via `deletedAt` on `Account`, `Transaction`, `Document`, `RecurringRule`; queries must filter `deletedAt: null` explicitly (no Prisma middleware does this automatically).

### Frontend
- No client-side router state library or SWR/React Query — `apps/web/lib/api.ts` is a thin typed `fetch` wrapper (`apiFetch`/`apiUpload`) shared by all pages/components, handling auth headers, 401 → refresh → retry, and a custom `gotardo:session-expired` event that pages listen for.
- Response envelope on the wire is `{ data, meta }` / `{ error, meta }` per `packages/shared`'s `ApiEnvelope`/`ApiErrorEnvelope`, though the API currently returns raw DTOs for most endpoints — check the controller before assuming the envelope shape.
- PWA: `apps/web/app/manifest.ts` + `apps/web/public/sw.js` (registered client-side by `components/pwa-register.tsx`) give installability and basic offline support; `apps/web/app/offline/page.tsx` is the offline fallback route. Treat the service worker as a progressive enhancement — registration failures are swallowed, never block the app.

## Code style
- TypeScript `strict: true` plus `noUncheckedIndexedAccess` (root `tsconfig.base.json`) — indexed array/object access is `T | undefined`, handle it.
- Prettier: single quotes, semicolons, trailing commas, 100-char width (`.prettierrc.json`). ESLint flat config (`eslint.config.mjs`) extends `typescript-eslint` recommended; unused vars/args must be prefixed `_`.
- Python services use `ruff` (`E, F, I, W, UP`, line length 100) via `make py-lint`.
