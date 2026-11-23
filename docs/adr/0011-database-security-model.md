# ADR-0011: Database security model

- **Status:** Accepted
- **Date:** 2026-11-23
- **Deciders:** Engineering (implements master §3, §5, §8; ADR-0005)

## Context

The backend is authoritative for every financial, inventory, reservation and authorization decision (master §2.2, §8). Clients (admin-web in the browser, the mobile app) talk to Supabase with user JWTs, so the database must protect itself even if a client is compromised or buggy. UI visibility is not security.

## Decision

1. **RLS on every `public` table.** CI fails if any table lacks it (`supabase/tests/001_security_baseline.test.sql`).
2. **Client roles are read-only.**
   - `anon` has **no** table privileges.
   - `authenticated` has `SELECT` only, filtered by RLS.
   - No client role holds `INSERT`/`UPDATE`/`DELETE`/`TRUNCATE` on any business table.
   - Default privileges in `public` and `private` grant nothing to client roles, so a new table is never exposed by accident.
3. **All mutations go through trusted server code.**
   - That means Edge Functions or Next.js server actions using the service role, or `SECURITY DEFINER` RPCs added per phase.
   - Every such operation authorizes the caller's role and sets request context (`app.request_id`, `app.actor_role`, `app.reason`, `app.source`) with `set_config(..., true)`.
4. **Role helpers live in a non-exposed `private` schema:**
   - `is_active_staff()`, `has_any_role()`, `has_role()`, `is_dashboard_staff()`, `current_roles()`, `can_read_*()`.
   - They are `SECURITY DEFINER` with a pinned `search_path`.
   - Policies call them as `(select private.fn())`, so they are evaluated once per statement.
   - A staff role counts **only while the staff profile is active**.
   - A non-customer role **cannot be inserted** for a user without a staff profile, so a customer sign-up can never gain staff access.
5. **Database-enforced invariants** (triggers and checks), so no code path can bypass them:
   - supply rules (master §4.2): base unit, precision, create > 0, reason on every edit, active supplier and product, one active row per supplier + product + date;
   - immutable codes, and the base unit fixed once referenced;
   - no hard delete of suppliers, contacts or supply;
   - optimistic-concurrency `version` managed by the database;
   - immutable published policy text.
6. **Audit by trigger.**
   - Every audited table writes `audit_logs` automatically.
   - Phone numbers are masked; emails and private storage keys are redacted.
   - `audit_logs` and `sku_price_history` are append-only, enforced by triggers that also bind the table owner and `service_role`.
7. **One availability implementation.**
   - `product_availability()` and the per-SKU `sku_availability()` are `SECURITY DEFINER`. They are executable by `authenticated` but refuse anyone who isn't an active farmer-supply reader (`super_admin`, `operations_admin`, `viewer`), and by `service_role`, which customer Edge Functions use.
   - Customers never call them directly.
8. **Restricted PII.**
   - Supplier phones and emails live in `supplier_contacts`, readable by `super_admin`, `operations_admin` and `finance_admin`.
   - Viewers get masked numbers via `supplier_contact_summaries()`.
   - Private photo and evidence keys are never URLs. Signed URLs are issued only by server code after a role check (Phase 3).

### Hardening from the independent Phase 2 review (2026-11-23)

- **No TRUNCATE** for any API role, including `service_role`. Append-only and no-delete tables also carry statement-level `BEFORE TRUNCATE` guards that bind the owner too.
- **No PUBLIC/anon EXECUTE on any function.** The global default privilege is revoked, plus a final sweep. Every function pins an empty `search_path`. The baseline test checks all functions, not a sample.
- **Availability gate.** `public.product_availability()` and `sku_availability()` allow only farmer-supply readers (`super_admin`, `operations_admin`, `viewer`) and `service_role`. The logic lives in `private.product_availability_core()`, which future trusted server code can call. Result totals are unconstrained `NUMERIC`, so one huge total can't overflow and break the call for every product.
- **Column-level grants.**
  - No client can read `farmer_profiles.photo_storage_key` or `supply_confirmations.evidence_storage_key`; clients see `has_photo` / `has_evidence` instead.
  - Clients must select explicit columns (no `select *`) on these two tables.
- **Staff data.** `staff_profiles` is readable as own row + `super_admin` only. Other screens resolve actor names through `staff_display_names()`.
- **Supply integrity.**
  - Every change needs a **fresh** reason: `app.reason`, which is copied onto the row, or a new `change_reason` value.
  - New rows can't be dated in the past, and expired rows accept only deactivation.
  - An active row can change only while the supplier and product are active.
  - `confirmed_by` must be active staff.
- **Precision.** Quantity columns are unconstrained `NUMERIC` with checks, so over-precision input is rejected instead of silently rounded.
- **Policy versions.** Published or retired versions can't return to draft, change publish metadata or be deleted. The audit keeps the full text.
- **Other rules.** `version` is forced to 1 on insert. Product, category, SKU and supplier codes, plus `created_*`, are immutable. Supplier deactivation fields must match the status.
- **Phase 3 rule.** Supabase-js table writes (`.from().insert/update`) can't carry request context. All Phase 3 mutations must therefore be RPCs or direct-connection transactions that set `app.request_id`, `app.actor_role`, `app.reason` and `app.source`.

## Consequences

- Phase 3 needs write RPCs or Edge Functions for every admin mutation (farmers, supply, catalog, staff), each with role checks, request context and tests.
- The role matrix is tested exhaustively (`002_role_matrix.test.sql`): every role, inactive staff, staff without roles, customer and anon, against every table, plus direct-write denial and RPC authorization.
- Adding a table requires its own RLS policies and grants, and a row in the role matrix. The baseline test catches a missing RLS flag or leaked privilege.

## References

- Master §2.2, §3, §5, §8, §9; WEB_ADMIN §3, §17; ADR-0004, ADR-0005, ADR-0007
- `supabase/migrations/*`, `supabase/tests/*`
