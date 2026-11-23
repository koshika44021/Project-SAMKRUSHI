# ADR-0007: Availability and available-to-promise (ATP)

- **Status:** Accepted
- **Date:** 2026-11-23
- **Deciders:** Founders (approved 2026-11-23)

## Context

The specs disagree on what customers can order against:

- Master §1 says customers order **before** procurement and goods receipt (midnight cutoff, early-morning delivery).
- ARCH §7.6/§8.1 (v1.0 L907, L1262–1263) reserves only from received batches. Under that model almost nothing would be orderable when customers actually place orders.
- ADMIN_DASHBOARD L69/L321 proposes `confirmed supply − reservations − allocations`.
- WEB_ADMIN §8 allows that only if it is approved as the interim model.
- Master §12 left open whether interim checkout may reserve confirmed supply before receipt.
- The master's no-double-count rule (§1.1) forbids counting a supply statement and its received stock as two pools.
- Master §4.2 and ANDROID §9 require availability per date **and** zone.

## Decision

### Formula

```
ATP(product, business_date, zone) =
  max(0, eligible_on_hand + open_confirmed_supply − active_reservations)
```

- Calculated per product in its **base unit** (ADR-0006), per business date (`Asia/Kolkata`) and per zone parameter. At launch every active zone maps to one shared pool. The parameter exists so adding zones later does not break the API.
- **Open confirmed supply** = the sum, over active, non-expired dated supply records for (product, business_date), of `max(0, confirmed_quantity − received_against_record)`. "Received against the record" is the total _received_ quantity (accepted + rejected + damaged) on receipt lines linked to that record. Once supply is received it counts only as on-hand, and only its accepted part is eligible. The per-record floor means one supplier's over-delivery never cancels another supplier's open supply; any over-delivered accepted quantity is counted once, as on-hand.
- **Eligible on-hand** = the sum of on-hand quantity (from the movement ledger) over batches of the product that are not held, recalled, expired or quality-blocked, and are eligible for that business date.
- **Active reservations** = active reservations on those eligible batches, plus active pool reservations for (product, business_date, zone). Reservations are never inventory movements. A reservation keeps counting until a trusted transaction releases, expires or consumes it.
- Interim checkout **may** reserve open confirmed supply. This resolves master §12.
- In the Phase 3 MVP (no receiving, no reservations yet) the formula reduces to `SUM(active, valid farmer-confirmed quantities for product and business date)`.

### Reservations

- Each reservation carries `product_id`, `business_date`, `zone_id`, `quantity` (base unit), `status` (`active`, `consumed`, `released`, `expired`), `expires_at`, `order_item_id`, and an optional `batch_id`. A null `batch_id` means a **supply-pool reservation**.
- `create-order` serializes per (product, business_date, zone) with a transaction-scoped advisory lock, taken in sorted product order to avoid deadlocks. It recomputes ATP under the lock and inserts reservations only if the requested base-unit quantity is ≤ ATP. Allocation order (**approved by founders 2026-11-23**): eligible on-hand batches first (FEFO, else FIFO), then the business date's supply pool.
- Consumption (at the pick/pack point, which is a founder decision) requires a batch reservation. In one transaction it marks the reservation `consumed` and posts one negative `sale` movement.

### No-double-count conversion (receipt posting, Phase 4)

In **one transaction**, posting a goods receipt line linked to dated supply record(s):

1. Increases `received_against_record` by the received quantity, which reduces open supply.
2. Creates the batch and posts a `receipt` movement for the **accepted** quantity only, which increases eligible on-hand.
3. Moves active pool reservations for (product, business_date) onto the new batch, up to the accepted quantity (FEFO/FIFO order of reservation creation).
4. Leaves any reservations still not covered (because of rejection or short delivery) as pool reservations, and raises a **shortfall exception** for operations if pool reservations exceed the remaining open supply. ATP is floored at 0. Approved engineering rule: the system never oversells and never changes an order silently; each affected order gets an operations exception. The customer-facing remedy is still an open founder decision.

When a batch becomes ineligible (hold, recall, expiry), its active reservations move back to the pool in the same transaction, and an exception is raised.

A partial delivery leaves the remainder open until the record is closed by staff (with a reason) or its business date passes.

### One shared function

