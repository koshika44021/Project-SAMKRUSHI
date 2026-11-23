# ADR-0001: Specification precedence and phase numbering

- **Status:** Accepted
- **Date:** 2026-11-23
- **Deciders:** Founders (approved 2026-11-23)

## Context

The six SAMKRUSHI specifications each claim authority:

- `SAMKRUSHI_ARCH_SPEC.md` §0 (v1.0 L14) says "This document is the source of truth".
- `SAMKRUSHI_ADMIN_DASHBOARD_SPEC.md` §17 (v1.0 L935) says "Treat this file as the MVP functional source of truth".
- `SAMKRUSHI_MASTER_MONOREPO_SPEC.md` §0 makes itself primary and calls the other two "source references".

They also use incompatible phase numbering:

| Document        | Numbering                | Hazard                                                                                        |
| --------------- | ------------------------ | --------------------------------------------------------------------------------------------- |
| Master          | Phases 0–9               | —                                                                                             |
| ARCH            | Phases 0–6 + Prompts 0–7 | "Prompt 1: Implement Phase 0 only" = monorepo foundation; ARCH Phase 1 migrates _all_ domains |
| ADMIN_DASHBOARD | Phases 0–7 + Prompts 0–7 | Its Phase 1 = DB, Phase 2 = auth                                                              |
| WEB_ADMIN       | Sequence 1–7             | —                                                                                             |
| ANDROID         | Phases 1–10              | —                                                                                             |
| IOS             | Phases 1–12              | —                                                                                             |

If an agent ran a "Phase N" prompt literally, it would build the wrong scope. The documents also disagree on where decisions are recorded: the master says ADRs, while ARCH §24 says `docs/business-decisions.md`.

## Decision

1. **Precedence:** the master spec governs. Next come `SAMKRUSHI_WEB_ADMIN_SPEC.md`, `SAMKRUSHI_ANDROID_APP_SPEC.md` and `SAMKRUSHI_IOS_APP_SPEC.md`. ARCH and ADMIN_DASHBOARD apply **only where the master and application specs are silent**. Accepted ADRs record binding decisions, and the spec text is amended to match them (v1.1, 2026-11-23). If an agent finds a residual contradiction, it stops and raises it.
2. **Phase numbering:** master phases 0–9 are the only project phase numbering. All other phase lists are sub-steps inside master phases, and their "Phase N"/"Prompt N" texts must not be executed literally.

   | Source                            | Maps to master phase                                                 |
   | --------------------------------- | -------------------------------------------------------------------- |
   | ARCH 0 / 1 / 2 / 3 / 4 / 5 / 6    | 1 / 2 (restricted scope) / 3 + 4 / 5 / 6 / 7 / 8 + 9                 |
   | ADMIN_DASHBOARD 0 / 1–2 / 3–6 / 7 | 0 / 2 (schema, RLS) + 3 (auth UI) / 3 / 9                            |
   | WEB_ADMIN steps 1–8 (v1.1 §20)    | 0, 2, 3, 4, 6, 7, 8, 9                                               |
   | ANDROID 1–10, IOS 1–12            | See each spec's implementation-sequence table (master phases 1, 5–9) |

3. **Phase 2 schema scope:** identity/roles (including `viewer`), `profiles`, `staff_profiles`, `suppliers` + `farmer_profiles`, catalog (`products`, `product_skus`, images, price history), dated supply, `audit_logs`, settings/policy versions, storage references, and the shared availability function in its MVP form. Every later domain gets its migrations in its own phase.
4. **Delivery OTP placement:** rider OTP entry and the customer-facing delivery-OTP display both land in master Phase 7, so the Phase 7 E2E path can pass.
5. **Document locations:** all specs live in `docs/specs/`. ADRs live in `docs/adr/`. `docs/business-decisions.md` is kept as the index: it links approved ADRs and lists the open founder decisions grouped by the master phase each one blocks.
6. ARCH and ADMIN_DASHBOARD are not rewritten. Each gets a status block listing its superseded items, plus inline "Superseded (v1.1)" callouts.

## Consequences

- One unambiguous phase plan. Agents implement exactly one master phase at a time.
- ARCH/ADMIN_DASHBOARD remain useful for detail (schemas, test scenarios, runbook lists) wherever the master is silent.
- New decisions require a new ADR plus updates to `docs/business-decisions.md` and the affected specs.
- Line references in the source-reference status blocks point to the original v1.0 text.

## References

- Master §0, §10, §11, §12
- WEB_ADMIN §1, §20; ANDROID §10; IOS §11
- ARCH §0 (L14), §17, §23, §24 (L2111) — status block
- ADMIN_DASHBOARD §12, §17 (L935) — status block
- `docs/business-decisions.md`
