# SAMKRUSHI — Web Admin Dashboard Specification

**Application:** `apps/admin-web` | **Technology:** Next.js + TypeScript | **Users:** Authorized Samkrushi staff | **Version:** 1.1 (amended 2026-11-23) | **Governed by:** `docs/specs/SAMKRUSHI_MASTER_MONOREPO_SPEC.md`

## Amendments v1.1 — 2026-11-23

Founder-approved decisions of 2026-11-23 (see `docs/business-decisions.md`) were applied in place:

| Change | Sections | ADR |
|---|---|---|
| Master precedence. This spec's implementation sequence maps onto master phases 0–9 | §1, §20 | ADR-0001 |
| `viewer` role added to the role matrix. Audit and catalog writes are super_admin-only in the MVP | §2, §3 | ADR-0005 |
| Staff auth uses Supabase Auth email+password, `staff_profiles` + `user_roles`, `@supabase/ssr` cookies and a bootstrap script | §3 | ADR-0005 |
| Farmers are `suppliers` + 1:1 `farmer_profiles`, with verification state and supplier types | §6 | ADR-0004 |
| `products` + `product_skus`, base units, lowercase unit codes | §7 | ADR-0006 |
| Supply quantity rules, computed expiry, one ATP formula, one shared SQL availability function | §5, §8, §11 | ADR-0007 |
| IST business date in header | §4 | — |
| Payment exception queue, hosted checkout, refund `manual_review` | §12, §15 | ADR-0008 |
| Customer delivery-OTP display in Phase 7; substitution option set still open | §13, §14 | — |
| Admin transport: RLS reads, SECURITY DEFINER RPCs/Edge Functions from server actions; shared envelope; decimal-string quantities | §17, §18 | ADR-0003 |

## 1. Purpose and release boundary

This dashboard operates the business. Build the farmer/product availability MVP first (master Phase 3). Then add supplier, procurement, receiving, inventory, orders, packing, dispatch, finance, support and reporting in master phase order (master §10). The master spec governs any conflict (ADR-0001).

### 1.1 MVP deliverables from the original admin specification
1. Secure staff login/logout (Supabase Auth, ADR-0005).
2. Overview dashboard.
3. Farmer registration, list, search, details, edit and deactivation.
4. Predefined product catalog (`products` + `product_skus`), seeded in the database with dev-only synthetic data until founders approve the launch catalog.
5. Add a catalog product to a farmer with a farmer-confirmed quantity.
6. Update/deactivate farmer-product supply.
7. Aggregate active supply by product and business date through the shared availability function.
8. Customer-facing API (`get-catalog`/`get-product-detail` Edge Functions) that returns positive, valid sellable availability as status + `maxOrderable` packs.
9. Audit history (super_admin only).
10. API contract (shared Zod schemas in `packages/shared`) so the mobile app can be built in parallel.

The MVP excludes ordering, payment/refunds, pack customization, delivery/rider management, farmer self-service, farmer payments, procurement routing, receiving, lot traceability, multiple cities and loyalty. Keep extension points, but don't implement these in the MVP phase.

## 2. Navigation

MVP:
- Overview
- Farmers
- Products & Availability
- Staff / Users (super_admin only)
- Audit History (super_admin only)

Full platform:
- Overview, Orders, Products & Catalog, Farmers & Suppliers, Farmer Availability, Procurement, Goods Receiving & Quality, Inventory & Batches, Picking & Packing, Dispatch & Deliveries, Customers, Support, Payments & Exceptions, Finance & Reconciliation, Reports, Staff & Roles, Audit History, Settings.

Navigation is role-aware, but backend authorization is mandatory. `apps/admin-web` also hosts the restricted rider route (§14), the public legal pages and the hosted payment page (master §13.8, ADR-0008). Public pages never grant staff access.

## 3. Roles and security

