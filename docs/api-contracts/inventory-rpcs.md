# Procurement, receiving and inventory RPCs (Phase 4)

Design: [ADR-0012](../adr/0012-procurement-and-inventory.md) and [ADR-0007](../adr/0007-availability-and-atp.md).

These RPCs follow the same conventions as the [Phase 3 admin RPCs](admin-rpcs.md):

- `SECURITY DEFINER` functions called by `apps/admin-web` server actions with the staff JWT;
- authorization and audit context set by `private.begin_admin_action`;
- PT403/PT404/PT409/PT422 errors.

Quantities are in the product **base unit** and cross the API as decimal strings. They may have at most 3 decimals, and never more than the product's `quantity_precision`. Money is integer paise.

**Who can do what:**

| Area                                                                            | Write                             | Read                                                             |
| ------------------------------------------------------------------------------- | --------------------------------- | ---------------------------------------------------------------- |
| Procurement, receiving, inventory, exceptions                                   | `super_admin`, `operations_admin` | `super_admin`, `operations_admin`, `finance_admin` (incl. costs) |
| Everyone else (`viewer`, `dispatch_admin`, `support_agent`, `rider`, customers) | None (PT403 / no rows)            | None                                                             |

## Purchase orders

A purchase order **never** changes stock or availability.

| RPC                                                                                    | Purpose                                                                                                                                                                                                                   |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `admin_create_purchase_order(supplier_id, expected_date, lines, notes?, request_id?)`  | Creates a draft (`SAM-PO-######`, dev default format). `lines` is described below                                                                                                                                         |
| `admin_create_po_from_supply(supplier_id, business_date, expected_date?, request_id?)` | Prefills a draft from the farmer's active supply for the date that is not yet on a PO. Authorizes **before** reading supply. PT422 if nothing is left to order                                                            |
| `admin_update_purchase_order(po_id, expected_version, expected_date, lines, notes?)`   | Replaces the lines. **Draft only**                                                                                                                                                                                        |
| `admin_set_purchase_order_status(po_id, expected_version, action, reason?)`            | `action` is `send`, `cancel` or `close`. **send:** draft → sent. **cancel:** draft or sent, nothing received, no open receipts; reason required. **close:** partially received → received (closed short); reason required |

**`lines` JSON:** `[{ productId, quantity, unitCostPaise?, supplyConfirmationId?, notes? }]`

- A supply record can be linked to only one PO that is not cancelled (PT409).
- The linked supply must be active and belong to the same farmer and product (PT422).
- `unitCostPaise` is the agreed cost per base unit. It is optional, because there are no standard rates.

## Goods receipts

| RPC                                                                                                 | Purpose                                                                                                        |
| --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `admin_create_goods_receipt(po_id, lines, received_at?, notes?, over_receipt_reason?, request_id?)` | Draft receipt (`SAM-GRN-######`). The PO must be sent or partially received. `lines` is described below        |
| `admin_post_goods_receipt(receipt_id, expected_version)`                                            | Posts a draft in one transaction. Returns `{ batches, reservationsMoved }`. The posting steps are listed below |
| `admin_cancel_goods_receipt(receipt_id, expected_version, reason)`                                  | Draft only                                                                                                     |

**`lines` JSON:** `[{ poLineId, received, accepted, rejected?, damaged?, qualityGrade?, qualityNotes?, lotCode?, harvestDate?, evidenceKey? }]`

- `received` must equal `accepted + rejected + damaged`.
- No quality rule is enforced (founder decision).
- `evidenceKey` must be under `receipts/` in the private `supply-evidence` bucket.
- Receiving beyond the ordered remainder needs `over_receipt_reason`. Without it, the RPC raises PT409 with message `over_receipt`.

**What posting does:**

