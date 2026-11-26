# Architecture & business decision records

Accepted decisions that amend or clarify the specifications in `docs/specs/`. Precedence follows ADR-0001. `docs/business-decisions.md` indexes these ADRs and tracks open founder decisions.

| ADR                                                   | Title                                                                                                                                 | Status   | Date       | Key spec sections                          |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | -------- | ---------- | ------------------------------------------ |
| [0001](0001-spec-precedence-and-phase-numbering.md)   | Specification precedence and phase numbering                                                                                          | Accepted | 2026-11-23 | Master §0, §10, §11                        |
| [0002](0002-toolchain-and-monorepo.md)                | Toolchain and monorepo configuration (Node.js 24 LTS only, pnpm workspaces + Turborepo, Docker-compatible runtime for local Supabase) | Accepted | 2026-11-23 | Master §2.1, §13.13                        |
| [0003](0003-api-style-envelope-and-serialization.md)  | API style, response envelope and serialization                                                                                        | Accepted | 2026-11-23 | Master §5, §7                              |
| [0004](0004-supplier-identity-and-farmer-profiles.md) | Supplier identity and farmer profiles                                                                                                 | Accepted | 2026-11-23 | Master §4.1, §6; WEB_ADMIN §6              |
| [0005](0005-staff-authentication-and-roles.md)        | Staff authentication and roles (incl. `viewer`)                                                                                       | Accepted | 2026-11-23 | Master §3; WEB_ADMIN §3                    |
| [0006](0006-products-skus-and-units.md)               | Products, SKUs and units                                                                                                              | Accepted | 2026-11-23 | Master §5, §6; WEB_ADMIN §7                |
| [0007](0007-availability-and-atp.md)                  | Availability and ATP                                                                                                                  | Accepted | 2026-11-23 | Master §1.1, §4.2–§4.5                     |
| [0008](0008-payment-checkout-mode.md)                 | Payment checkout mode (Hosted/Standard Checkout first)                                                                                | Accepted | 2026-11-23 | Master §4.3, §7                            |
| [0009](0009-mobile-release-configuration.md)          | Mobile release configuration (Android release 1 first; iOS config from Phase 1; iOS store release follows)                            | Accepted | 2026-11-23 | Master §2, §10; ANDROID §6.6; IOS §12      |
| [0010](0010-delivery-otp-storage.md)                  | Re-viewable delivery OTP storage (encrypted, same code re-viewable)                                                                   | Accepted | 2026-11-23 | Master §4.5, §13.6                         |
| [0011](0011-database-security-model.md)               | Database security model (RLS everywhere, read-only client roles, trusted-server mutations, trigger audit)                             | Accepted | 2026-11-23 | Master §3, §5, §8                          |
| [0012](0012-procurement-and-inventory.md)             | Procurement, receiving and inventory model (POs, receipts, FIFO batches, append-only ledger, reservations, recalls, exceptions)       | Accepted | 2026-11-25 | Master §4.4–§4.5, §13.10; WEB_ADMIN §9–§11 |

## Conventions

- File name: `NNNN-kebab-case-title.md`. Numbers are never reused.
- Sections: Title, Status (`Proposed`, `Accepted`, `Superseded by ADR-NNNN`), Date, Context, Decision, Consequences, References (spec sections).
- A new ADR that changes a decision marks the old one `Superseded by ADR-NNNN` and updates the affected specs and `docs/business-decisions.md` in the same change.
- Never record invented business values (prices, fees, taxes, slots, PINs, contacts). Examples must be clearly synthetic.