Use the platform roles `super_admin`, `operations_admin`, `finance_admin`, `dispatch_admin`, `support_agent`, `rider` and `viewer`. Source MVP roles map explicitly: `ADMIN` → `super_admin` (approved dashboard permissions), `OPERATIONS` → `operations_admin`, `VIEWER` → `viewer` (read-only). Do not silently grant extra privileges. One person may hold several roles (`user_roles`, `UNIQUE(user_id, role)`).

| Capability | Super admin | Operations | Finance | Dispatch | Support | Rider | Viewer |
|---|---:|---:|---:|---:|---:|---:|---:|
| Overview | Full | Operations view | Finance view | Dispatch view | Support view | Assigned route | MVP read-only view |
| Farmer/supplier | Yes | Yes | Restricted finance fields | No | No | No | Read (no bank fields; phone masked/photo hidden until founders decide) |
| Farmer supply | Yes | Yes | No | No | No | No | Read |
| Catalog | Yes (MVP writes super_admin only) | Read in MVP; delegated write later as explicit permission | Tax/finance config | No | Read-only safe data | No | Read |
| Procurement/receipts/inventory | Yes | Yes | Cost/payable read | No | No | No | No |
| Orders/packing | Yes | Yes | Financial read | Assignment/dispatch | Support scope | Assigned only | No |
| Payment/refunds/exceptions | Yes | No | Yes | Collection status | Request only | COD entry only | No |
| Slots/zones | Yes | Delegated | No | Yes | No | No | No |
| Audit history | Yes | No (scoped view later only as explicit permission) | No | No | No | No | No |
| Roles/settings | Yes | No | No | No | No | No | No |

Staff authentication (ADR-0005):
- Supabase Auth email+password. No app-managed `password_hash`. Username login only if founders require it (it would need a trusted username→email lookup).
- `staff_profiles` (`full_name`, `is_active`, `last_login_at`, created/updated by and at) and `user_roles`.
- `@supabase/ssr` sessions in HTTP-only, SameSite, Secure (outside local) cookies. CSRF protection for server actions and route handlers.
- Every request to dashboard or rider routes is rejected unless it has an active `staff_profiles` row and a matching active staff role. A customer-only session (same Auth project) is rejected.
- Deactivating staff bans the Auth user and revokes all sessions. Reactivation lifts the ban. Both are audited.
- No public staff registration. The first `super_admin` is created by a one-time server script using env-supplied credentials. No default password is committed, and the script refuses to run if a `super_admin` exists. Staff are then created by a super_admin through a trusted server operation. The password-reset method is an open founder decision; the MVP default is admin-assisted.

Also required: HTTPS, login rate limits beyond Supabase defaults, generic invalid-credential response, logout invalidation, no secrets in Git/logs. Every protected server operation checks the role, and RLS applies to exposed records.

## 4. Global shell and interaction

- Left navigation. The header shows the current `Asia/Kolkata` business date **as provided by the server**, the staff name/role, alerts and logout. Around midnight, the selected business date is shown prominently, with a warning if it differs from the current one (master §13.12).
- Breadcrumb, title, filters, primary action.
- Reusable tables, search, pagination, sorting, filters, forms, detail view and confirmation dialogs.
- Desktop-first; tablet/mobile browser still usable.
- Every page includes loading, empty, error, success and retry states.
- Prevent duplicate submits. Preserve form values after recoverable errors.
- Show units, date, actor and timestamps explicitly.
- Confirm destructive and high-impact operations.
- Viewer sessions render read-only screens with no mutation controls. The backend still rejects mutations.

## 5. Overview dashboard

MVP widgets:
- Active farmers.
- Active products with positive sellable availability (ATP > 0).
- Active farmer-product supply records for the selected date.
- Zero-supply products.
- Low-supply products, using each product's configured low-supply threshold (threshold values are catalog/founder decisions).
- Recent farmer/supply updates.
- Expired/inactive supply alerts. Expired means the business date is past in `Asia/Kolkata`, and is computed, not stored.

