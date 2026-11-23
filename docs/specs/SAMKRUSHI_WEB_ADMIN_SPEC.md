# SAMKRUSHI — Web Admin Dashboard Specification

**Application:** `apps/admin-web` | **Technology:** Next.js + TypeScript | **Users:** Authorized Samkrushi staff

## 1. Purpose and release boundary

This dashboard operates the business. Build the farmer/product availability MVP first, then add supplier, procurement, receiving, inventory, orders, packing, dispatch, finance, support and reporting in the master phase order.

### 1.1 MVP deliverables from the original admin specification
1. Secure staff login/logout.
2. Overview dashboard.
3. Farmer registration, list, search, details, edit and deactivation.
4. Predefined product catalog seeded in database.
5. Add catalog product to farmer with farmer-confirmed quantity.
6. Update/deactivate farmer-product supply.
7. Aggregate active supply by product and business date.
8. Customer-facing API returns positive valid sellable availability.
9. Audit history.
10. API contract allowing mobile app to be built in parallel.

MVP excludes ordering, payment/refunds, pack customization, delivery/rider management, farmer self-service, farmer payments, procurement routing, receiving, lot traceability, multiple cities and loyalty. Keep extension points but don't implement these in the MVP phase.

## 2. Navigation

MVP:
- Overview
- Farmers
- Products & Availability
- Staff / Users (ADMIN only)
- Audit History (ADMIN only)

Full platform:
- Overview, Orders, Products & Catalog, Farmers & Suppliers, Farmer Availability, Procurement, Goods Receiving & Quality, Inventory & Batches, Picking & Packing, Dispatch & Deliveries, Customers, Support, Finance & Reconciliation, Reports, Staff & Roles, Audit History, Settings.

Navigation is role-aware, but backend authorization is mandatory.

## 3. Roles and security

Use platform roles `super_admin`, `operations_admin`, `finance_admin`, `dispatch_admin`, `support_agent`, `rider`. Preserve source MVP roles through explicit mapping: `ADMIN` maps to approved super-admin dashboard permissions, `OPERATIONS` to operations, `VIEWER` to read-only. Do not silently grant extra privileges.

| Capability | Super admin | Operations | Finance | Dispatch | Support | Rider |
|---|---:|---:|---:|---:|---:|---:|
| Overview | Full | Operations view | Finance view | Dispatch view | Support view | Assigned route |
| Farmer/supplier | Yes | Yes | Restricted finance fields | No | No | No |
| Farmer supply | Yes | Yes | No | No | No | No |
| Catalog | Yes | Delegated | Tax/finance config | No | Read-only safe data | No |
| Procurement/receipts/inventory | Yes | Yes | Cost/payable read | No | No | No |
| Orders/packing | Yes | Yes | Financial read | Assignment/dispatch | Support scope | Assigned only |
| Payment/refunds | Yes | No | Yes | Collection status | Request only | COD entry only |
| Slots/zones | Yes | Delegated | No | Yes | No | No |
| Roles/settings | Yes | No | No | No | No | No |

No public staff registration. Bootstrap first admin securely. Inactive users cannot log in. Prefer secure HTTP-only SameSite session cookies where compatible. HTTPS, login rate limits, generic invalid credential response, logout invalidation, no secrets in Git/logs. Every protected server operation checks role; RLS applies to exposed records.

## 4. Global shell and interaction

- Left navigation, header with current `Asia/Kolkata` business date, staff name/role, alerts and logout.
- Breadcrumb, title, filters, primary action.
- Reusable tables, search, pagination, sorting, filters, forms, detail view and confirmation dialogs.
- Desktop-first; tablet/mobile browser still usable.
- Every page includes loading, empty, error, success and retry states.
- Prevent duplicate submits; preserve form values after recoverable errors.
- Show units, date, actor and timestamps explicitly.
- Confirm destructive and high-impact operations.

## 5. Overview dashboard

MVP widgets:
- Active farmers.
- Active products with positive sellable availability.
- Active farmer-product supply records for selected date.
- Zero-supply products.
- Low-supply products using configured thresholds.
- Recent farmer/supply updates.
- Expired/inactive supply alerts.

Later widgets:
- Orders by status and slot.
- Payment/COD exceptions.
- Procurement shortfall.
- POs awaiting receipt.
- Receipts awaiting inspection.
- Low, expiring, held or recalled batches.
- Orders waiting for pick/pack.
- Dispatch progress/failed deliveries.
- Refund queue.
- Sales, COGS and contribution only where source data supports it.

Define every KPI and filter. Do not aggregate unlike units or call farmer-confirmed supply “warehouse stock.” Show business/procurement date.

## 6. Farmer and supplier management

