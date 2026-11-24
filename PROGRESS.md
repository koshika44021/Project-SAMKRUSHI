# SAMKRUSHI — progress and handover

> **Agents:** read this file first, then `AGENTS.md`. Update it after every task (tick the box, add a changelog line, refresh "Next actions"). If you stop mid-task, record the exact state under "In progress".

**Branch:** `release-m1-2027.1` · **Last updated:** 2026-11-24 · **Current phase:** 3 — Admin MVP (**complete, awaiting user review**)

## Phase status (master spec §10)

| Phase | Deliverable                                                                             | State           | Commit    |
| ----- | --------------------------------------------------------------------------------------- | --------------- | --------- |
| 0     | Repository inspection and plan                                                          | Done            | —         |
| 1     | Monorepo foundation (pnpm/Turborepo, Node 24, Next.js, Expo, shared package, CI)        | Done            | `7e3dbfc` |
| 2     | Database and security (8 migrations, RLS, 592 pgTAP tests, generated types)             | Done            | `c16b52b` |
| 3     | Admin MVP: staff auth, farmers, catalog seed, dated supply, audit, customer catalog API | **In progress** | —         |
| 4     | Procurement and inventory                                                               | Not started     | —         |
| 5     | Customer browse and cart (mobile)                                                       | Not started     | —         |
| 6     | Checkout and payments (Razorpay Hosted Checkout first)                                  | Not started     | —         |
| 7     | Fulfilment, dispatch, rider OTP                                                         | Not started     | —         |
| 8     | Customer orders and support                                                             | Not started     | —         |
| 9     | Production hardening and Android store release                                          | Not started     | —         |

## Phase 3 checklist

Scope: master §10 Phase 3, WEB_ADMIN §1.1 MVP deliverables and §19 MVP acceptance criteria. No orders, payments or warehouse work in this phase.

- [x] 3.1 Handover files (`AGENTS.md`, `PROGRESS.md`)
- [x] 3.2 DB migration: admin RPCs, so every mutation sets audit context inside the function:
  - farmer create/update/status/photo, with code generator `SAM-FRM-######` (dev default) and duplicate-phone check;
  - supply create/update/status;
  - staff register/roles/status, login stamp;
  - list/overview read RPCs;
  - DB-backed rate limiter.
- [x] 3.3 pgTAP tests for the RPCs (role checks, optimistic concurrency, audit context, duplicate phone, rate limit)
- [x] 3.4 Dev-only seed (`supabase/seed/`): synthetic `DEV` categories, products, SKUs, placeholder prices and confirmation sources. Local storage buckets in `config.toml`.
- [x] 3.5 Bootstrap script for the first `super_admin` (env-supplied credentials; refuses if one exists)
- [x] 3.6 Shared Zod contracts in `packages/shared` (farmer, supply, staff, catalog API), with unit tests
- [x] 3.7 admin-web auth:
  - `@supabase/ssr` HTTP-only cookies, `proxy.ts` session refresh plus nonce CSP;
  - login/logout, generic errors, rate limit;
  - inactive and customer sessions rejected.
- [x] 3.8 admin-web shell: role-aware navigation, server IST business date in the header, shared UI components (table, pagination, forms, dialogs, states)
- [x] 3.9 Overview dashboard widgets (WEB_ADMIN §5 MVP list)
- [x] 3.10 Farmers:
  - list (search name/code/phone, filters, pagination, sorting), register, detail, edit, deactivate/reactivate;
  - duplicate-phone warning;
  - private photo upload (sniffed, re-encoded, metadata stripped) with signed URLs; viewer hides photos and masks phones.
- [x] 3.11 Products & Availability: seeded catalog view, supply entry/edit/deactivate (reason + version), views by date/farmer/product/status, history, aggregation via `product_availability()`
- [x] 3.12 Staff/Users (super_admin): create staff, roles, deactivate (Auth ban + session revoke), reactivate, admin-assisted password reset
- [x] 3.13 Audit history (super_admin): filters, pagination
- [x] 3.14 Edge Functions `get-catalog`, `get-product-detail`, `health`: shared envelope, status + `maxOrderable` only, listable filter
- [x] 3.15 Integration tests (supabase-js against the local stack: RPC authz, Edge Functions)
- [x] 3.16 Playwright E2E for the WEB_ADMIN §19 MVP acceptance criteria 1–11
- [x] 3.17 Docs (API contracts, runbooks, README), CI updates, commit

## In progress / partially done

Nothing half-done. Known follow-ups, deliberately deferred and tracked:

- Supply evidence upload/view UI. The RPC accepts `p_evidence_storage_key` (bucket `supply-evidence`); there is no viewer RPC yet.
- Scheduled sweep of orphaned storage objects (master §13.1). Replaced photos are deleted immediately instead.
- The local gateway adds `Access-Control-Allow-Origin: *` to functions. Verify CORS on the hosted project.
- Supabase-js `.select('*')` on `farmer_profiles` / `supply_confirmations` fails by design (column grants hide private keys). Always list columns.