Later widgets:
- Orders by status and slot.
- Payment/COD exceptions (master §13.2).
- Procurement shortfall, including reservations exceeding open supply (ADR-0007).
- POs awaiting receipt.
- Receipts awaiting inspection.
- Low, expiring, held or recalled batches.
- Orders waiting for pick/pack.
- Dispatch progress/failed deliveries.
- Refund queue, including `manual_review`.
- Sales, COGS and contribution, only where source data supports them.

Define every KPI and filter. Do not aggregate unlike units or call farmer-confirmed supply "warehouse stock." Show the business/procurement date. All widgets read the shared availability function (master §1.1).

## 6. Farmer and supplier management

Data model (ADR-0004): one `suppliers` table (`supplier_type`: `farmer`, `fpo`, `aggregator`, `approved_source`, `other`; `wholesaler` only if founders approve) plus a 1:1 `farmer_profiles` extension for farmers. Dated supply references `supplier_id` and is labelled "farmer" in the MVP UI. Supplier status: `pending_verification`, `active`, `suspended`, `inactive`.

### 6.1 Farmer list
Columns: code, name, type, primary contact, location (village/locality, mandal, district), products supplied, status, verification and last availability update. Search by name/code/phone/locality. Filter by type, status, district/mandal, product and whether active supply exists. Paginate and sort.

### 6.2 Registration fields
The original dashboard spec requires farmer name, full address/location, locality/village, mandal, district, state, PIN, land area and unit (when applicable), farmer photo, primary and secondary contact numbers, unique farmer code and status. These are stored as `suppliers` (identity, type, status, code) + `farmer_profiles` (`address_line`, `village_locality`, `mandal`, `district`, `state`, `pin_code`, `land_area_value`, `land_area_unit` (`acre`/`hectare`), `photo_storage_key` (private), `primary_phone`, `secondary_phone`, `notes`).

Which farmer fields are mandatory (secondary contact, land area, photo), the farmer code format, and whether MVP farmers may be `active` on creation are open founder decisions. Dev defaults follow ADMIN_DASHBOARD §16 in Zod validation: code `SAM-FRM-000001` style, active on creation in dev only. DB columns stay nullable where the decision is open.

Broader supplier profile:
- Supplier type: farmer/FPO/aggregator/approved source/other.
- Authorized contacts and sourcing/collection/packing location.
- Product relationships, seasonality, indicative/agreed rates and lead time.
- Quality specifications, notes and verification state.
- Agreements and documents in private storage (master §13.9).
- Verifier and verification timestamp.

Validate client and server side. Warn on duplicate phone and never silently merge. The dev default is to require an explicit confirm-with-reason, audited. Restrict bank/payment fields to finance roles, in a separate finance-only table. Deactivate/reactivate; don't hard-delete history.

### 6.3 Supplier detail tabs
Overview; Contacts & Locations; Products; Availability; Purchase Orders; Receipts/Quality; Documents; Performance; Activity/Audit (super_admin). Role-restrict finance data.

## 7. Products and SKUs

The MVP catalog is predefined and seeded. Staff do not create a product while entering a farmer's supply. A customer-visible product appears only when its ATP for the business date and zone is positive (in the MVP: at least one active farmer has positive valid dated supply). Catalog writes are super_admin-only in the MVP (seed/migration scripts or a restricted screen). Delegation to operations is a later explicit permission.

Data model (ADR-0006):
- `products`: category, display name, local name, description, images, active/listable state, **base/inventory unit** (`kg`, `g`, `piece`, `bunch`, … lowercase), quantity precision, low-supply threshold.
- `product_skus`: fixed-pack SKU with a stable SKU code, pack quantity expressed in the product base unit, sale unit, customer price in integer paise, min/max/order step (in packs), image ordering and tax classification as approved.
- SKU price history and order snapshots.

