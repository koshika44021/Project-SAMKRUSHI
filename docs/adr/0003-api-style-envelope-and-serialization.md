# ADR-0003: API style, response envelope and serialization

- **Status:** Accepted
- **Date:** 2026-11-23
- **Deciders:** Founders (approved 2026-11-23)

## Context

- ADMIN_DASHBOARD §6 (v1.0 L446–548) specifies versioned `/api/v1` REST endpoints.
- ARCH §3.1 (L176) lets the mobile app read the catalog through Supabase public queries.
- The master §7 names trusted Edge Functions (`get-catalog`, `get-product-detail`, …) as the customer API.
- ADMIN_DASHBOARD §7 (L569) returns `availableQuantity: 20.0` as a JSON float, with uppercase values (`"KG"`, `"AVAILABLE"`).
- Master §5 and ARCH §4.1 require `NUMERIC` quantities, integer paise and lowercase snake_case values.
- Direct table queries cannot meet the requirement that apps "must not calculate aggregate availability" (ADMIN_DASHBOARD L555).
- The master's customer function list was incomplete. Quote, app config, search, profile, addresses, order list, cancellation eligibility, support and push tokens were missing.

## Decision

### Transport

1. **Customer API:** the master's named Supabase Edge Functions (`get-catalog`, `get-product-detail`, `get-serviceability`, `get-delivery-slots`, `get-app-config`, `get-checkout-quote`, `create-order`, `resume-payment`, `get-order-status`, `save-address`, `archive-address`, `get-delivery-otp`, `create-support-ticket`, `add-support-message`, `register-push-token`, `revoke-push-token`, `request-*`). Every availability-bearing endpoint is backed by the shared SQL availability function (ADR-0007).
2. **RLS-direct access** through the Supabase API is allowed only for the reads/writes listed in master §7: category list, own profile (column-level grants), own address list, own order-summary view, and own ticket view without internal notes.
3. **Admin:** reads use RLS-protected queries/views. Mutations go through `SECURITY DEFINER` RPCs (fixed `search_path`, role check inside, audit row in the same transaction) or Edge Functions, invoked from Next.js server actions/route handlers only. There is no public `/api/v1` REST layer. Next.js route handlers are internal to admin-web.
4. Search is `get-catalog` with a `q` parameter. Cancellation eligibility is a field of `get-order-status`.

### Envelope (shared Zod contract in `packages/shared`)

The ADMIN_DASHBOARD envelope is adopted as the shared contract.

```json
{
  "data": {},
  "meta": {
    "requestId": "…",
    "page": 1,
    "pageSize": 20,
    "totalCount": 0,
    "businessDate": "YYYY-MM-DD",
    "timezone": "Asia/Kolkata"
  }
}
```

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "…",
    "details": [{ "field": "primaryPhone", "message": "…" }],
    "requestId": "…"
  }
}
```

- `meta.requestId` is always present. The other meta fields appear when relevant.
- Error `code` is an UPPER_SNAKE API constant exported from `packages/shared`. Initial set: `VALIDATION_ERROR`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `VERSION_CONFLICT`, `QUOTE_CHANGED`, `NOT_SERVICEABLE`, `SLOT_UNAVAILABLE`, `INSUFFICIENT_AVAILABILITY`, `RATE_LIMITED`, `PAYMENT_PENDING`, `INTERNAL_ERROR`. Error codes are not stored enums.
- HTTP status codes: 200, 201, 204, 400, 401, 403, 404, 409, 422, 429, 500. Internal or database errors are never leaked.
- Pagination uses `page`/`pageSize` with an enforced maximum and stable sorting.
- `requestId` is propagated through the `x-request-id` header from client → Edge Function/server action → audit rows and logs.

### Serialization

| Kind                    | Wire format                                                                  | Rule                                                                                                                                              |
| ----------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Money                   | JSON integer paise (for example `12345`)                                     | Never floats or formatted strings. Validated ≤ `Number.MAX_SAFE_INTEGER`                                                                          |
| Quantity                | Decimal string (for example `"0.500"`, `"12.000"`)                           | Never JSON floats. Scale ≤ product precision. Negative only on signed admin ledger fields. Clients use a decimal library, not JS float arithmetic |
| Pack counts             | JSON integer                                                                 | min/max/step and `maxOrderable` are counts of packs                                                                                               |
| Business date           | `"YYYY-MM-DD"`                                                               | `Asia/Kolkata`, computed by the server                                                                                                            |
| Timestamp               | ISO 8601 UTC (`…Z`)                                                          | Displayed in `Asia/Kolkata`                                                                                                                       |
| Enums/controlled values | lowercase snake_case (for example `kg`, `available`, `pending_verification`) | Same as stored. Display labels mapped in UI. Uppercase display codes only at the presentation boundary                                            |
| Keys                    | camelCase                                                                    | Mapped from snake_case DB names                                                                                                                   |

### Customer availability exposure (dev default; founders may revise)

`get-catalog`/`get-product-detail` return a per-SKU `availabilityStatus` (`available`, `limited`, `unavailable`) and a server-computed `maxOrderable` pack count. They never return raw farmer-supply totals, per-supplier data or ATP components.

### Versioning and idempotency

- Contracts are versioned in `packages/shared`. Changes are additive only. A breaking change ships as a new function name (for example `get-catalog-v2`) while the old one is retired after the minimum supported app version passes it (`get-app-config`).
- Mutating customer calls that can be retried (`create-order`, `resume-payment`, `save-address`, `create-support-ticket`) accept an idempotency key.

## Consequences

- One trust boundary for customers. Availability logic is never duplicated in apps.
- Mobile and web share Zod schemas. `packages/shared` must stay runtime-neutral so Deno Edge Functions can import it (master §13.13).
- The ADMIN_DASHBOARD endpoint table becomes a capability checklist, not a route list.
- Exact quantities are hidden from customers by default. A founder decision could change that, at the cost of a contract revision.

## References

- Master §2.2, §5, §7, §13.13
- WEB_ADMIN §18; ANDROID §4.3–§4.20; IOS §5.3–§5.19
- ADMIN_DASHBOARD §6 (L446–548), §7 (L552–589) — superseded transport/format, envelope kept
- ARCH §3.1 (L176), §4.1, §15
- ADR-0006 (units), ADR-0007 (availability)
