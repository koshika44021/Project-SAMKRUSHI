# ADR-0006: Products, SKUs and units

- **Status:** Accepted
- **Date:** 2026-11-23
- **Deciders:** Founders (approved 2026-11-23)

## Context

- ARCH §7.3 (v1.0 L708–730) makes each `products` row one sellable SKU/pack.
- ADMIN_DASHBOARD §4.1/§5.4 (L384–398) treats a product as a base-unit item (for example, a vegetable in kg) with supply and availability recorded per product.
- Master §5–§6 and WEB_ADMIN §7 list products and SKUs as separate domains.
- ANDROID §4.6 and IOS §5.6 show several pack SKUs under one product.
- If each pack were its own product, one farmer's supply would have to be split across packs arbitrarily, and the same produce would appear in several availability pools.
- ADMIN_DASHBOARD L156–157 and L252–254 require unit normalization (500 g = 0.5 kg) and forbid summing unlike units.

## Decision

1. **`products`** is the inventory/availability item. Fields: `id`, `product_code` (unique, stable), `category_id`, `name`, `local_name`, `slug`, `description`, `base_unit`, `quantity_precision` (scale 0–3), `low_supply_threshold` (nullable, base unit), `is_active`, `is_listable`, `display_order`, timestamps.
   - The base unit is a lowercase controlled code (`kg`, `g`, `piece`, `bunch`, …).
   - The base unit is fixed once supply, batches or SKUs reference the product. Changing it requires a migration and a review.
2. **`product_skus`** is the sellable fixed pack. Fields: `id`, `product_id`, `sku_code` (unique, stable, never reused), display label, `pack_quantity` (`NUMERIC`, `> 0`, in the product base unit), `sale_unit` (`pack`, `piece`, `bunch`, …), `price_paise` (`BIGINT >= 0`), `min_order_packs`, `max_order_packs` (nullable), `order_step_packs`, `is_active`, `display_order`, `tax_code` (nullable, set only after professional review), timestamps.
3. **Units:**
   - Dated supply, receipts, batches, movements and reservations are stored in the product base unit.
   - An order line of _n_ packs reserves `n × pack_quantity` base units.
   - Alternative entry units are converted exactly on the server (decimal arithmetic).
   - Quantities of different products, or of different units, are never summed. Dashboards show per-product totals with their unit, or counts.
4. **Per-SKU availability** is derived from the product pool: `maxOrderable = min(floor(ATP / pack_quantity), max_order_packs)`, also respecting the step. All SKUs of a product draw from one pool (ADR-0007).
5. **Price history:** a `sku_price_history` row (SKU, `price_paise`, effective from, changed by, reason) is written for every price change. Order items snapshot SKU code, product name, pack quantity, base unit, sale unit, unit price and tax classification.
6. **Catalog writes** are super_admin-only in the MVP (ADR-0005). The launch catalog (categories, products, base units, precision, SKUs, pack sizes, prices, thresholds, images, claims) is a founder decision. Development uses clearly synthetic seed rows in dev-only seed files.

## Consequences

- Farmer supply maps naturally onto one product. Customers choose among packs without fragmenting availability.
- Checkout and packing convert packs to base units on the server. Tests cover conversion, precision and the rule against summing unlike units.
- Variable-weight selling (deferred) can later attach to `product_skus` without changing supply or inventory tables.

## References

- Master §1.1, §5, §6
- WEB_ADMIN §7
- ANDROID §4.6; IOS §5.6
- ADMIN_DASHBOARD §3.6 (L252–254), §4.1, §5.4 (L384–398) — status block
- ARCH §7.3 (L708–730), §7.6 (L918) — status block
- ADR-0003 (serialization), ADR-0007 (availability)