Supply, batches and reservations are kept in the product base unit. Per-SKU availability is derived from the product pool. Never sum unlike units. Pack sizes, prices and tax classification are founder decisions. Never expose supplier purchase cost/margin. No unsupported organic/chemical-free/pesticide-free claims.

## 8. Farmer-confirmed supply

Entry form: farmer/supplier, catalog product, business date (defaults to the server business date), quantity (in the product base unit; any alternative entry unit is converted exactly on the server), unit, confirmation source, confirmed by, confirmation timestamp, note and optional evidence.

Rules:
- Date is mandatory. No indefinite carry-forward.
- Only an active supplier and an active catalog product.
- Quantity: DB `CHECK (>= 0)`. Create requires `> 0`. An update may set `0` only with a reason. Valid precision and the base unit are required.
- Prevent duplicate active supplier-product-date records with a partial unique index. Explicit versioning only if founders approve multiple lots per date.
- Edit with optimistic concurrency (version), actor, timestamp and reason. Whether a reason is required on every change or only on material changes is an open founder decision; the dev default requires one on every change.
- Deactivation/reactivation is audited.
- Expired (past business date in `Asia/Kolkata`, computed), zero and inactive records are excluded.
- The dashboard and customer app use one shared SQL availability function.

Views: by date, farmer, product/category, status; history of edits and actors. Labels must say "Farmer-confirmed supply", "Open confirmed supply", "Sellable quantity (ATP)" or "Available to list", never an ambiguous "total stock."

Availability formula (one formula for all phases; master §1.1, ADR-0007):
`ATP = max(0, eligible accepted on-hand + open confirmed supply − active reservations)`, per product base unit, per business date and zone parameter.

In the MVP, on-hand and reservations are 0, so this equals `SUM(active, valid farmer-confirmed quantities for product and business date)`. When reservations are introduced (master Phase 6), checkout may reserve against open confirmed supply, which is approved as the interim model. Once receiving/batches are active (Phase 4), posting a receipt converts the referenced supply exactly once. Received quantity leaves open supply, accepted quantity becomes eligible on-hand, and pool reservations move to the batch. Confirmed supply and received stock are never double counted.

## 9. Procurement and purchase orders (later phase)

Planning compares demand/commitments, eligible accepted inventory, reservations and open farmer supply. Show shortfall by product/SKU with units and assumptions, including pool reservations that exceed open supply.

PO fields: PO number, supplier, expected date, fulfilment/packing location, product/SKU lines, requested quantity/unit and agreed cost and notes. States: `draft`, `sent`, `partially_received`, `received`, `cancelled`. Partial receipt is supported. PO creation never changes stock. Preserve ordered, received, accepted, rejected and damaged separately.

## 10. Receiving, quality and batches (later phase)

A receipt records PO, supplier, product/SKU, the dated supply record(s) being fulfilled (optional), lot/batch ID, received/accepted/rejected/damaged quantities, grade, notes, operator, timestamp, photos and verifiable harvest/collection date. Sell-by/expiry only under approved policy.

Accepted + rejected + damaged must reconcile with received quantity under defined quantity semantics. Over-receipt requires an approved exception. Only accepted physical quantity creates eligible stock. Rejected/damaged stock is never sellable.

Batch detail: supplier, product, location, receipt date, accepted on-hand, reserved, available, hold/recalled/expired state, sell-by date if reliable, movement ledger. Use FEFO when reliable expiry/sell-by exists; otherwise FIFO. Harvest date is not expiry. Recall cases link affected batches through `product_recall_batches` and list the consuming orders (master §13.10).

## 11. Inventory

Views by product/SKU/batch: on-hand, reserved, ATP, damaged/rejected, held and expired. ATP follows master §1.1: eligible accepted on-hand + open confirmed supply − active reservations, floored at zero. All stock changes go through auditable movements: receipt, damage, wastage, sample use, correction, expiry write-off and approved return types. Reservation release changes reservation state; do not create an artificial stock-in movement. No arbitrary overwrite or negative availability. Held/recalled/expired batches cannot be reserved. Active reservations on a batch that becomes ineligible return to the supply pool and raise an exception.

