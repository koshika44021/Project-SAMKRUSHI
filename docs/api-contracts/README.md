# API contracts

Contracts are defined **once**, as Zod schemas in `packages/shared`, and imported by the Edge Functions, `apps/admin-web` and `apps/mobile` (ADR-0003). This folder documents them for humans; the Zod schemas are authoritative.

## Conventions (all endpoints)

| Rule        | Detail                                                                                                                                                                                            |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Transport   | Customer operations are named Supabase Edge Functions (master §7). Admin mutations use SECURITY DEFINER RPCs or Edge Functions called from Next.js server code                                    |
| JSON casing | camelCase in JSON; snake_case in the database                                                                                                                                                     |
| Money       | Integer paise (`number`, safe integer). Never floats                                                                                                                                              |
| Quantities  | Decimal **strings** with ≤ 3 fractional digits (`"2.5"`), always paired with an explicit unit                                                                                                     |
| Dates       | Business dates `YYYY-MM-DD` (Asia/Kolkata); timestamps ISO-8601 UTC                                                                                                                               |
| Success     | `{ "data": …, "meta": { "requestId": "…", "pagination"?: { page, pageSize, totalItems, totalPages } } }`                                                                                          |
| Error       | `{ "error": { "code": "VALIDATION_ERROR", "message": "…", "details"?: [{ "field", "message" }], "requestId": "…" } }`                                                                             |
| Error codes | `VALIDATION_ERROR` 400 · `UNAUTHENTICATED` 401 · `FORBIDDEN` 403 · `NOT_FOUND` 404 · `CONFLICT` 409 · `UNPROCESSABLE` 422 · `RATE_LIMITED` 429 · `INTERNAL_ERROR` 500 · `SERVICE_UNAVAILABLE` 503 |
| Pagination  | `page` (≥ 1, default 1), `pageSize` (1–100, default 25); stable server-side sort                                                                                                                  |
| Request ID  | A valid incoming `x-request-id` is propagated; otherwise the server generates one and returns it in `meta.requestId` and the `X-Request-Id` header                                                |

Source: `packages/shared/src/api.ts`, `money.ts`, `quantity.ts`, `time.ts`.

## Endpoints

| Endpoint                                                       | Phase | Contract file                                         |
| -------------------------------------------------------------- | ----- | ----------------------------------------------------- |
| `GET /api/health` (admin-web liveness)                         | 1     | this README — `data: { status: "ok", service, time }` |
| `get-catalog`, `get-product-detail`, `health` (Edge Functions) | 3     | [customer-catalog.md](customer-catalog.md)            |
| Admin RPCs (farmers, supply, staff, reads)                     | 3     | [admin-rpcs.md](admin-rpcs.md)                        |
| Remaining customer operations (master §7 table)                | 5–8   | added per phase                                       |