### 6.1 Farmer list
Columns: code, name, type, primary contact, location, products supplied, status, verification and last availability update. Search by name/code/phone. Filter by type, status, locality, product; paginate and sort.

### 6.2 Registration fields
The original dashboard spec requires farmer name, full address/location, locality/village, mandal, district, state, PIN, land area and unit (when applicable), farmer photo, primary and secondary contact numbers, unique farmer code and status.

Broader supplier profile:
- Supplier type: farmer/FPO/aggregator/approved source.
- Authorized contacts and sourcing/collection/packing location.
- Product relationships, seasonality, indicative/agreed rates and lead time.
- Quality specifications, notes and verification state.
- Agreements and documents in private storage.
- Verifier and verification timestamp.

Validate client and server side. Warn on duplicate phone; never silently merge. Restrict bank/payment fields to finance roles. Deactivate/reactivate, don't hard-delete history.

### 6.3 Supplier detail tabs
Overview; Contacts & Locations; Products; Availability; Purchase Orders; Receipts/Quality; Documents; Performance; Activity/Audit. Role-restrict finance data.

## 7. Products and SKUs

MVP catalog is predefined and seeded. Staff do not create a product while entering a farmer's supply. Customer-visible product appears only when at least one active farmer has positive valid dated supply under MVP rules.

Full catalog fields:
- Category, display name, description, images, active/listable state.
- Fixed-pack SKU and stable SKU code.
- Pack size and explicit unit (`g`, `kg`, `bunch`, `piece`).
- Customer price in integer paise.
- Tax classification as approved.
- Min/max/order increment and image ordering.
- Price history and order snapshots.

Never expose supplier purchase cost/margin. No unsupported organic/chemical-free/pesticide-free claims.

## 8. Farmer-confirmed supply

Entry form: farmer/supplier, catalog product, business date, quantity, unit, confirmation source, confirmed by, confirmation timestamp, note and optional evidence.

Rules:
- Date is mandatory; no indefinite carry-forward.
- Only active farmer and active catalog product.
- Positive quantity, valid precision and unit.
- Prevent duplicate active farmer-product-date records or implement explicit versioning.
- Edit with optimistic concurrency, actor, timestamp and reason.
- Deactivation/reactivation audited.
- Expired, zero and inactive records excluded.
- Dashboard/customer app use one shared backend aggregation service.

Views: by date, farmer, product/category, status; history of edits and actors. Labels must say “Farmer-confirmed supply”, “Sellable quantity” or “Available to list”, never ambiguous “total stock.”

MVP formula:
`SUM(active, valid farmer-confirmed quantities for product and business date)`

When order reservations are introduced:
`confirmed supply − active reservations − confirmed allocations`, only if this is the explicitly approved interim fulfilment model. Once receiving/batches are active, move to the inventory-backed ATP policy and prevent double counting confirmed supply and received stock.

## 9. Procurement and purchase orders (later phase)

Planning compares demand/commitments, eligible accepted inventory, reservations and valid farmer supply. Show shortfall by product/SKU with units and assumptions.

PO fields: PO number, supplier, expected date, fulfilment/packing location, product/SKU lines, requested quantity/unit, agreed cost and notes. States: `draft`, `sent`, `partially_received`, `received`, `cancelled`. Partial receipt supported. PO creation never changes stock. Preserve ordered, received, accepted, rejected and damaged separately.

## 10. Receiving, quality and batches (later phase)

Receipt records PO, supplier, product/SKU, lot/batch ID, received/accepted/rejected/damaged quantities, grade, notes, operator, timestamp, photos and verifiable harvest/collection date. Sell-by/expiry only under approved policy.

Accepted + rejected + damaged must reconcile with received quantity under defined quantity semantics. Over-receipt requires an approved exception. Only accepted physical quantity creates eligible stock. Rejected/damaged never sellable.

Batch detail: supplier, product, location, receipt date, accepted on-hand, reserved, available, hold/recalled/expired state, sell-by date if reliable, movement ledger. Use FEFO when reliable expiry/sell-by exists; otherwise FIFO. Harvest date is not expiry.

## 11. Inventory

Views by SKU/batch: on-hand, reserved, ATP, damaged/rejected, held and expired. ATP = eligible accepted on-hand − active reservations. All stock change through auditable movement: receipt, damage, wastage, sample use, correction, expiry write-off and approved return types. Reservation release changes reservation state; do not create artificial stock-in movement. No arbitrary overwrite or negative availability. Hold/recalled/expired batches cannot be reserved.

## 12. Orders and customer records (later phase)

Order list filters by date, order status, payment state, customer, zone and slot. Detail includes customer/address (role-scoped), immutable item snapshots, SKU/pack/quantity, price breakdown, slot, payment attempts/events, reservation, picking/packing, delivery assignment, status history, support and audit.

