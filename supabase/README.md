# supabase/

Backend for SAMKRUSHI: PostgreSQL schema, RLS, seed data, Edge Functions and database tests. The database is authoritative for prices, stock, reservations, payments and roles. Security model: [ADR-0011](../docs/adr/0011-database-security-model.md).

| Path          | Contents                                                                                | Introduced |
| ------------- | --------------------------------------------------------------------------------------- | ---------- |
| `config.toml` | Local stack configuration (Supabase CLI)                                                | Phase 1    |
| `migrations/` | Sequential SQL migrations, the only way to change schema                                | Phase 2    |
| `tests/`      | pgTAP tests (`*.test.sql`) plus the shared `_helpers.psql`                              | Phase 2    |
| `seed/`       | **Development-only** synthetic seed SQL (`DEV`-labelled; never production values)       | Phase 3    |
| `functions/`  | Deno Edge Functions (the trusted boundary); shared Zod contracts from `packages/shared` | Phase 3    |

## Workflow

```bash
pnpm db:start          # local stack (Docker-compatible runtime required)
pnpm db:reset          # rebuild from an EMPTY database: all migrations (+ dev seed)
pnpm db:test           # pgTAP: security baseline, role matrix, constraints, audit, availability, admin RPCs, bootstrap
pnpm db:lint           # plpgsql_check lint
pnpm exec supabase db advisors --type all --fail-on warn
pnpm db:types          # regenerate packages/shared/src/database.types.ts
pnpm db:types:check    # CI: fail if the generated types are stale
```

Changing the schema:

1. Add a new migration: `pnpm exec supabase migration new <name>`. Never edit a migration that has reached a shared environment.
2. For every new table, enable RLS, revoke client privileges, grant `SELECT` only where a policy allows it, attach the audit trigger, and add the table to `tests/002_role_matrix.test.sql`.
3. Run `pnpm db:reset && pnpm db:test && pnpm db:types` and commit the regenerated types.

## Phase 2 schema (master §10)

| Migration                       | Objects                                                                                                                                                                                                                          |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `…120000_foundation`            | `pgcrypto`, `pg_trgm`; `private` schema; default-privilege lockdown; `current_business_date()` (Asia/Kolkata); request-context helpers; `set_updated_at`, `bump_version`, `forbid_column_change` triggers                        |
| `…120100_identity_and_roles`    | `app_role` enum (incl. `viewer`); `profiles`, `staff_profiles`, `user_roles`; role helpers (`is_active_staff`, `has_any_role`, `has_role`, `is_dashboard_staff`, `current_roles`); `my_access()`                                 |
| `…120200_audit`                 | append-only `audit_logs`; generic `audit_row_change` trigger with phone masking and redaction                                                                                                                                    |
| `…120300_settings_and_policies` | `app_settings` (typed and versioned; no values); `policy_versions` (one published per type; immutable once published)                                                                                                            |
| `…120400_catalog`               | `units` (spec-defined codes + exact g↔kg), `convert_quantity()`, `categories`, `products` (base unit, precision, low-supply threshold), `product_skus` (packs, `price_paise`), `sku_price_history` (automatic), `product_images` |
| `…120500_suppliers`             | `suppliers` (single identity, verification state), `supplier_contacts` (restricted PII), `farmer_profiles` (1:1, farmer-only), `supplier_contact_summaries()` (masked for viewer)                                                |
| `…120600_supply`                | `supply_confirmation_sources` (values: founder decision), `supply_confirmations` (dated, base-unit, one active per supplier + product + date, reasoned edits, computed expiry)                                                   |
| `…120700_availability`          | `product_availability()` (the single ATP implementation, MVP form) and `sku_availability()` (maxOrderable + status)                                                                                                              |

## Phase 3 schema and functions

| Migration                                  | Objects                                                                                                                                                            |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `20261124090000_admin_context_and_farmers` | `private.begin_admin_action` (role check + audit context), `rate_limit_counters` + `consume_rate_limit`, farmer code generator, farmer RPCs, duplicate-phone guard |
| `20261124090100_admin_supply_staff_reads`  | Supply RPCs (exact unit conversion), staff RPCs (last super_admin protected), `record_staff_login`, read RPCs for the dashboard                                    |
| `20261124090200_bootstrap_super_admin`     | `bootstrap_first_super_admin` (service role only)                                                                                                                  |
| `20261124090300_staff_auth_events`         | `admin_record_staff_auth_event` (audits Auth-side resets/bans)                                                                                                     |
| `20261124090400_rate_limit_status`         | `rate_limit_status` (count only failed logins)                                                                                                                     |

Edge Functions (`functions/`): `get-catalog`, `get-product-detail`, `health`. Shared Zod contracts are imported through `functions/deno.json`. Serve them locally with `pnpm exec supabase functions serve --env-file supabase/functions/.env` (copy `.env.example`). Contracts: `docs/api-contracts/`.

Later domains (procurement, batches, reservations, orders, payments, delivery) get their migrations in their own phases.
