# Runbook: procurement, receiving and inventory

This runbook covers the day-to-day operations procedures for Phase 4. The design is in [ADR-0012](../adr/0012-procurement-and-inventory.md) and the RPC contracts are in [inventory-rpcs.md](../api-contracts/inventory-rpcs.md).

## Daily flow (operations admin)

1. **Order:**
   1. Go to **Procurement**.
   2. Choose the business date. The page lists "Farmer-confirmed supply awaiting a purchase order".
   3. Click **Create PO from supply**. This creates a draft PO with one line per supply record.
   4. Check it and click **Mark as sent**.

   A PO does not change stock or availability. Availability still comes from the farmer-confirmed supply.

2. **Receive:**
   1. On the PO, click **Receive goods**.
   2. For each line that arrived, enter received = accepted + rejected + damaged (base unit).
   3. Optionally add a quality grade, notes, lot code, harvest date (not an expiry) and an evidence photo.
   4. Click **Save draft receipt**.

   If more arrived than was ordered, the form asks for an over-receipt reason.

3. **Post:** on the receipt, click **Post receipt**. Posting:
   - creates one batch per accepted quantity;
   - converts the farmer supply into stock exactly once;
   - moves waiting reservations onto the batch.

   Posting cannot be undone. Later corrections are stock movements.

4. **Close short:** if a farmer delivers less and nothing more is coming, use **Close short** on the PO and give a reason.

## Stock corrections

Go to **Inventory & Batches**, open the batch and click **Record movement**. The movement types are wastage, damage, sample, adjustment (increase or decrease) and return to stock. A reason is always required.

- The ledger is append-only: nothing is edited or deleted.
- Decreases cannot remove reserved stock.

## Hold, release, recall

- **Put on hold** (for example, a pending quality check):
  - Stock becomes unavailable at once.
  - Its reservations return to the supply pool, and an exception is raised.
  - Use **Release hold** when it is cleared.
- **Recall batch** is permanent. The batch leaves availability for good and the recall is kept for traceability. Finding the affected customer orders arrives with orders (Phase 6+).

## Exceptions

The **Exceptions** page lists:

| Exception                     | Raised when                                                     |
| ----------------------------- | --------------------------------------------------------------- |
| Supply shortfall              | Reservations waiting on farmer supply exceed what is still open |
| Reservations returned to pool | A hold or recall moved reservations back to the pool            |
| Over-receipt                  | An over-receipt was accepted with a reason                      |

Resolve each exception with a note once it is handled. When availability is 0, the product is not shown to customers (founder decision).

## Not configured yet (founder decisions)

There are no procurement or quality standards, no sell-by or expiry policy and no packing facility (decisions 18–20).

Document number formats (`SAM-PO-`, `SAM-GRN-`, `SAM-B-`, `SAM-RC-`) are development defaults. Confirm them before launch.

## Test data note

The automated tests use the product `SEED-VEG-02` (DEV Sample Vegetable B) **only** for inventory flows, and each run recalls its batch. Do not use that product in other tests that assert absolute availability. Posted stock counts for every business date.