## 12. Orders and customer records (later phase)

The order list filters by date, order status, payment state, customer, zone and slot. Detail includes customer/address (role-scoped, including `locality`), immutable item snapshots, SKU/pack/quantity, price breakdown, slot, payment attempts/events, hosted-checkout sessions, reservation, picking/packing, delivery assignment, status history, support and audit.

All status transitions are validated server-side. Never allow direct status-field editing that bypasses the workflow. Preserve order snapshots after catalog changes. A customer can see only their own data.

## 13. Picking, packing and substitution

Queue by delivery date/slot/zone. The picker sees SKU, fixed pack, quantity and the eligible batch instruction. Record picked/packed quantities, batch allocations and discrepancies. Substitution requires approved customer preference/consent and is never silent. The option set ("allow similar" vs "approved replacement" vs "contact me") and the price-difference handling are open founder decisions; the dev default enables only `no_substitution`. The stock consumption point (pick vs pack) is a founder decision. Only confirmed packed orders enter the dispatch queue.

## 14. Dispatch and rider operations

The dispatch board groups packed orders by date, slot and zone. Manage delivery people, and assign/reassign with actor and timestamp. Assignment and order sequence are manual at first; GPS/route optimization is deferred.

Restricted rider route within admin web (requires the `rider` role; the sign-in method is an open founder decision because riders may lack email):
- Sign in; today's assigned deliveries.
- Delivery list by slot/route sequence.
- Detail with customer name/phone/address/notes/amount due.
- Call customer.
- Mark out for delivery.
- Enter the one-time OTP that the customer sees in the customer app (master §13.6), or approved proof.
- Mark failed with a required reason.
- Record COD collected amount.

The rider sees assigned orders only and cannot modify price, items, online payment state or unrelated assignments. The OTP is single-use, expires and is rate-limited. Rider OTP entry and the customer-facing OTP display ship together in master Phase 7.

## 15. Payments, refunds and finance

Payment view: internal order, provider IDs, hosted-checkout session history, expected amount/currency, captured amount, event state, failure/reconciliation and timeline. Release 1 uses Razorpay Hosted/Standard Checkout (ADR-0008). Verify the Razorpay webhook raw-body signature, provider order ID, amount/currency and event uniqueness. The client callback is not authoritative.

Payment exceptions (master §13.2): a queue of amount/currency mismatches, unknown provider orders, captures after reservation release, duplicate captures and refund mismatches. Finance/super_admin can re-reserve (if ATP allows), issue a manual refund, or resolve with a reason. Every action is audited.

Refund: a finance role validates the order, captured balance less prior refunds, status and reason, then creates the refund server-side. States: `requested`, `pending`, `processed`, `failed`, `cancelled`, `manual_review`. Do not mark refunded before provider confirmation. A COD refund depends on recorded cash collection. Audit every action.

Reports:
- Gross sales, discounts, delivery fees, refunds, net sales.
- Actual COGS from batch cost allocation.
- Packaging material/labor, gateway charges and delivery cost.
- Wastage/write-off.
- Contribution by order/SKU/category/date.
- Supplier payable ageing/history.
- Expenses, COD and gateway settlement reconciliation.
Label actual vs estimated clearly. Report definitions are founder decisions.

## 16. Support and settings

A support ticket includes status, type, assigned agent, order link, minimum customer details, issue, attachments, contact history, customer-visible replies vs internal notes, and resolution. Support can request cancellation/refund but cannot edit payment or supplier cost.

Settings (authorized and audited; master §13.14): store/support contacts, service zones/PINs, slots/date/time/capacity/cutoff, minimum order, delivery fee, COD limits, store hours, rate limits, job TTLs, substitution/cancellation/refund policy versions, tax config after professional review, temporary pause switch. Do not hard-code production values.

