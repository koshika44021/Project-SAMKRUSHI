# SAMKRUSHI

Farm-to-home fresh produce platform for an initial Hyderabad pilot. Staff record farmer-confirmed supply and run operations from a web dashboard. Customers browse, order and track deliveries in a mobile app.

**Status:** master Phase 3 (admin MVP) on branch `release-m1-2027.1`, in review. Release 1 targets **Android**. Live handover state: [PROGRESS.md](PROGRESS.md).

## Repository layout

```text
apps/
  admin-web/        Next.js 16 (App Router) staff dashboard, incl. the later rider web route
  mobile/           ONE Expo SDK 58 app producing Android (release 1) and iOS builds
packages/
  shared/           Runtime-agnostic Zod schemas, API envelope, money/quantity/date helpers
  config/           Shared tsconfig bases and ESLint flat config
supabase/           Postgres migrations, RLS/pgTAP tests, dev-only seed, Edge Functions
docs/
  specs/            Product specifications (master spec governs — ADR-0001)
  adr/              Architecture & business decision records
  api-contracts/    API conventions and endpoint contracts
  runbooks/         Operational guides (start with local-development.md)
  business-decisions.md   Approved and OPEN founder decisions
```

## Quick start

Prerequisites: Git and **pnpm 12**. pnpm downloads **Node.js 24 LTS** for this repo automatically.

```bash
pnpm install
pnpm check        # lint + typecheck + unit tests, all workspaces
pnpm build
pnpm dev          # admin-web on http://localhost:3000
pnpm --filter @samkrushi/mobile start   # Metro for the Android dev client
```

Full setup, including Android builds, EAS and a Docker-compatible runtime for local Supabase: [docs/runbooks/local-development.md](docs/runbooks/local-development.md).

## Commands

| Command                                                    | What it does                                                                           |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `pnpm check`                                               | `turbo run lint typecheck test`                                                        |
| `pnpm build`                                               | Production build of every workspace (cached by Turborepo)                              |
| `pnpm format` / `pnpm format:check`                        | Prettier                                                                               |
| `pnpm turbo run test:e2e --filter=@samkrushi/admin-web`    | Build, then run the Playwright smoke tests                                             |
| `pnpm --filter @samkrushi/mobile build:android:dev`        | EAS development build for Android                                                      |
| `pnpm --filter @samkrushi/mobile build:android:production` | Store AAB (requires `ANDROID_APPLICATION_ID`)                                          |
| `pnpm db:start` / `pnpm db:reset`                          | Local Supabase stack / rebuild from an empty database (Docker-compatible runtime)      |
| `pnpm db:test`                                             | pgTAP database tests (RLS, role matrix, constraints, audit, availability)              |
| `pnpm bootstrap:super-admin`                               | Create the first super admin from `BOOTSTRAP_ADMIN_*` env vars (refuses if one exists) |
| `pnpm test:integration`                                    | Integration tests against the local stack (RPC authz, Edge Functions)                  |
| `pnpm db:types`                                            | Regenerate DB types from the migrated schema into `packages/shared`                    |

## Ground rules

These come from the master spec, §5, §8 and §11.

- The **backend is authoritative** for prices, fees, taxes, stock, reservations, slots, payment state and roles. Frontends display server results; they never decide them.
- **Never invent** prices, fees, supplier details, stock, cutoffs, delivery slots, tax rules or policies. Open items live in [docs/business-decisions.md](docs/business-decisions.md).
- **Money** is integer paise. **Quantities** are `NUMERIC` with an explicit unit, sent over the API as decimal strings. **Business dates** use Asia/Kolkata.
- **No secrets** in client bundles, `NEXT_PUBLIC_*` / `EXPO_PUBLIC_*` variables, logs or Git. Only `.env.example` files are committed.
- Schema changes go through **migrations only**. DB types are generated from the migrated schema.
- Work proceeds **one master phase at a time** (0–9). A phase finishes only when its tests pass.

## Phase plan

| Phase | Deliverable                                                                              | State         |
| ----- | ---------------------------------------------------------------------------------------- | ------------- |
| 0     | Repository inspection and plan                                                           | Done          |
| 1     | Monorepo foundation                                                                      | Done          |
| 2     | Database and security (migrations, RLS, role-matrix tests, generated types)              | Done          |
| 3     | Admin MVP (staff auth, farmers, catalog seed, dated supply, audit, customer catalog API) | **In review** |
| 4     | Procurement and inventory                                                                |               |
| 5     | Customer browse and cart (mobile)                                                        |               |
| 6     | Checkout and payments (Razorpay Hosted Checkout first)                                   |               |
| 7     | Fulfilment, dispatch, rider OTP                                                          |               |
| 8     | Customer orders and support                                                              |               |
| 9     | Production hardening and store release                                                   |               |
