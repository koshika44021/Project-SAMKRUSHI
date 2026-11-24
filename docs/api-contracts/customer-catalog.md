# Customer catalog API (Phase 3)

Supabase Edge Functions, public (guest browsing). Contracts: `packages/shared/src/catalog.ts` (Zod, authoritative). Envelope and error codes: [README](README.md).

Customers receive an **availability status** and a server-computed **`maxOrderable`** per pack. Raw farmer-confirmed or sellable quantities are never returned (ADR-0003; founder decision open, this is the dev default). Availability comes from the single shared SQL function (ADR-0007).

## `GET /functions/v1/get-catalog`

| Query                | Required | Notes                                                                                                      |
| -------------------- | -------- | ---------------------------------------------------------------------------------------------------------- |
| `businessDate`       | yes      | `YYYY-MM-DD` (Asia/Kolkata). Past dates return no products (expired supply never counts)                   |
| `zoneId`             | no       | UUID. At launch all zones share one pool (ADR-0007); zone validation arrives with serviceability (Phase 5) |
| `categoryCode`       | no       | Category code filter                                                                                       |
| `includeUnavailable` | no       | `true` also lists products whose every pack is unavailable (`maxOrderable` 0)                              |

Response `data`:

```json
{
  "businessDate": "2026-11-25",
  "products": [
    {
      "productId": "uuid",
      "productCode": "SEED-VEG-01",
      "slug": "dev-sample-vegetable-a",
      "name": "DEV Sample Vegetable A",
      "localName": null,
      "description": "…",
      "category": { "code": "seed-vegetables", "name": "DEV Vegetables" },
      "baseUnit": "kg",
      "availabilityStatus": "limited",
      "images": [{ "url": "https://…/product-images/…", "altText": "…", "isPrimary": true }],
      "skus": [
        {
          "skuId": "uuid",
          "skuCode": "SEED-VEG-01-500G",
          "label": "500 g (DEV)",
          "packQuantity": "0.5",
          "baseUnit": "kg",
          "saleUnit": "pack",
          "pricePaise": 1000,
          "minOrderPacks": 1,
          "orderStepPacks": 1,
          "maxOrderable": 7,
          "availabilityStatus": "limited"
        }
      ]
    }
  ]
}
```

All values above are synthetic examples.

**Status rules** (`public.sku_availability`):

- `unavailable`: `maxOrderable` = 0.
- `limited`: 0 < product sellable quantity ≤ the product's low-supply threshold.
- `available`: otherwise.

`maxOrderable` is the largest `n` that satisfies all of:

- `n ≤ floor(sellable ÷ packQuantity)`;
- `n ≤ max_order_packs` (when set) and `n ≥ min_order_packs`;
- `n` sits on the order step.

A product's status is the best status among its packs.

**Visibility:** only active and listable products, in active categories, with active packs.

## `GET /functions/v1/get-product-detail`

| Query                 | Required    | Notes    |
| --------------------- | ----------- | -------- |
| `businessDate`        | yes         | As above |
| `productId` or `slug` | exactly one |          |
| `zoneId`              | no          | As above |

Returns `{ businessDate, product }`, using the product shape above. Unavailable products are still returned, so shared links render. A product that isn't listable or doesn't exist returns `404 NOT_FOUND`.

## `GET /functions/v1/health`

`{ status: "ok", service: "edge-functions", time }` after a DB reachability check. It returns no dependency or version data.

## Errors

| Case                                       | HTTP | Code                                              |
| ------------------------------------------ | ---- | ------------------------------------------------- |
| Missing/invalid `businessDate`, bad params | 400  | `VALIDATION_ERROR` (with `details[]` per field)   |
| Unknown or hidden product                  | 404  | `NOT_FOUND`                                       |
| Database/runtime failure                   | 500  | `INTERNAL_ERROR` (logged with request id, no PII) |

Send an `x-request-id` header to correlate. It is echoed in `meta.requestId`, the `X-Request-Id` header and the logs.

## CORS

Native apps need no CORS. Browser origins are allow-listed via the function secret `ALLOWED_ORIGINS`. **Note:** the local Supabase gateway adds `Access-Control-Allow-Origin: *` to every function response. The APIs use no cookies, so no credentials are exposed. Verify the gateway behaviour on the hosted project before production.
