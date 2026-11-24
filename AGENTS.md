# Instructions for AI coding agents (Claude Code, Cursor, others)

**Start here:** read [`PROGRESS.md`](PROGRESS.md) first. It is the live handover file: what is done, what is in progress, what is next, environment quirks and the exact commands to verify the repo.

## Read order before changing code

1. `PROGRESS.md`: current phase, checklist, last verified state.
2. `docs/specs/SAMKRUSHI_MASTER_MONOREPO_SPEC.md`. It governs (ADR-0001).
3. The app spec(s) for the work: `SAMKRUSHI_WEB_ADMIN_SPEC.md`, `SAMKRUSHI_ANDROID_APP_SPEC.md`, `SAMKRUSHI_IOS_APP_SPEC.md`.
4. `docs/adr/` (index: `docs/adr/README.md`) and `docs/business-decisions.md` (approved and OPEN founder decisions).

## Non-negotiable rules

- Work on branch `release-m1-2027.1`. Implement **one master phase at a time** (phases 0–9 in master §10). Commit locally at the end of a phase, or of a meaningful step. Never push unless the user asks.
- **Never invent** prices, fees, supplier details, stock, cutoffs, delivery slots, PIN codes, tax rules, contacts or business policies. Use clearly `DEV`-labelled synthetic values, and only in dev seeds. Anything unclear goes into `docs/business-decisions.md` as an open decision, and you ask the user.
- The **backend is authoritative** for money, stock, reservations, payments and authorization. Clients are read-only against the database (ADR-0011). Every mutation is a `SECURITY DEFINER` RPC or trusted server code that checks roles and records `request_id` / `reason`.
- Schema changes go through **new migrations only**. Never edit a migration that has been pushed or shared. Every new table needs RLS, grants, the audit trigger and a role-matrix test row.
- Money is integer paise. Quantities are `NUMERIC` + unit, sent as decimal strings. Business dates are Asia/Kolkata. Enums are lowercase snake_case.
- No secrets in Git, logs or client bundles (`NEXT_PUBLIC_*`, `EXPO_PUBLIC_*`).
- Strict TypeScript, no `any`. Shared Zod contracts live in `packages/shared`.
- Add tests for every business rule. A phase is done only when `pnpm check`, `pnpm db:test` and the E2E tests pass.

## Keep the handover current

After **every** completed task, or before stopping for any reason (for example, credits running out), update `PROGRESS.md`:

- tick the checklist item;
- add a dated changelog line (files, migrations, test results);
- update "Next actions";
- note anything half-done under "In progress / partially done", with exact state.

The next agent must be able to continue from `PROGRESS.md` alone.
