---
name: run-e2e-tests
description: Spin up local infra (Postgres/Redis/MinIO) and the gotardo_test database, then run apps/api's e2e test suite. Use whenever asked to run, debug, or add e2e tests for the NestJS API, or when e2e tests are failing due to missing infra/database.
---

E2e tests live at `apps/api/src/e2e/*.e2e.spec.ts` and run through the same Jest config as unit tests — `pnpm --filter @gotardo/api test` picks them up automatically. They assert real behavior against a real Postgres, notably that cross-tenant access returns 404.

## Steps

1. **Bring up both stacks**:
   - `make test-up` — Postgres on isolated port 5433 (`compose.test.yaml`), the database the e2e specs actually connect to (see below). **Required** — `make test-db-setup` (step 2) execs into the `gotardo-test-postgres-1` container by name, which only exists after `test-up`.
   - `make infra-up` — the dev stack (`compose.dev.yaml`), needed too: e2e specs don't override `MINIO_*`/`REDIS_URL`, so anything touching storage or queues (e.g. `imports.e2e.spec.ts`) falls through to the dev Redis/MinIO from the root `.env`. Both stacks run side by side on different ports without conflict — that's the point of the port split.
2. **Prepare the test database**: `make test-db-setup` — creates the `gotardo_test` database on the `test-up` Postgres (idempotent, checks existence first) and applies all Prisma migrations via `prisma migrate deploy` (against `TEST_DATABASE_URL`, port 5433). Re-run this after adding a new migration.
3. **Run the suite**: `pnpm --filter @gotardo/api test` for everything, or `pnpm --filter @gotardo/api test -- <pattern>` to scope to one file/spec, e.g. `pnpm --filter @gotardo/api test -- accounts.controller`.

`apps/api/src/e2e/*.e2e.spec.ts` each set `process.env.DATABASE_URL` to the port-5433 test Postgres at the top of the file — this used to point at the dev stack (port 5432) instead, which meant `test-db-setup` silently migrated a database the tests never touched. Fixed 2026-08-24; if a new e2e spec is added, copy the `DATABASE_URL` line from an existing one rather than the dev `.env` value.

## Notes

- Default `TEST_DATABASE_URL` (per `.env.test` / `test-db-setup`) is `postgresql://gotardo_test:gotardo_test@localhost:5433/gotardo_test?schema=public` — matches what the e2e specs hardcode.
- Teardown dev stack: `make infra-down` (keeps volumes) or `make infra-down-volumes` (wipes data). Teardown test stack: `make test-down` / `make test-down-volumes`.

## Troubleshooting

Connection errors almost always mean infra isn't up yet (check *both* stacks per step 1) or the test DB is missing/out of date with migrations — re-run steps 1–2 before assuming a real test failure.