## Next actions

1. **Wait for the user's Phase 3 review.** Do not start Phase 4 without approval.
2. Phase 4 (procurement/inventory) needs founder input first: supply shortfall customer remedy, procurement and quality policy, sell-by/expiry policy, packing facility (`docs/business-decisions.md` "Blocks Phase 4").

## Environment notes (Windows dev machine)

- **Start Docker Desktop first:** `%LOCALAPPDATA%\Programs\DockerDesktop\Docker Desktop.exe`. Then `pnpm db:start`.
- Shell PATH helpers (Git Bash):
  ```bash
  export PATH="/c/Users/c9c4hp/AppData/Local/Programs/DockerDesktop/resources/bin:/c/Program Files/Microsoft/jdk-17.0.21.102-hotspot/bin:$PATH"
  export JAVA_HOME="C:\\Program Files\\Microsoft\\jdk-17.0.21.102-hotspot"
  export ANDROID_HOME="C:\\Users\\c9c4hp\\AppData\\Local\\Android\\Sdk"
  export JAVA_TOOL_OPTIONS="-Djavax.net.ssl.trustStoreType=Windows-ROOT"   # corporate TLS proxy (Gradle)
  ```
- **The local Android native build still fails** after long paths were enabled (2026-11-24):
  - Error: `react-native-worklets` C++ step, `ninja: manifest 'build.ninja' still dirty after 100 tries`.
  - Cause: the SDK's CMake 3.22.1 bundles ninja 1.10.2, which is not long-path aware (ninja ≥ 1.12 is), and generated `.cxx` paths reach 288 characters.
  - Fix options:
    - (a) Android Studio → SDK Manager → SDK Tools → install a newer CMake (≥ 3.30, bundles ninja ≥ 1.12), then add `cmake.dir=C:/Users/c9c4hp/AppData/Local/Android/Sdk/cmake/<version>` to `apps/mobile/android/local.properties`;
    - (b) build from a short drive letter (`subst S: <repo path>`);
    - (c) use EAS cloud builds, which are Linux and unaffected.
  - `expo export` (JS bundle) and `expo prebuild` both work.
- For local Android builds, write `apps/mobile/android/local.properties` as `sdk.dir=C:/Users/c9c4hp/AppData/Local/Android/Sdk` (forward slashes). Afterwards run `gradlew --stop`, because Gradle daemons hold a lot of RAM.
- pnpm runs Node 24.22.3 automatically (`devEngines.runtime`). The machine's default Node is 26; that's fine.
- Bash heredocs containing non-ASCII characters (₹, ⇔) break in this shell. Write such files with an editor tool instead.

## Verify the repo (run before and after work)

```bash
pnpm install
pnpm check                 # lint + typecheck + unit tests (Turborepo)
pnpm build
pnpm db:reset && pnpm db:test && pnpm db:lint && pnpm db:types:check
pnpm exec supabase db advisors --type all --fail-on warn
pnpm exec supabase functions serve --env-file supabase/functions/.env   # separate terminal
pnpm test:integration
pnpm turbo run test:e2e --filter=@samkrushi/admin-web
```

Last full verification (2026-11-24):

- `pnpm check` + build: 12/12 tasks
- pgTAP: **691**
- unit: **101** shared + 3 admin-web + 2 mobile
- integration: **12**
- Playwright E2E: **24**
- advisors: clean

## Changelog

- **2026-11-23:** Phase 0 inspection and plan. Phase 1 foundation. Specs amended to v1.1 with ADRs 0001–0009. Phase 2 DB: 8 migrations, 592 pgTAP tests, hardened after an independent review (ADR-0011). Founder answers recorded (ADR-0010, refund labels, allocation order).
- **2026-11-24:** Long paths enabled by the user. Started Phase 3: added `AGENTS.md` and `PROGRESS.md`.
- **2026-11-24:** 3.2–3.3. Migrations `20261124090000_admin_context_and_farmers.sql` and `20261124090100_admin_supply_staff_reads.sql`:
  - `private.begin_admin_action` sets the audit context; errors use PT403/PT404/PT409/PT422.
  - Farmer create/update/status/photo, duplicate-phone guard, `SAM-FRM-######` codes.
  - Supply create/update/status with exact g→kg conversion.
  - Staff register/roles/status/name, `record_staff_login`; reads: `admin_list_farmers`, `admin_get_farmer`, `admin_list_supply`, `dashboard_overview`, `admin_product_availability`, `admin_list_staff`.
  - `consume_rate_limit` (service_role only, hashed keys).
  - New test `supabase/tests/006_admin_rpcs.test.sql`. **pgTAP: 668 passing.** Types regenerated.