1. Creates one batch (`SAM-B-######`) per line with an accepted quantity, plus one `receipt` movement for the accepted quantity only.
2. Reduces the linked supply's open quantity by the **received** quantity. Rejected and damaged quantities never become stock.
3. Re-points pool reservations for that product and business date onto the batch, oldest first, splitting a reservation when needed.
4. Raises a `supply_shortfall` exception if pool reservations still exceed the remaining open supply.
5. Raises an `over_receipt` exception for an accepted over-receipt.
6. Sets the PO status.

## Inventory

| RPC                                                                  | Purpose                                                                                                                                                                                                     |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `admin_adjust_stock(batch_id, movement_type, quantity, reason)`      | Appends a movement. **Increases:** `adjustment_increase`, `return_to_stock`. **Decreases:** `wastage`, `damage`, `sample`, `adjustment_decrease`. `receipt` and `sale` are refused (PT422). Rules are below |
| `admin_set_batch_status(batch_id, expected_version, status, reason)` | Active ↔ on hold. Holding returns the batch's active reservations to the supply pool and raises a `reservations_returned_to_pool` exception                                                                 |
| `admin_create_recall(reason, batch_ids[])`                           | Permanent (`SAM-RC-######`). Each batch becomes `recalled`, its reservations return to the pool, and the recall is kept for traceability                                                                    |
| `admin_resolve_exception(exception_id, note)`                        | open → resolved, once                                                                                                                                                                                       |

**Stock adjustment rules:**

- A decrease can never exceed on-hand minus active reservations on the batch (PT409), so ATP never goes negative.
- A batch that reaches 0 becomes `depleted`; returned stock makes it `active` again.
- Recalled batches cannot be adjusted.

## Reads

All reads return one JSON document (a single round trip), with quantities as decimal strings.

| RPC                                                                  | Returns                                                                                                                  |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `admin_list_purchase_orders(status?, supplier_id?, page, page_size)` | `{ items, pagination }`                                                                                                  |
| `admin_get_purchase_order(po_id)`                                    | The PO with lines (ordered, received, accepted, rejected, damaged, remaining, agreed cost, supply link) and its receipts |
| `admin_list_goods_receipts(status?, page, page_size)`                | `{ items, pagination }`                                                                                                  |
| `admin_get_goods_receipt(receipt_id)`                                | Lines with quality fields, `hasEvidence` (never the key) and the resulting batch                                         |
| `admin_inventory_summary()`                                          | Per product, in the base unit. Fields are listed below                                                                   |
| `admin_list_batches(product_id?, status?, page, page_size)`          | FIFO order (`received_at`). Each batch has on hand, reserved and available                                               |
| `admin_get_batch(batch_id)`                                          | The batch, its movement ledger and its recalls                                                                           |
| `admin_list_exceptions(status = open, page, page_size)`              | Exceptions with details                                                                                                  |
| `admin_supply_awaiting_po(business_date)`                            | Farmers with active supply not yet on a PO                                                                               |
| `dashboard_procurement_widgets()`                                    | `{ inventoryWidgets: false }` for other roles. Otherwise the counts listed below                                         |

**`admin_inventory_summary()` fields:**

- `onHandActive`, `onHold`, `recalled`;
- `reservedOnBatches`;
- `rejectedTotal`, `damagedTotal`;
- `atpToday`.

**`dashboard_procurement_widgets()` counts:**

- POs awaiting receipt;
- draft receipts;
- held batches;
- recalled batches;
- open exceptions.

Receipt evidence is not exposed by any RPC. The admin server route `GET /receiving/evidence/{receiptLineId}` checks the caller (`super_admin` or `operations_admin`), reads the key with the service role and redirects to a 60-second signed URL.

## Availability

`private.product_availability_core` now computes:

```
ATP = max(0, eligible on-hand of ACTIVE batches + Σ max(0, confirmed − received) per supply record − active reservations)
```

- Reservations include those on active batches plus pool reservations for the date.
- The signature is unchanged, so `get-catalog`, `get-product-detail` and the dashboard pick this up automatically.
- With no sell-by policy, on-hand counts for any current or future business date.
- When ATP is 0, the product is unavailable and the customer catalog does not list it (founder decision).
