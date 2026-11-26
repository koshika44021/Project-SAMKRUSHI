# ADR-0012: Procurement, receiving and inventory model (Phase 4)

- **Status:** Accepted
- **Date:** 2026-11-25
- **Deciders:** Founders (2026-11-25: no standard procurement or quality rules; no sell-by/expiry policy; packing facility not required; shortfall → product hidden), engineering (model)

## Context

Master §4.4–§4.5 and §10 Phase 4 call for:

- purchase orders (POs) that never add stock;
- partial goods receipts with received / accepted / rejected / damaged quantities;
- batches created only from accepted quantity;
- an append-only movement ledger;
- reservations (supply pool or batch);
- conversion of farmer-confirmed supply to received stock exactly once (ADR-0007);
- recall traceability.

The founders decided there are no procurement or quality standards, no sell-by or expiry policy, and no fulfilment location for now.

## Decision

### Purchase orders

- `purchase_orders`: number `SAM-PO-000001` (dev default format), supplier, expected date, notes and version. Status lifecycle:

  | From                                     | To                                 | How                                  |
  | ---------------------------------------- | ---------------------------------- | ------------------------------------ |
  | `draft`                                  | `sent`                             | Sent by staff                        |
  | `sent` or `partially_received`           | `partially_received` or `received` | Automatically, by posting receipts   |
  | `partially_received`                     | `received`                         | Closed short by staff, with a reason |
  | `draft` or `sent`, with nothing received | `cancelled`                        | Cancelled by staff, with a reason    |

- `purchase_order_lines`: product, ordered quantity in the product **base unit**, optional agreed unit cost in paise per base unit, and an optional link to the **dated supply confirmation** the line fulfils.
  - "Create PO from confirmed supply" prefills lines from a farmer's active, unconverted supply for a business date.
  - A supply record can be linked to at most one open PO line.
- Creating or editing a PO **never changes stock or availability**.

### Receiving and quality

- A `goods_receipts` record (number `SAM-GRN-000001`) belongs to one PO: `draft` → `posted`, or `draft` → `cancelled`.
- Each `goods_receipt_lines` row records:
  - `received = accepted + rejected + damaged` (CHECK), all in the base unit;
  - free-text quality grade and notes, lot code, optional harvest/collection date and optional evidence photo.
  - **No quality rule is enforced** (founder decision).
- **Over-receipt** (received beyond the ordered remainder) needs an explicit reason, which is audited.
- **Posting** runs as one transaction:
  1. Locks the PO.
  2. Creates one **batch** per line with accepted quantity > 0, plus a `receipt` movement for the accepted quantity only. Rejected and damaged quantities are recorded on the line and never become stock.
  3. Increases the linked supply record's _received_ total by the **received** quantity, which reduces open supply exactly once (ADR-0007).
  4. Moves active pool reservations for that product and business date onto the new batch, up to the accepted quantity, oldest reservation first.
  5. Raises a **supply shortfall** exception if pool reservations still exceed the remaining open supply.
  6. Updates the PO status.

### Batches and the movement ledger

- `product_batches`:
  - Holds: code, product, supplier, receipt line, `received_at` (the FIFO key), optional harvest date, initial quantity and optional unit cost.
  - Status is `active`, `on_hold`, `recalled` or `depleted`.
  - **No sell-by or expiry is stored.** Harvest date is not expiry (master §4.4). Allocation is **FIFO by `received_at`**.
- `inventory_movements` is **append-only**. Each row has a signed `quantity_delta` whose sign must match `movement_type`:

  | Increases stock                                     | Decreases stock                                              |
  | --------------------------------------------------- | ------------------------------------------------------------ |
  | `receipt`, `adjustment_increase`, `return_to_stock` | `wastage`, `damage`, `sample`, `adjustment_decrease`, `sale` |
  - On-hand = SUM(delta) per batch. Stock is never overwritten.
  - A decrease may not exceed **on-hand − active reservations on the batch**, so ATP can never go negative. A batch reaching zero on-hand becomes `depleted`.

- Holding or recalling a batch makes it ineligible at once. Its active reservations return to the supply pool, and an operations exception is raised (ADR-0007).
- Recalls are recorded in `product_recalls` plus the `product_recall_batches` junction (master §13.10). The query of affected orders arrives with orders (Phase 6+).

### Reservations (schema now, creation in Phase 6)

- `inventory_reservations`: product, business date, optional zone, optional batch (null = supply-pool reservation), quantity, status (`active`, `consumed`, `released`, `expired`), `expires_at`, and a reference to the future order line.
- Reservations are never movements. In Phase 4 they are only re-pointed and released by trusted functions. `create-order` (Phase 6) will create them under the availability lock.

### Availability (replaces the MVP body of `private.product_availability_core`)

```
eligible_on_hand(product)      = Σ on-hand of ACTIVE batches        (for business_date ≥ today)
open_confirmed_supply(p, date) = Σ max(0, confirmed − received_against_record)   (active, unexpired, active suppliers)
active_reservations(p, date)   = Σ active reservations on eligible batches + Σ active pool reservations (p, date)
ATP                            = max(0, eligible_on_hand + open_confirmed_supply − active_reservations)
```

- Signature and output are unchanged, so the catalog API and dashboard are unaffected.
- With no sell-by policy, stock on hand counts towards any current or future business date.
- **Shortfall customer remedy** (founders): when ATP is 0 the product is `unavailable` and is **not shown** in the customer app. Affected existing orders get an operations exception.

### Operations exceptions

`operations_exceptions` has these types:

- `supply_shortfall`
- `reservations_returned_to_pool`
- `over_receipt`

Each has a product, business date, batch and JSON details, and status `open` → `resolved` (with a note). Staff see and resolve them in the admin app.

### Roles (WEB_ADMIN §3)

| Role                                                            | Procurement, receipts, inventory |
| --------------------------------------------------------------- | -------------------------------- |
| `super_admin`, `operations_admin`                               | Full access                      |
| `finance_admin`                                                 | Read only, including costs       |
| `viewer`, `dispatch_admin`, `support_agent`, `rider`, customers | No access                        |

## Consequences

- Phase 6 must create reservations only through a function that takes the same per-product/date advisory lock as the ATP calculation.
- When the founders approve sell-by rules, add `sell_by_date` to batches, switch allocation to FEFO and exclude expired batches. This is a migration plus a change to the availability core.
- Fulfilment locations can be added as a nullable FK later, without changing this model.

## References

- Master §1.1, §4.4, §4.5, §6, §10, §13.10
- WEB_ADMIN §9–§11
- ADR-0006, ADR-0007, ADR-0011