## 17. Audit and non-functional requirements

Audit goes into one append-only `audit_logs` table: `actor_user_id`, `actor_role`, `action`, `entity_type`, `entity_id`, `created_at`, `reason`, redacted `before`/`after`, `request_id`, `source`, and `ip_hash` (nullable and unused until founders approve; no raw IP). No UPDATE/DELETE grants. Audit History is visible to super_admin only. Never log secrets or excess PII. Paginate lists, index name/phone/status/product/business date, and avoid N+1. Target common MVP dashboard reads under one second at expected pilot load, then measure. Use structured logs with request IDs, a health endpoint, error monitoring, backups/restore and dependency scanning (master §13.11).

## 18. Technical approach

Next.js App Router + strict TypeScript. Shared Zod schemas, API DTOs and the response envelope (`{data, meta:{requestId,…}}` / `{error:{code,message,details,requestId}}`) come from `packages/shared`. Quantities are decimal strings, money is integer paise, and enums are lowercase snake_case (ADR-0003). TanStack Query for server state where used. Reads use RLS-protected queries/views. All business mutations go through `SECURITY DEFINER` RPCs or Edge Functions, called from server actions/route handlers. RLS plus server role checks. No service-role key in the browser. Use parameterized operations and migration-backed schema changes.

## 19. Acceptance criteria

MVP:
1. Active super_admin/operations staff can log in. Invalid, inactive and customer-only sessions cannot. Logout invalidates the session. Deactivation bans the user and revokes sessions.
2. Viewer can read MVP data but cannot mutate, and cannot see audit, finance or bank fields (role-matrix tests).
3. Required farmer fields are validated; duplicate phone warning works.
4. Deactivation preserves history and removes new supply.
5. Only predefined catalog products are selectable.
6. Supplier-product-date uniqueness (or approved explicit versioning) is enforced.
7. Zero/expired/inactive supply is excluded. Create rejects quantity 0, and update to 0 requires a reason.
8. Aggregation reconciles to the database and never combines unlike units. The dashboard and `get-catalog` return consistent results from the shared function.
9. The customer API returns only eligible products for the business date and zone, as status + `maxOrderable`, without raw supply totals or farmer data.
10. All important changes are audited with actor role, reason and request ID. Audit is super_admin-only.
11. Search, filters and pagination work; recoverable form errors preserve input.
12. The header business date comes from the server in `Asia/Kolkata`.

Full platform:
- A PO never creates stock; partial receipts reconcile.
- Only accepted quantities create eligible batches. Supply→receipt conversion never double counts.
- FEFO/FIFO allocation; no negative ATP.
- Concurrent reservations are safe.
- Only packed orders are dispatchable.
- The rider is assignment-scoped. The OTP expires, is single-use, and matches the code shown in the customer app.
- A refund never exceeds the captured balance. Payment exceptions are quarantined.
- RLS and role matrix tests pass.

## 20. Implementation sequence

This sequence maps onto master phases (ADR-0001). It is not separate phase numbering.

| Step | Work | Master phase |
|---|---|---|
| 1 | Inspect repo and report before code | 0 |
| 2 | Schema, auth/roles (incl. viewer), RLS, audit, shared availability function | 2 |
| 3 | Staff auth UI, farmer/catalog/supply MVP, customer catalog API | 3 |
| 4 | Suppliers, procurement, receipt, quality, batches, inventory, reservation schema | 4 |
| 5 | Orders, payments (hosted checkout), reservations, payment exceptions | 6 |
| 6 | Picking/packing, dispatch and rider (with customer OTP display in mobile) | 7 |
| 7 | Support, COD reconciliation | 8 |
| 8 | Finance reports, settings, legal pages, production hardening | 9 |

Do not begin a later module before the prior acceptance tests pass. Any unresolved business rule must be presented to the founders, not invented by the agent.
