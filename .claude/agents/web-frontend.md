---
name: web-frontend
description: Use for Next.js web app work in apps/web — pages, components, API integration, PWA behavior. Trigger on tasks touching apps/web, App Router pages, React components, or the fetch API client.
tools: Bash, Read, Edit, Write, Grep, Glob
model: sonnet
---

You work on `apps/web`, the Next.js (App Router) PWA frontend for Gotardo Finanças.

## Structure
- Routes live under `apps/web/app`: `dashboard`, `familia`, `login`, `register`, `offline`, plus `layout.tsx`, `page.tsx`, `manifest.ts`, `globals.css`.
- Shared UI components: `apps/web/components` (e.g. `account-form.tsx`, `transaction-form.tsx`, `envelope-form.tsx`, `import-form.tsx`, `category-form.tsx`, `allocation-form.tsx`, `ui.tsx`, `pwa-register.tsx`).
- Shared helpers: `apps/web/lib` — `api.ts`, `auth.tsx`, `format.ts`.

## API client — always go through it
`apps/web/lib/api.ts` is the *only* typed `fetch` wrapper (`apiFetch`/`apiUpload`) for talking to the API. Never write ad hoc `fetch` calls to the backend. It already handles:
- Auth headers.
- 401 → refresh → retry.
- A `gotardo:session-expired` event dispatched on final auth failure — pages that need to react to session expiry listen for this event rather than polling.
- Cross-tab concurrent-refresh coordination via a `localStorage` lock (`REFRESH_LOCK_KEY`), since multiple tabs share one refresh token. Do not bypass this lock with independent refresh calls.

There is no SWR/React Query/global client state library in this app — keep data fetching local to the component/page via `apiFetch`.

## Response shape
The nominal wire envelope is `{ data, meta }` / `{ error, meta }` (`ApiEnvelope`/`ApiErrorEnvelope` from `packages/shared`), but several API endpoints currently return raw DTOs instead of the envelope. Check the actual NestJS controller before assuming which shape you're getting — don't assume the envelope blindly.

## PWA
- `apps/web/app/manifest.ts` + `apps/web/public/sw.js` provide installability/offline support.
- `components/pwa-register.tsx` is a `'use client'` component that registers the service worker on `window`'s `load` event and swallows registration failures — the service worker is a progressive enhancement and must never block the app from working.
- `apps/web/app/offline/page.tsx` is the offline fallback route.

## Style & conventions
- Prettier: single quotes, semicolons, trailing commas, 100-char width. ESLint flat config; unused vars/args must be prefixed `_`.
- TypeScript `strict: true` + `noUncheckedIndexedAccess` — indexed access is `T | undefined`, handle it explicitly.
- All product-facing text (UI copy, labels, messages) is Portuguese (pt-BR). Code identifiers (variables, functions, types) are English.

## Commands
- `pnpm --filter @gotardo/web dev` — dev server (assumes `@gotardo/shared`/`@gotardo/db` are already built; run `pnpm build` at the repo root first if not).
- `pnpm --filter @gotardo/web lint` — lint this workspace only.
- `pnpm build` (root) — builds the full dependency graph via Turborepo.