All status transitions validated server-side. Never allow direct status-field editing to bypass workflow. Preserve order snapshots after catalog changes. Customer can see own data only.

## 13. Picking, packing and substitution

Queue by delivery date/slot/zone. Picker sees SKU, fixed pack, quantity and eligible batch instruction. Record picked/packed quantities, batch allocations and discrepancies. Substitution requires approved customer preference/consent; never silent. Only confirmed packed orders enter dispatch queue.

## 14. Dispatch and rider operations

Dispatch board groups packed orders by date, slot and zone. Manage delivery people, assign/reassign with actor and timestamp. Manual assignment/order sequence initially; GPS/route optimization deferred.

Restricted rider route within admin web:
- Sign in; today's assigned deliveries.
- Delivery list by slot/route sequence.
- Detail with customer name/phone/address/notes/amount due.
- Call customer.
- Mark out for delivery.
- Enter one-time OTP or approved proof.
- Mark failed with required reason.
- Record COD collected amount.

Rider sees assigned orders only and cannot modify price, items, online payment state or unrelated assignments. OTP is single-use, expires and is rate-limited.

## 15. Payments, refunds and finance

Payment view: internal order, provider IDs, expected amount/currency, captured amount, event state, failure/reconciliation and timeline. Verify Razorpay webhook raw-body signature, provider order ID, amount/currency and event uniqueness. Client callback is not authoritative.

Refund: finance role validates order, captured balance less prior refunds, status and reason; creates refund server-side. Do not mark refunded before provider confirmation. COD refund depends on recorded cash collection. Audit every action.

Reports:
- Gross sales, discounts, delivery fees, refunds, net sales.
- Actual COGS from batch cost allocation.
- Packaging material/labor, gateway charges and delivery cost.
- Wastage/write-off.
- Contribution by order/SKU/category/date.
- Supplier payable ageing/history.
- Expenses, COD and gateway settlement reconciliation.
Label actual vs estimated clearly.

## 16. Support and settings

Support ticket includes status, type, assigned agent, order link, minimum customer details, issue, attachments, contact history and resolution. Support can request cancellation/refund but cannot edit payment or supplier cost.

Settings (authorized/audited): store/support contacts, service zones/PINs, slots/date/time/capacity/cutoff, minimum order, delivery fee, COD limits, store hours, substitution/cancellation/refund policy versions, tax config after professional review, temporary pause switch. Do not hard-code production values.

## 17. Audit and non-functional requirements

Audit actor, role, action, entity, ID, timestamp, reason, safe before/after values, request ID/source. Never log secrets or excess PII. Paginate lists, index name/phone/status/product/business date, avoid N+1. Target common MVP dashboard reads under one second at expected pilot load, then measure. Use structured logs, health endpoint, error monitoring, backups/restore and dependency scanning.

## 18. Technical approach

Next.js App Router + strict TypeScript. Shared Zod schemas/API DTOs from `packages/shared`. TanStack Query for server state where used. All business mutations through trusted server/Edge Functions. RLS plus server role checks. No service-role key in browser. Use parameterized operations and migration-backed schema changes.

## 19. Acceptance criteria

MVP:
1. Active admin/operations can log in; invalid/inactive cannot; logout invalidates session.
2. Viewer/read-only cannot mutate.
3. Required farmer fields validated; duplicate phone warning.
4. Deactivation preserves history and removes new supply.
5. Only predefined catalog products selectable.
6. Supplier-product-date uniqueness or explicit versioning enforced.
7. Zero/expired/inactive supply excluded.
8. Aggregation reconciles to database and never combines unlike units.
9. Customer API returns only eligible positive products for the business date.
10. All important changes audited.
11. Search, filters and pagination work; recoverable form errors preserve input.

Full platform:
- PO never creates stock; partial receipts reconcile.
- Only accepted quantities create eligible batches.
- FEFO/FIFO allocation; no negative ATP.
- Concurrent reservations safe.
- Only packed orders dispatchable.
- Rider is assignment-scoped; OTP expires and is single-use.
- Refund never exceeds captured balance.
- RLS and role matrix tests pass.

## 20. Implementation sequence

1. Inspect repo and report before code.
2. Schema, auth, RLS and audit.
3. Farmer/catalog/supply MVP.
4. Suppliers, procurement, receipt, quality, batches and inventory.
5. Orders, payments, reservations.
6. Picking/packing, dispatch and rider.
7. Finance, support, reports, settings and production hardening.

Do not begin a later module before prior acceptance tests pass. Any unresolved business rule must be presented to founders, not invented by the agent.