A single SQL function is the only availability implementation. It serves the dashboard, `get-catalog`, `get-product-detail`, `get-checkout-quote` and `create-order`. The indicative signature is `product_availability(p_business_date date, p_zone_id uuid, p_product_ids uuid[] default null)`, returning `product_id`, `base_unit`, `eligible_on_hand`, `open_confirmed_supply`, `active_reservations` and `atp`. EXECUTE is not granted to `anon` or customer roles. Customer Edge Functions map its output to per-SKU `availabilityStatus` and `maxOrderable` (ADR-0003, ADR-0006). `limited` means `0 < ATP ≤ low_supply_threshold`, where threshold values are catalog decisions.

### Worked example — SYNTHETIC VALUES FOR ILLUSTRATION ONLY

All names and quantities below are invented examples, not business data.

Product "EXAMPLE Produce A", base unit `kg`. SKUs: `EX-A-500G` (pack 0.500 kg) and `EX-A-1KG` (pack 1.000 kg), each with an example `max_order_packs` of 10. Example low-supply threshold: 15.000 kg. Business date `2099-01-02`, zone "EXAMPLE Zone".

| Step | Event                                                                                                                                                         |         Eligible on-hand |         Open confirmed supply | Active reservations |                               ATP |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -----------------------: | ----------------------------: | ------------------: | --------------------------------: |
| 1    | Example supplier S1 confirms 30.000 kg, S2 confirms 20.000 kg, and S3's record is updated to 0.000 with a reason (excluded)                                   |                    0.000 |      30.000 + 20.000 = 50.000 |               0.000 |                        **50.000** |
| 2    | Example order O1 = 4 × `EX-A-1KG` (4.000 kg); O2 = 6 × `EX-A-500G` (3.000 kg); both reserved against the supply pool                                          |                    0.000 |                        50.000 |        7.000 (pool) |                        **43.000** |
| 3    | S1 delivers against its record: received 30.000, accepted 27.000, rejected 2.000, damaged 1.000. Batch B1 = 27.000. The 7.000 of pool reservations move to B1 |                   27.000 | max(0, 30 − 30) + 20 = 20.000 |       7.000 (on B1) |                        **40.000** |
| 4    | S2 delivers against its record: received 20.000, all accepted. Batch B2 = 20.000                                                                              | 27.000 + 20.000 = 47.000 |                         0.000 |               7.000 |                        **40.000** |
| 5    | B1 is placed on quality hold. Its 7.000 of reservations return to the pool and an exception is raised                                                         |         20.000 (B2 only) |                         0.000 |        7.000 (pool) | **13.000** → `limited` (≤ 15.000) |

- At step 3, a naive sum that counted S1's original 30.000 as supply _and_ its 27.000 as on-hand would give 27 + 50 − 7 = **70.000**. That is the double count this ADR forbids.
- Step 4 shows that a fully accepted conversion leaves ATP unchanged. Only rejection or damage lowers it, by 3.000 at step 3.
- Per-SKU result at step 5: `EX-A-500G` maxOrderable = min(floor(13.000 / 0.500) = 26, 10) = 10 packs, and `EX-A-1KG` = min(13, 10) = 10 packs. Both show `limited`.

## Consequences

- Customers can order before receipt, which matches the business flow. Checkout never oversells, because reservations and ATP share one function and one lock.
- Phase 3 builds the function with on-hand and reservations at 0. Phase 4 adds batches, receipt links and conversion. Phase 6 adds reservations. The API contract does not change between phases.
- Operations need a shortfall/exception view (WEB_ADMIN §5, §9) and a founder-approved shortfall policy.
- Tests must cover: multi-supplier sums; zero/expired/inactive exclusion; unit normalization; zone parameter; per-record floor; conversion with rejection; reservation re-pointing; batch hold returning reservations to the pool; concurrent checkouts; the floor at zero.

## References

- Master §1.1, §4.2–§4.5, §7, §9, §12
- WEB_ADMIN §5, §8–§11
- ADMIN_DASHBOARD §1.3 (L63–72), §4.2–§4.3 (L311, L321), §16 (L910–914, L928–929) — status block
- ARCH §6.4, §7.6 (L903–926), §8.1–§8.2 (L1254–1290), §8.5 — status block
- ANDROID §9 (items 3, 7); IOS §10 (item 7)
- ADR-0003, ADR-0006
