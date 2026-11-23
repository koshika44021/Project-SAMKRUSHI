# ADR-0004: Supplier identity and farmer profiles

- **Status:** Accepted
- **Date:** 2026-11-23
- **Deciders:** Founders (approved 2026-11-23)

## Context

- ADMIN_DASHBOARD §5.2 (v1.0 L360–375) defines a standalone `farmers` table, with village, mandal, district, state, PIN, land area and unit, photo, and primary/secondary phones. Its supply table references `farmer_id`.
- ARCH §7.4 (L745–756) defines `suppliers`, which procurement and batches reference (`purchase_orders.supplier_id`, `product_batches.supplier_id`), but it lacks the farmer fields.
- Building both tables would fork supplier identity: farmer supply could not be linked to purchase orders and receipts.
- `supplier_type` values differ. ARCH L648 includes `wholesaler`, while master §4.1 and WEB_ADMIN §6.2 list farmer/FPO/aggregator/approved source.
- ADMIN_DASHBOARD makes farmers active on creation (L199, L214). Master §4.1 and ARCH §6.1 activate only after required checks.

## Decision

1. **One `suppliers` table** is the only supplier identity. Fields: `id`, `supplier_code` (unique), `name`, `supplier_type`, `status`, primary contact, address fields, verification fields (`verified_by`, `verified_at`, `verification_notes`), created/updated by and at.
2. **`supplier_type`** = `farmer`, `fpo`, `aggregator`, `approved_source`, `other`. `wholesaler` is excluded unless the founders approve it.
3. **1:1 `farmer_profiles`** (`supplier_id` PK/FK, allowed only when `supplier_type = farmer`) holds the dashboard farmer fields: `address_line`, `village_locality`, `mandal`, `district`, `state`, `pin_code`, `land_area_value`, `land_area_unit` (`acre`, `hectare`), `photo_storage_key` (private bucket key, never a URL), `primary_phone`, `secondary_phone` (E.164), `notes`.
4. **Status / verification state:** `pending_verification`, `active`, `suspended`, `inactive`. History is preserved after deactivation. Supply entry requires `active`.
5. **Dated supply** references `supplier_id` (labelled "farmer" in the MVP UI). Columns: product, business date, base-unit quantity (`CHECK >= 0`; create > 0; update to 0 only with a reason), confirmation source, `confirmed_by`, `confirmed_at`, note, optional evidence key, reason for change, `version` (optimistic concurrency), audit columns. A partial unique index enforces one active row per supplier + product + business date. Expiry is computed from the business date.
6. Bank/payment details live in a separate finance-only table (a later phase) and never appear in `suppliers` or `farmer_profiles`.
7. Duplicate phone: warn, and require an explicit confirmation with a reason, which is audited (dev default). Records are never silently merged.
8. **Open founder confirmations**, kept configurable or nullable until decided:
   - whether MVP farmers may be `active` on creation (the dev default follows ADMIN_DASHBOARD §16: active on creation, in dev only);
   - whether the secondary contact, land area and photo are mandatory (the dev default follows ADMIN_DASHBOARD §16 in Zod validation; DB columns stay nullable);
   - the farmer code format (dev default `SAM-FRM-000001` style);
   - whether viewer may see farmer phones/photos.

### Implementation note (Phase 2, 2026-11-23)

Points 1 and 3 above list address and phone fields on both tables. To keep one copy of each fact, the Phase 2 schema stores them as follows:

- **`suppliers`** holds the location fields shared by every supplier type: `address_line`, `village_locality`, `mandal`, `district`, `state`, `pin_code`. It also holds the verification fields and the deactivation reason.
- **`supplier_contacts`** holds phones and emails (`primary` / `secondary` / `authorized`, E.164). At most one active primary and one active secondary per supplier. Duplicate phones across suppliers are allowed (warn, never merge). Reads are limited to `super_admin`, `operations_admin` and `finance_admin`; viewers get masked numbers through `supplier_contact_summaries()` (ADR-0011).
- **`farmer_profiles`** holds only farmer-specific fields: `land_area_value` + `land_area_unit` (stored together) and `photo_storage_key`. A composite foreign key `(supplier_id, supplier_type = 'farmer')` guarantees the profile can only attach to a farmer, and a farmer with a profile cannot change type.

## Consequences

- Procurement, receipts, batches and supply all join on `supplier_id`, so traceability from farmer statement to batch to order is possible.
- Farmer-specific validation lives in Zod plus DB checks on `farmer_profiles`. FPO/aggregator records carry no farmer-only columns.
- The MVP farmer screens read and write two tables in one transaction (RPC).
- When founders confirm the required fields, NOT NULL constraints are added by migration.

## References

- Master §4.1, §4.2, §6
- WEB_ADMIN §6, §8
- ADMIN_DASHBOARD §3.4–§3.8, §5.2, §5.5, §16 (L887–892, L921–923) — status block
- ARCH §6.1, §7.1 (L648), §7.4 (L745–756) — status block
- ADR-0005 (viewer visibility), ADR-0007 (supply in availability)
