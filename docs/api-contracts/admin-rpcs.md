# Admin RPCs (Phase 3)

All admin mutations are `SECURITY DEFINER` PostgreSQL functions, called by `apps/admin-web` server actions with the signed-in staff member's JWT (`supabase.rpc(...)`). Clients have no table write privileges (ADR-0011). Each RPC:

1. authorizes through `private.begin_admin_action(allowed_roles, request_id, reason)`, which also sets the audit context, so every audit row carries actor, role, reason, request id and source;
2. enforces optimistic concurrency (`p_expected_version`) on edits;
3. raises errors that PostgREST maps to HTTP status codes.

| SQLSTATE | HTTP | Meaning                                                                                                                | Envelope code      |
| -------- | ---- | ---------------------------------------------------------------------------------------------------------------------- | ------------------ |
| `PT403`  | 403  | Caller lacks the role, or is inactive                                                                                  | `FORBIDDEN`        |
| `PT404`  | 404  | Record not found                                                                                                       | `NOT_FOUND`        |
| `PT409`  | 409  | `version_conflict`, `duplicate_phone` (details = JSON matches), `duplicate_active_supply`, last-super-admin protection | `CONFLICT`         |
| `PT422`  | 422  | Business validation; `details` = field name                                                                            | `VALIDATION_ERROR` |
| `23514`  | 400  | Database rule (e.g. supply for an inactive farmer, precision)                                                          | `VALIDATION_ERROR` |

The mapping lives in `apps/admin-web/src/lib/server/actions.ts`.

## Farmers (super_admin, operations_admin)

| RPC                                                                                                                                                                      | Purpose                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `admin_create_farmer(name, address…, primary_phone, secondary_phone?, land_area_value?, land_area_unit?, notes?, status = active, duplicate_phone_reason?, request_id?)` | Registers a farmer: `suppliers` + `farmer_profiles` + contacts, with a `SAM-FRM-######` code (dev default format). A duplicate phone raises `PT409 duplicate_phone` unless a reason is given |
| `admin_update_farmer(id, expected_version, …, reason, duplicate_phone_reason?)`                                                                                          | Edit with a required reason                                                                                                                                                                  |
| `admin_set_farmer_status(id, expected_version, status, reason)`                                                                                                          | Activate / suspend / deactivate. Activation stamps verification if unset                                                                                                                     |
| `admin_set_farmer_photo(id, storage_key?)`                                                                                                                               | Points at a private object under `farmers/{id}/`. Returns `previousKey` for deletion                                                                                                         |
| `admin_farmer_photo_key(id)`                                                                                                                                             | Key for server-side signed URLs (not for `viewer`)                                                                                                                                           |
| `admin_check_duplicate_phones(phones[], exclude?)`                                                                                                                       | Pre-submit warning                                                                                                                                                                           |

## Supply (super_admin, operations_admin)

| RPC                                                                                                                                                                   | Purpose                                                                                                                           |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `admin_create_supply(supplier_id, product_id, business_date, quantity, confirmation_source, entry_unit?, confirmed_by?, confirmed_at?, note?, evidence_storage_key?)` | Quantity is exact NUMERIC: send it as a decimal string. An alternative `entry_unit` is converted exactly to the product base unit |
| `admin_update_supply(id, expected_version, quantity, reason, note?)`                                                                                                  | Zero is allowed with a reason                                                                                                     |
| `admin_set_supply_status(id, expected_version, status, reason)`                                                                                                       | Reactivation is blocked while another active record exists                                                                        |

## Staff (super_admin)

| RPC                                                     | Purpose                                                           |
| ------------------------------------------------------- | ----------------------------------------------------------------- |
| `admin_register_staff(user_id, full_name, roles[])`     | After the server creates the Auth user (admin API)                |
| `admin_set_staff_roles(user_id, roles[], reason)`       | Never leaves zero active super_admins                             |
| `admin_set_staff_status(user_id, is_active, reason)`    | The server also bans/unbans in Auth. Self-deactivation is blocked |
| `admin_update_staff_name(user_id, full_name)`           |                                                                   |
| `admin_record_staff_auth_event(user_id, event, reason)` | Audits `password_reset`, `auth_banned` and `auth_unbanned`        |
| `admin_list_staff()`                                    | Includes Auth email                                               |
| `record_staff_login()`                                  | Called after sign-in                                              |
| `bootstrap_first_super_admin(user_id, full_name)`       | Service role only; refuses when a super_admin exists              |

## Reads

| RPC                                                                                                    | Roles                                                                               |
| ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| `my_access()`                                                                                          | Any signed-in user (own access)                                                     |
| `admin_list_farmers(search?, status?, district?, locality?, product_id?, sort, page, page_size)`       | Supplier readers. Phones are masked for `viewer`, which also cannot search by phone |
| `admin_get_farmer(id)`                                                                                 | Supplier readers                                                                    |
| `admin_list_supply(business_date?, supplier_id?, product_id?, category_id?, status?, page, page_size)` | Supply readers                                                                      |
| `dashboard_overview(business_date)`                                                                    | Dashboard staff (supply widgets for supply readers only)                            |
| `admin_product_availability(business_date)`                                                            | Supply readers                                                                      |
| `product_availability(date, zone?, ids?)`, `sku_availability(...)`                                     | Supply readers + service role                                                       |
| `staff_display_names(ids[])`                                                                           | Dashboard staff                                                                     |
| `supplier_contact_summaries(ids[])`                                                                    | Supplier readers (masked for `viewer`)                                              |

## Rate limiting

These two functions are service role only. Keys are hashed before storage.

| Function                                                 | Effect                         |
| -------------------------------------------------------- | ------------------------------ |
| `consume_rate_limit(bucket, key, limit, window_seconds)` | Records one hit                |
| `rate_limit_status(...)`                                 | Checks without recording a hit |

Staff login counts only failed attempts, using the setting `rate_limit.staff_login` (DEV placeholder; production value pending approval).