- **2026-11-24:** 3.4–3.5:
  - Dev seed `supabase/seed/001_dev_reference.sql`: DEV categories, products, SKUs, placeholder prices, confirmation sources and settings. No suppliers or staff.
  - Local buckets `farmer-photos`, `supply-evidence` (private) and `product-images` (public) in `config.toml`.
  - Migration `20261124090200_bootstrap_super_admin.sql` plus `scripts/bootstrap-super-admin.mjs` (`pnpm bootstrap:super-admin`; refuses if a super_admin exists; rolls back the Auth user on failure).
  - Tests made independent of seed data and of pre-existing local users. Test `007_bootstrap.test.sql` added. **pgTAP: 684 passing.** Deps added: `@supabase/supabase-js` 2.119.2 and `@supabase/ssr` 0.12.7 (catalog), react-hook-form, `@hookform/resolvers` ~7.0.8, sharp, server-only.

- **2026-11-24:** 3.6 shared contracts in `packages/shared/src/`:
  - `access.ts`: roles and UI capability map;
  - `phone.ts`: Indian mobile → E.164;
  - `farmer.ts`: `FARMER_FIELD_RULES` dev defaults, create/update/status/list schemas, photo rules;
  - `supply.ts`, `staff.ts`: password policy, admin-assisted reset;
  - `catalog.ts`: customer API contract, status only, no raw quantities.

  96 unit tests passing.

- **2026-11-24:** Migration `20261124090300_staff_auth_events.sql` (audited Auth-side staff events). **pgTAP: 688.**
- **2026-11-24:** admin-web 3.7–3.11:
  - `src/proxy.ts`: per-request CSP nonce, session refresh, request id, redirect to `/login`.
  - `src/lib/{env,supabase/*,auth/session,server/*}.ts`; login/logout with rate limit and generic errors; `/account/password` forced change.
  - Dashboard shell (role-aware nav, IST date), Overview, Farmers (list/register/detail/edit/status/photo with signed URLs), Products & Availability (aggregation, supply list/create/edit/deactivate).
  - Local env: `apps/admin-web/.env.local` (git-ignored) holds the local keys from `supabase status`.

- **2026-11-24:** 3.14 Edge Functions:
  - `supabase/functions/{get-catalog,get-product-detail,health}` with `_shared/http.ts` (envelope, request id, CORS allow-list) and `_shared/catalog-service.ts` (service role plus `sku_availability`).
  - The pure builder `buildCatalogProducts` lives in `packages/shared/src/catalog.ts` and is unit-tested.
  - Deno imports shared code through `supabase/functions/deno.json`, which works in local serving.
  - Local serving: `pnpm exec supabase functions serve --env-file supabase/functions/.env` (copy from `.env.example`).
- **2026-11-24:** 3.15 `tests/integration`: Vitest + supabase-js with real JWTs. **12 passing:** RPC authz, HTTP status mapping, catalog API. Run with `pnpm test:integration` (needs stack and functions running).
- **2026-11-24:** Migration `20261124090400_rate_limit_status.sql`: login now counts only FAILED attempts (status check, then consume on failure). **pgTAP: 691.**
- **Gotcha:** test users who created data cannot be deleted (FK history). Test setups reuse accounts: reset password, upsert profile, replace roles.
- **Gotcha:** the local kong gateway adds `Access-Control-Allow-Origin: *` to function responses. Verify CORS on the hosted project.

- **2026-11-24:** 3.16–3.17. Playwright E2E (`apps/admin-web/e2e/`) covers WEB_ADMIN §19 MVP criteria 1–8, 10 and 11; criterion 9 (customer API) is covered by the integration tests. **24 passing.**
  - Fixes found by E2E: login rate limit counts only failures; quantities shown canonically ("4", not "4.0"); `upgrade-insecure-requests` only over HTTPS.
  - Test gotchas: Next's route announcer also has `role=alert` (scope to `main`); `browser.newContext()` inherits `storageState` (pass an empty one); labels of required fields end with " *".
  - pgTAP tests isolate themselves from leftover local data (rolled-back deletes in replica mode).
  - CI: new `integration-e2e` job on the full local stack.
  - Docs: `docs/api-contracts/{customer-catalog,admin-rpcs}.md`, runbooks `super-admin-bootstrap.md` and `storage.md`, updated `local-development.md`, both READMEs.

## Open founder decisions that affect Phase 3

Full list: `docs/business-decisions.md`. Dev defaults are in use until decided:

- which farmer fields are required, and whether a farmer is active on creation (dev default: ADMIN_DASHBOARD §16, active on creation);
- farmer code format (dev: `SAM-FRM-000001`);
- viewer access to phones and photos (dev: phones masked, photos hidden);
- the list of supply confirmation sources (dev placeholders);
- launch catalog and prices (dev: synthetic `DEV` items only);
- storage provider and upload limits (dev: Supabase Storage, 5 MB JPEG/PNG/WebP);
- staff login identifier and password-reset method (dev: email only, admin-assisted reset);
- customer catalog exposure (dev: status + `maxOrderable`, no raw quantities);
- refund `cancelled` label (Phase 8);
- customer remedy for a supply shortfall (Phase 4/6).
