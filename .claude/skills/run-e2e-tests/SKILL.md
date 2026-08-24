---
name: run-e2e-tests
description: Spin up local infra (Postgres/Redis/MinIO) and the gotardo_test database, then run apps/api's e2e test suite. Use whenever asked to run, debug, or add e2e tests for the NestJS API, or when e2e tests are failing due to missing infra/database.
---

E2e tests live at `apps/api/src/e2e/*.e2e.spec.ts` and run through the same Jest config as unit tests — `pnpm --filter @gotardo/api test` picks them up automatically. They assert real behavior against a real Postgres, notably that cross-tenant access returns 404.

## Steps

1. **Bring up infra**: `make infra-up` (Postgres/Redis/MinIO via `compose.dev.yaml`, for local dev). Use `make test-up` instead for an isolated-port test stack (`compose.test.yaml`) if the dev stack is already busy with something else.
2. **Prepare the test database**: `make test-db-setup` — creates the `gotardo_test` database (idempotent, checks existence first) and applies all Prisma migrations to it via `prisma migrate deploy`. Re-run this after adding a new migration.
3. **Run the suite**: `pnpm --filter @gotardo/api test` for everything, or `pnpm --filter @gotardo/api test -- <pattern>` to scope to one file/spec, e.g. `pnpm --filter @gotardo/api test -- accounts.controller`.

## Notes

- Default `TEST_DATABASE_URL` is `postgresql://gotardo_test:gotardo_test@localhost:5433/gotardo_test?schema=public`. If using a custom port/host, check `.env.test` and `compose.test.yaml` (relevant when using the isolated test stack instead of dev ports).
- Teardown dev stack: `make infra-down` (keeps volumes) or `make infra-down-volumes` (wipes data). Teardown test stack: `make test-down` / `make test-down-volumes`.

## Troubleshooting

Connection errors almost always mean infra isn't up yet or the test DB is missing/out of date with migrations — re-run steps 1–2 before assuming a real test failure.
