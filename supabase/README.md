# supabase/

Backend for SAMKRUSHI: PostgreSQL schema, RLS, seed data, Edge Functions and database tests.
The database is authoritative for prices, stock, reservations, payments and roles.

| Path          | Contents                                                                            | Introduced |
| ------------- | ----------------------------------------------------------------------------------- | ---------- |
| `config.toml` | Local stack configuration (Supabase CLI)                                            | Phase 1    |
| `migrations/` | Sequential SQL migrations — the only way to change schema                           | Phase 2    |
| `seed/`       | **Development-only** synthetic seed SQL (`DEV`-labelled; never production values)   | Phase 2    |
| `functions/`  | Deno Edge Functions (trusted boundary); shared Zod contracts from `packages/shared` | Phase 3    |
| `tests/`      | pgTAP RLS / role-matrix / business-rule tests (`supabase test db`)                  | Phase 2    |

The CLI is pinned as a workspace dev dependency (`pnpm exec supabase …`). Local
`supabase start`, `db reset`, `test db` and `functions serve` need a
Docker-compatible container runtime — see `docs/runbooks/local-development.md`.
