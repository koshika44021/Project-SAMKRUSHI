# SAMKRUSHI --- Farmer & Product Availability Admin Dashboard

## Implementation Specification \| MVP v1.0

**Purpose:** Build the first Samkrushi web dashboard. Authorized
Samkrushi staff use it to register farmers, record products and
quantities each farmer can supply, and control which pre-configured
products appear in the customer application.

**Core principle:** The customer app has a predefined product catalog.
Staff do not create products while registering farmer supply. A catalog
product is customer-visible only when at least one active farmer has
positive, valid supply for the selected business date.

**Operating context:** Initial launch in a focused Hyderabad delivery
area. Farmers communicate availability to Samkrushi staff. Staff enter
it in this dashboard. The customer app and dashboard share one backend
and database.

------------------------------------------------------------------------

# 1. Scope and release boundary

## 1.1 MVP deliverables

1.  Secure staff login/logout.
2.  Overview dashboard with useful operational insights.
3.  Farmer registration, list, search, details, edit and deactivation.
4.  Predefined product catalog seeded in the database.
5.  Add a catalog product to a farmer with farmer-confirmed quantity.
6.  Update or deactivate a farmer-product supply record.
7.  Aggregate supply across active farmers by product and business date.
8.  Customer-facing API that returns only products with positive
    sellable availability.
9.  Audit history for important changes.
10. A backend/API contract that allows the customer application to be
    built in parallel.

## 1.2 Out of scope

Do not implement in this MVP unless separately approved: customer
ordering UI, payments/refunds, pack customization, delivery/rider
management, farmer self-service login, farmer payments, procurement
routing, warehouse receiving, full batch/lot traceability, multi-city
operations, or customer loyalty features.

Keep the architecture extensible for these later capabilities.

## 1.3 Critical terminology

This MVP records **farmer-confirmed supply**, not necessarily physically
received warehouse stock.

-   **Farmer-confirmed quantity:** Quantity the farmer says they can
    supply for a specified procurement/delivery business date.
-   **Committed/allocated quantity:** Quantity already committed to
    accepted customer orders (future order integration).
-   **Sellable quantity:** Quantity still available to offer to
    customers.
-   **Received quantity:** Physical quantity collected and accepted by
    Samkrushi (future receiving/inventory capability).

MVP formula, before customer orders are integrated:

`Sellable quantity = SUM(active, valid farmer-confirmed quantities for product and business date)`

After order integration:

`Sellable quantity = confirmed supply - active reservations - confirmed allocations`

Never allow sellable quantity to become negative. The backend is the
source of truth.

**Availability must have a date.** A farmer's quantity must not remain
available indefinitely. Expired records are excluded. Use `Asia/Kolkata`
for business dates and store timestamps in UTC.

------------------------------------------------------------------------

# 2. Users, roles and security

Farmers do not log in. The dashboard is for authorized Samkrushi staff.

  -----------------------------------------------------------------------
  Role                                Permissions
  ----------------------------------- -----------------------------------
  `ADMIN`                             All dashboard access; manage staff
                                      users; view audit history

  `OPERATIONS`                        View dashboard;
                                      create/edit/deactivate farmers;
                                      manage farmer supply

  `VIEWER`                            Read-only dashboard, farmer and
                                      supply access
  -----------------------------------------------------------------------

No public staff registration. The first ADMIN is created using a secure
deployment/bootstrap process.

Authentication requirements: - Login using staff email/username and
password. - Hash passwords using Argon2id or bcrypt with a suitable work
factor. - Prefer secure HTTP-only, SameSite cookies for browser
sessions. - HTTPS in staging and production. - Logout must invalidate
the session. - Server-side role authorization on every protected
endpoint. - Rate-limit repeated login failures. - Do not store
passwords, tokens or secrets in source control or logs. - Inactive staff
cannot log in. - Admin-assisted password reset is sufficient for MVP.

  Action                              ADMIN   OPERATIONS   VIEWER
  --------------------------------- ------- ------------ --------
  View dashboard/farmers/supplies       Yes          Yes      Yes
  Register/edit farmer                  Yes          Yes       No
  Activate/deactivate farmer            Yes          Yes       No
  Add/update/deactivate supply          Yes          Yes       No
  Manage staff accounts                 Yes           No       No
  View audit history                    Yes     Optional       No

Hiding a button in the frontend is not authorization. Enforce
permissions in the backend.

------------------------------------------------------------------------

# 3. Navigation and screens

Primary navigation: 1. Overview 2. Farmers 3. Products & Availability 4.
Staff / Users (ADMIN only) 5. Audit History (ADMIN only)

Every screen must have loading, empty, error and success states. Show
the current staff name/role and provide logout. Make the dashboard
responsive for desktop, tablet and mobile browsers.

## 3.1 Login

Fields: email/username, password. Validate required fields. Use a
generic invalid-credentials message. Redirect authenticated staff to
Overview. Protect all dashboard routes and APIs. Prevent duplicate
submissions.

Acceptance: valid active staff can log in; invalid/inactive users
cannot; logout invalidates the session; unauthenticated API calls are
rejected.

## 3.2 Overview dashboard

The dashboard should answer: How many farmers are registered? What
products can be offered for the selected date? Which products are
unavailable or low on supply?

KPI cards: - Active farmers. - Inactive farmers. - Total catalog
products. - Products currently available. - Products currently
unavailable. - Active farmer-product supply records for selected date. -
Supply records updated for the current business date. - Expired or
unconfirmed supply records.

Do not add kilograms, pieces and bunches into one misleading total. Show
quantity totals separately by unit or show counts.

Widgets/tables: **Product availability:** product, category, aggregate
sellable quantity, unit, number of supplying farmers, status, last
updated. **Recent updates:** farmer, product, quantity, unit, business
date, updated by, updated time. **Farmers:** recently registered and
active/inactive counts. **Alerts:** zero supply, low supply, expired
supply, farmers with no active supply records.

Filters: business date, category, product, availability status. All
widgets must use consistent backend calculations.

## 3.3 Farmers list

Paginated/searchable table with: - Farmer ID. - Farmer name. -
Village/locality, mandal and district. - Primary phone. - Count of
active supplied products. - Status. - Registration date. - Actions:
view, edit, deactivate/reactivate.

Search by farmer ID, name, phone and locality. Filter by status,
district/mandal and whether active supply exists. Do not hard-delete a
farmer with business history; deactivate them instead.

## 3.4 Farmer registration

Fields required under the current business requirement:

  Field               Requirement and validation
  ------------------- -------------------------------------------------
  Farmer name         Required, 2--120 characters
  Address             Required
  Village/locality    Required
  Mandal              Required
  District            Required
  State               Required; default Telangana
  PIN code            Required, six-digit Indian PIN
  Land area           Required positive decimal
  Land area unit      Required; acres or hectares
  Farmer photo        Required; JPG/PNG/WebP, size limit
  Primary contact     Required; validate Indian phone number
  Secondary contact   Required as currently requested; validate phone
  Notes               Optional
  Status              System-managed; active on creation

Implementation rules: - Store address, village, mandal, district, state
and PIN separately; do not rely only on one free-text location. - Store
land area value and unit separately. - Normalize phone numbers
(e.g. +91XXXXXXXXXX). - Warn about duplicate phone numbers; allow
authorized resolution for legitimate shared contacts. - Store photos in
object storage, not as large database blobs. Save a storage
key/reference in the database. - Validate image type and size on the
server. - Do not collect Aadhaar or bank details in this MVP unless a
defined lawful need and secure handling process exist.

Creation flow: 1. Staff selects Add Farmer. 2. Enters required details
and uploads photo. 3. Frontend provides immediate validation. 4. Backend
validates again. 5. Backend generates UUID and human-readable Farmer ID.
6. Save active farmer, creator and timestamps. 7. Record audit event. 8.
Redirect to profile and show success/Farmer ID.

Use UUID as immutable primary key plus a unique display code such as
`SAM-FRM-000001`. Never use the display code as the only database key.

## 3.5 Farmer profile

Show farmer ID, photo, name, full location, land area/unit, contacts,
registration date, status, created/updated by and timestamps.

Show a supplied-products table: - Product. - Category. - Confirmed
quantity. - Unit. - Business date. - Status. - Last updated.

Actions: edit farmer, add product supply, edit quantity, deactivate
supply, deactivate/reactivate farmer. Deactivating a farmer excludes all
their supplies from customer availability but preserves historical
records.

## 3.6 Add product supply

Staff opens a farmer profile and chooses Add Product.

Fields: - Product: required dropdown/autocomplete populated from active,
preconfigured catalog. - Confirmed quantity: required positive number. -
Unit: inherited from catalog product and clearly displayed. -
Availability business date: required, default to next procurement
cycle. - Note: optional. - Status: active on creation.

Backend validates: - Farmer is active. - Product is active. - Quantity
is valid for the product's unit/precision. - Unit matches the product
base unit. - No duplicate active record exists for farmer + product +
business date.

If a matching record exists, show it and offer update rather than
silently creating a duplicate. Save audit event and recalculate
availability.

Allow decimal quantities only when product configuration supports them.
Normalize units before aggregation (e.g. 500 g = 0.5 kg). Never silently
mix units.

## 3.7 Update quantity

Allow authorized staff to update quantity and business date. Capture old
value, new value, reason, actor and timestamp. Require a reason for
material changes; preferably capture it for every change.

If quantity becomes zero, that farmer's supply contributes zero.
Recalculate product availability immediately. If no other active farmer
supplies it, it becomes unavailable to customers. Preserve the old value
in audit history.

Use optimistic concurrency/version checks so two staff members cannot
silently overwrite each other's changes.

## 3.8 Deactivate farmer or supply

Use soft deactivation, not hard deletion. Require confirmation and
reason.

-   Deactivating a farmer excludes all their supplies from availability.
-   Deactivating one farmer-product supply excludes only that record.
-   Other active farmers' supply continues to count.
-   Historical records and audit logs remain available.

------------------------------------------------------------------------

# 4. Preconfigured catalog and availability logic

## 4.1 Product catalog

The initial list of products is inserted into the database before
launch. Farmer supply forms select from this catalog; staff cannot enter
arbitrary product names.

Product fields: - UUID product ID. - Unique SKU/internal code. - Product
name and optional local display name. - Category. - Description. - Image
storage key. - Base unit: kg, g, piece, bunch, etc. - Quantity
precision. - Optional low-stock threshold. - Active/inactive status. -
Display order. - Created/updated timestamps.

Catalog changes should initially happen through repeatable
seed/migration scripts or a restricted ADMIN-only catalog screen. Do not
let ordinary operations staff create products through farmer supply
forms.

## 4.2 Visibility rule

A product may appear as available to customers only when: 1. Catalog
product is active. 2. At least one active farmer has valid supply for
the requested business date. 3. Aggregate sellable quantity is greater
than zero. 4. Supply has not expired. 5. Product has not been manually
disabled for quality/operational reasons.

MVP:

`aggregate_sellable_quantity(product, date) = SUM(active farmer-confirmed quantities for that product and date)`

If quantity is zero, omit the product from the available-products
endpoint (or return an unavailable state only if the customer UI needs
it).

## 4.3 Future customer order integration

When ordering is introduced, reserve quantity transactionally:

`available_to_order = confirmed_supply - active_reservations - confirmed_allocations`

Future requirements: - Database transaction for reservation. - Prevent
simultaneous customers from buying the same final quantity. - Expire
abandoned reservations. - Release reservations on failed
payment/cancellation according to policy. - Deduct/allocate exactly once
at the appropriate order state. - Idempotency for order/payment
callbacks. - Server, not browser, enforces availability. - Keep a
reservation/inventory movement ledger rather than silently overwriting
quantities.

Do not implement order processing in this dashboard MVP, but keep the
schema/API extensible.

## 4.4 Expiry

Every supply record applies to a defined business date/procurement
cycle. Use UTC timestamps and `Asia/Kolkata` business dates. Expired
records do not count. Show them as requiring reconfirmation. Never
silently carry yesterday's quantity into tomorrow.

------------------------------------------------------------------------

# 5. Database design

Use a relational database with migrations, foreign keys, constraints and
indexes.

## 5.1 `staff_users`

-   `id` UUID primary key
-   `full_name` varchar(120), required
-   `email` varchar(255), unique, required
-   `password_hash` text, required
-   `role` enum: ADMIN, OPERATIONS, VIEWER
-   `is_active` boolean default true
-   `last_login_at` timestamptz nullable
-   `created_at`, `updated_at` timestamptz

## 5.2 `farmers`

-   `id` UUID primary key
-   `farmer_code` varchar(30), unique
-   `farmer_name` varchar(120), required
-   `address_line` text, required
-   `village`, `mandal`, `district`, `state` varchar(120), required
-   `pin_code` char(6), required
-   `land_area_value` numeric(10,2), positive
-   `land_area_unit` enum: ACRE, HECTARE
-   `photo_storage_key` text, required
-   `primary_phone`, `secondary_phone` varchar(16), required
-   `notes` text nullable
-   `status` enum: ACTIVE, INACTIVE
-   `created_by`, `updated_by` UUID foreign keys to staff_users
-   `created_at`, `updated_at` timestamptz

## 5.3 `product_categories`

-   `id` UUID primary key
-   `name` varchar(100), unique
-   `display_order` integer
-   `is_active` boolean

## 5.4 `products`

-   `id` UUID primary key
-   `sku` varchar(50), unique
-   `name` varchar(120), required
-   `local_name` varchar(120), nullable
-   `category_id` UUID foreign key
-   `description` text nullable
-   `image_storage_key` text nullable
-   `base_unit` enum/configured unit: KG, G, PIECE, BUNCH, etc.
-   `quantity_precision` smallint
-   `low_stock_threshold` numeric(12,3), nullable
-   `is_active` boolean default true
-   `display_order` integer
-   `created_at`, `updated_at` timestamptz

## 5.5 `farmer_product_supplies`

One farmer's confirmed quantity of one product for one business date.

-   `id` UUID primary key
-   `farmer_id` UUID foreign key
-   `product_id` UUID foreign key
-   `business_date` date
-   `confirmed_quantity` numeric(12,3), non-negative
-   `unit` configured unit; must match product base unit
-   `status` enum: ACTIVE, INACTIVE, EXPIRED
-   `notes` text nullable
-   `created_by`, `updated_by` UUID foreign keys to staff_users
-   `created_at`, `updated_at` timestamptz
-   `version` integer for optimistic concurrency

Enforce one active record per farmer + product + business date, using a
suitable unique constraint/partial unique index. Update the current
record and preserve change history in audit logs.

## 5.6 `audit_logs`

-   `id` UUID primary key
-   `actor_user_id` UUID nullable
-   `action` varchar(80), e.g. FARMER_CREATED
-   `entity_type` varchar(80)
-   `entity_id` UUID
-   `before_data`, `after_data` JSON/JSONB nullable
-   `reason` text nullable
-   `ip_address` text/inet nullable
-   `created_at` timestamptz

Audit logs are append-only for dashboard users. Never log passwords,
session tokens or unnecessary personal data.

## 5.7 Future tables

Keep design ready for `orders`, `order_items`, `inventory_reservations`,
`inventory_movements`, `procurement_orders`, `procurement_items`,
`supplier_payments`, `delivery_assignments` and `product_batches`. Do
not build them all in this MVP.

------------------------------------------------------------------------

# 6. Backend API contract

Use versioned endpoints under `/api/v1`. Protected endpoints require
authentication and role checks.

## Authentication

  Method   Endpoint                Purpose
  -------- ----------------------- ------------------------
  POST     `/api/v1/auth/login`    Staff login
  POST     `/api/v1/auth/logout`   Invalidate session
  GET      `/api/v1/auth/me`       Current staff and role

## Dashboard

  ------------------------------------------------------------------------------------------------------------------
  Method                  Endpoint                                                           Purpose
  ----------------------- ------------------------------------------------------------------ -----------------------
  GET                     `/api/v1/dashboard/summary?businessDate=YYYY-MM-DD`                KPI summary

  GET                     `/api/v1/dashboard/product-availability?businessDate=YYYY-MM-DD`   Availability table

  GET                     `/api/v1/dashboard/recent-supply-updates`                          Recent changes

  GET                     `/api/v1/dashboard/alerts?businessDate=YYYY-MM-DD`                 Low/zero/expired alerts
  ------------------------------------------------------------------------------------------------------------------

## Farmers

  Method   Endpoint                                Purpose
  -------- --------------------------------------- ---------------------------
  POST     `/api/v1/farmers`                       Register farmer
  GET      `/api/v1/farmers`                       Paginated/searchable list
  GET      `/api/v1/farmers/{farmerId}`            Farmer details
  PATCH    `/api/v1/farmers/{farmerId}`            Edit farmer
  PATCH    `/api/v1/farmers/{farmerId}/status`     Activate/deactivate
  GET      `/api/v1/farmers/{farmerId}/supplies`   Farmer supply list
  POST     `/api/v1/farmers/{farmerId}/supplies`   Add supply

## Supplies

  Method   Endpoint                               Purpose
  -------- -------------------------------------- ---------------------------
  GET      `/api/v1/supplies`                     Search/filter supplies
  GET      `/api/v1/supplies/{supplyId}`          Supply details
  PATCH    `/api/v1/supplies/{supplyId}`          Update quantity/date/note
  PATCH    `/api/v1/supplies/{supplyId}/status`   Activate/deactivate

## Products

  ---------------------------------------------------------------------------------------------------------------
  Method                  Endpoint                                                        Purpose
  ----------------------- --------------------------------------------------------------- -----------------------
  GET                     `/api/v1/products`                                              Dashboard catalog list

  GET                     `/api/v1/products/{productId}`                                  Product detail

  GET                     `/api/v1/customer/products/available?businessDate=YYYY-MM-DD`   Customer app available
                                                                                          products
  ---------------------------------------------------------------------------------------------------------------

Catalog write APIs, if implemented, are ADMIN-only. Otherwise use seed
scripts.

## Staff (ADMIN only)

  -----------------------------------------------------------------------------------------------
  Method                  Endpoint                                        Purpose
  ----------------------- ----------------------------------------------- -----------------------
  POST                    `/api/v1/staff-users`                           Create staff account

  GET                     `/api/v1/staff-users`                           List staff

  PATCH                   `/api/v1/staff-users/{userId}`                  Update role/name/status

  POST                    `/api/v1/staff-users/{userId}/reset-password`   Admin-assisted reset
  -----------------------------------------------------------------------------------------------

Response convention:

Success:

``` json
{
  "data": {},
  "meta": {"requestId": "server-generated-id"}
}
```

Error:

``` json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Please correct the highlighted fields.",
    "details": [{"field": "primaryPhone", "message": "Enter a valid Indian phone number."}],
    "requestId": "server-generated-id"
  }
}
```

Use appropriate HTTP codes: 200, 201, 204, 400, 401, 403, 404, 409, 422,
429 and 500. Paginate list APIs with `page` and `pageSize`, enforce a
maximum page size and use stable sorting.

------------------------------------------------------------------------

# 7. Customer application integration

The customer app and dashboard share the same backend/catalog. The app
must not read farmer records or calculate aggregate availability itself.

Illustrative available-products response:

``` json
{
  "data": [
    {
      "productId": "uuid",
      "sku": "VEG-TOM-001",
      "name": "Tomato",
      "category": "Vegetables",
      "imageUrl": "https://...",
      "unit": "KG",
      "availableQuantity": 20.0,
      "availabilityStatus": "AVAILABLE"
    }
  ],
  "meta": {
    "businessDate": "2026-11-05",
    "timezone": "Asia/Kolkata"
  }
}
```

Rules: - Positive valid quantity: product can appear as available. -
Zero quantity: do not show as available. - Inactive catalog product:
never show as available. - No valid supply for date: unavailable. -
Expired supply: excluded. - Inactive farmers: their quantities
excluded. - Never expose farmer phone numbers, photos, private addresses
or individual supply records to customers.

Availability changes frequently. Use no cache or a very short cache;
invalidate/recompute after supply updates. Include `lastUpdatedAt`.
Future checkout must revalidate stock on the server.

------------------------------------------------------------------------

# 8. Image and file storage

Use object storage or a secure equivalent.

-   Farmer photos private by default.
-   Product images public/read-only only if intended for customer
    display.
-   Validate actual content type, not only filename extension.
-   Generate random storage keys; do not trust uploaded filenames.
-   Restrict uploads to authorized users.
-   Use signed URLs for private farmer photos.
-   Avoid orphaned images when replacing a photo.
-   Never expose storage credentials in frontend code.

Suggested initial limits: 5 MB per image; JPEG, PNG and WebP.
Resize/compress where practical.

------------------------------------------------------------------------

# 9. UI/UX requirements

Visual direction: - Clean professional agricultural technology
dashboard. - White/light neutral background. - Restrained Samkrushi
green accent. - Accessible contrast and readable typography. -
Consistent spacing and components. - Responsive desktop/tablet/mobile
web. - Avoid decorative charts that do not help operations.

Usability: - Search and pagination. - Clear empty states and primary
actions. - Confirmation dialogs for deactivation. - Inline validation. -
Success/error feedback. - Loading states. - Prevent duplicate
submissions. - Preserve form input after recoverable API errors. -
Keyboard-accessible forms and tables. - Display units everywhere. -
Display business date explicitly, especially around midnight.

Preferred labels: - "Farmer-confirmed supply", not "warehouse stock". -
"Sellable quantity" or "Available to list", not ambiguous "total
stock". - Show which procurement/delivery date the quantity applies to.

------------------------------------------------------------------------

# 10. Non-functional requirements

## Security

-   Server-side authorization on every protected API.
-   Parameterized queries/ORM protections.
-   Input validation and output encoding.
-   CSRF protection for cookie-based sessions.
-   Restrict CORS to approved origins.
-   Rate-limit login and upload endpoints.
-   Store secrets in environment/secret manager, never Git.
-   HTTPS outside local development.
-   Backups and tested restore procedure.
-   Dependency/vulnerability scanning.

## Data integrity

-   Transactions for farmer/supply updates.
-   Foreign keys, checks and uniqueness constraints.
-   Optimistic concurrency for quantity edits.
-   Audit important changes.
-   No hard delete of records with business history.
-   Dashboard and customer API use the same availability service/query.
-   Future order reservation must prevent overselling.

## Performance and operations

-   Paginate lists.
-   Index farmer name, phone, status, product, business date and supply
    status.
-   Avoid N+1 queries.
-   Target common dashboard reads under one second at expected pilot
    load, then verify through tests.
-   Structured logs with request IDs.
-   Error monitoring and health endpoint.
-   Do not log credentials, tokens or unnecessary personal data.

------------------------------------------------------------------------

# 11. Suggested project structure

First inspect the existing repository and preserve its working
conventions. If starting fresh, a possible structure is:

``` text
samkrushi/
  apps/
    admin-web/
    customer-app/
  services/
    api/
  database/
    migrations/
    seeds/
  docs/
    SAMKRUSHI_ADMIN_DASHBOARD_SPEC.md
    API_CONTRACT.md
  infrastructure/
    deployment/
    scripts/
  README.md
  .env.example
```

Backend modules should remain separated: `auth`, `staff`, `farmers`,
`products`, `supplies`, `dashboard`, `audit`, `storage`, `common`.

Do not duplicate availability logic in the frontend or customer app.

------------------------------------------------------------------------

# 12. Phased implementation plan

## Phase 0 --- Inspect repository and plan

-   Inspect framework versions, database, migrations, authentication and
    storage.
-   Identify reusable modules and risks.
-   Propose schema, API contract and task breakdown.
-   Do not overwrite working code.
-   Do not code until the inspection report is produced.

Acceptance: actual repository and stack are understood; no guessed
architecture.

## Phase 1 --- Database and catalog seed

-   Create migrations for staff, farmers, categories, products, supplies
    and audit logs.
-   Add indexes, foreign keys, checks and uniqueness constraints.
-   Seed initial products/categories using repeatable scripts.
-   Securely bootstrap first ADMIN.
-   Add test fixtures.

Acceptance: clean migrations run; seeds are idempotent; invalid
references, duplicates and invalid quantities are rejected; no default
production password is committed.

## Phase 2 --- Authentication and authorization

-   Login/logout/current-user APIs.
-   Password hashing and secure sessions.
-   ADMIN/OPERATIONS/VIEWER authorization.
-   Route/API protection, login rate limiting and audit events.

Acceptance: role tests pass; inactive and unauthenticated access is
rejected; logout invalidates session.

## Phase 3 --- Farmer management

-   Registration and photo upload.
-   List/search/filter/pagination.
-   Profile and edit.
-   Soft deactivate/reactivate.
-   Audit records.

Acceptance: required fields validated client and server side; farmer
code unique; duplicate phone warning works; deactivation preserves
history and excludes farmer supply.

## Phase 4 --- Farmer product supply

-   Catalog-backed product dropdown.
-   Add supply for business date.
-   Update quantity with reason.
-   Deactivate/reactivate supply.
-   Farmer supply history.
-   Aggregate availability service.

Acceptance: only active catalog products selectable; units/quantities
validated; duplicate farmer-product-date prevented; zero and expired
supplies excluded; aggregate updates correctly.

## Phase 5 --- Dashboard insights

-   KPI cards.
-   Product availability table.
-   Recent supply updates.
-   Low/zero/expired alerts.
-   Date/category filters.
-   Read-only behavior for VIEWER.

Acceptance: all metrics reconcile with database; unlike units are not
summed; filters are consistent.

## Phase 6 --- Customer API

-   Available-products endpoint.
-   Return only active products with positive valid supply.
-   Include unit, image, date and last-updated information.
-   Hide farmer personal information.
-   Integration tests.

Acceptance: multi-farmer aggregation, zero stock, farmer deactivation,
product deactivation and expired supply behave correctly.

## Phase 7 --- Hardening and pilot

-   Security and permission review.
-   Upload validation.
-   Backup/restore test.
-   Performance checks.
-   Error monitoring and structured logs.
-   Staging deployment and staff acceptance test.
-   Production readiness report.

Acceptance: critical tests pass; restore is demonstrated; staff can
register farmers and update supply without developer help; no unresolved
critical/high security issues. Production deployment requires explicit
founder approval.

------------------------------------------------------------------------

# 13. Mandatory automated test scenarios

1.  Register farmer with all required fields.
2.  Reject missing required field.
3.  Reject invalid phone and PIN.
4.  Reject invalid land area.
5.  Reject unsupported/oversized image.
6.  Reject unauthorized farmer creation.
7.  Farmer A supplies 20 kg tomatoes.
8.  Farmer B supplies 15 kg tomatoes for same date.
9.  Aggregate tomato availability is 35 kg.
10. Update Farmer A from 20 kg to 10 kg; aggregate becomes 25 kg.
11. Deactivate Farmer A's supply; aggregate becomes 15 kg.
12. Deactivate Farmer B; aggregate becomes zero and tomato is
    unavailable.
13. If another farmer supplies tomatoes, deactivating one farmer does
    not hide tomatoes.
14. Inactive catalog product never appears as available.
15. Expired supply is excluded.
16. VIEWER cannot mutate data.
17. Audit log captures actor, action, entity and before/after values.
18. Concurrent updates do not silently overwrite each other.
19. Customer API does not expose farmer phone, photo or private address.
20. Dashboard and customer API calculate availability consistently.

------------------------------------------------------------------------

# 14. Environment and deployment

Create `.env.example` with variable names and safe placeholders only.

Configuration categories: - Database connection. -
Session/authentication secret. - Frontend base URL and allowed
origins. - Object storage endpoint, bucket and credentials. -
Environment name. - Logging/error-monitoring DSN. - Business timezone
`Asia/Kolkata`. - Secure initial ADMIN bootstrap mechanism.

Environments: local, staging and production.

Production requirements: - HTTPS. - Controlled migrations. - Production
seed process must not reset data. - Automated backups and documented
restore. - Health checks and error monitoring. - Restricted admin
access. - No test data or default credentials.

------------------------------------------------------------------------

# 15. Business rules and edge cases

1.  A farmer can supply many products.
2.  A product can be supplied by many farmers.
3.  A farmer may have different quantities on different business dates.
4.  A catalog product may be active but unavailable due to zero supply.
5.  Deactivating a farmer preserves history and excludes their supply.
6.  Deactivating one supply does not affect other farmers' supply.
7.  Always show quantity with unit.
8.  Normalize units before aggregation.
9.  Expired records never count.
10. Only authorized staff can update supply.
11. Catalog presence alone does not make a product customer-visible.
12. One farmer's zero quantity must not hide a product supplied by
    another farmer.
13. Backend is the source of truth.
14. Future order reservations must protect against overselling.
15. Never silently substitute products or units.
16. Never carry yesterday's availability forward without reconfirmation.

------------------------------------------------------------------------

# 16. Assumptions and decisions to confirm

Use these defaults for development, document them, and obtain founder
confirmation before production.

  -----------------------------------------------------------------------
  Decision                            Proposed MVP default
  ----------------------------------- -----------------------------------
  Staff accounts                      Admin-created; no public
                                      registration

  Roles                               ADMIN, OPERATIONS, VIEWER

  Farmer ID                           `SAM-FRM-000001` display code +
                                      UUID key

  Farmer photo                        Required

  Secondary contact                   Required as currently requested

  Product catalog                     Pre-seeded; no arbitrary products
                                      in supply form

  Units                               Configured per product

  Supply quantity                     Per farmer, product and business
                                      date

  Timezone                            Asia/Kolkata

  Order cutoff                        Midnight, confirm

  Zero quantity                       Not available to customer

  Removal                             Soft deactivation

  Pre-order availability              Sum of active, unexpired
                                      farmer-confirmed quantities

  Post-order availability             Supply less
                                      reservations/commitments

  Farmer login                        Not in MVP

  Storage                             Object storage for photos
  -----------------------------------------------------------------------

Founder decisions still needed: - Is secondary contact truly mandatory
or should it be optional? - Is land area operationally necessary or only
farmer profile information? - Does a quantity apply to the next
morning's cycle or same calendar date? - Can one farmer provide multiple
lots/updates for the same product/date? - What is the final launch
catalog and unit for each product? - Who reconfirms that recorded
quantity remains available after entry? - Should a safety buffer be held
back rather than exposing 100% of farmer-confirmed quantity? - At what
order state should future stock be reserved/deducted?

------------------------------------------------------------------------

# 17. Instructions for the AI coding agent

Treat this file as the MVP functional source of truth.

1.  Inspect before coding. Report current repository, stack, database,
    auth and storage.
2.  Do not replace working technology without explaining and obtaining
    approval.
3.  Do not invent rules where decisions are marked unconfirmed.
4.  Implement validation and authorization on the backend, not only
    frontend.
5.  Use migrations and repeatable seeds.
6.  Keep catalog products separate from farmer supply.
7.  Keep availability calculation in one backend service used by
    dashboard and customer API.
8.  Preserve history using deactivation and audit logs.
9.  Never expose farmer private details through customer APIs.
10. Implement one phase at a time.
11. After each phase report changed files, migrations, APIs, tests,
    actual results and remaining issues.
12. Never claim tests passed unless executed.
13. Never commit secrets or real farmer personal data.
14. Provide local setup and deployment instructions.
15. Adapt to the actual repository rather than forcing the suggested
    folder structure.

## Prompt 0 --- Repository inspection

> Read `SAMKRUSHI_ADMIN_DASHBOARD_SPEC.md` completely. Do not code yet.
> Inspect the existing repository and report: (1) frontend/backend
> frameworks and versions, (2) database and migration approach, (3)
> authentication and storage, (4) reusable modules, (5) gaps against
> this spec, (6) recommended implementation sequence, and (7)
> conflicting or ambiguous requirements. Preserve working code. Propose
> schema and API contract before implementation.

## Prompt 1 --- Database

> Implement Phase 1 only. Create migrations, constraints, indexes and
> repeatable catalog seed process. Add schema and seed idempotency
> tests. Do not implement frontend yet. Report changes and actual test
> results.

## Prompt 2 --- Authentication

> Implement Phase 2 only. Add secure staff authentication and
> server-side role authorization. Test ADMIN, OPERATIONS, VIEWER,
> inactive users and unauthenticated requests. Do not proceed until
> tests pass.

## Prompt 3 --- Farmer management

> Implement Phase 3 only. Build registration, photo upload,
> list/search/filter, profile, edit and soft deactivation. Validate
> client and server side. Add audit logging and tests. Do not implement
> supply management yet.

## Prompt 4 --- Farmer supply

> Implement Phase 4 only. Add catalog-backed product selection,
> farmer-confirmed quantity entry, business date, update, deactivation
> and aggregate availability. Preserve history. Test units, duplicates,
> zero quantity and expiry.

## Prompt 5 --- Dashboard

> Implement Phase 5 only. Build KPIs, product availability, recent
> updates and alerts. Use the shared backend availability service. Add
> date filters and VIEWER read-only behavior.

## Prompt 6 --- Customer API

> Implement Phase 6 only. Build the available-products API. Return only
> active products with positive unexpired availability. Do not expose
> farmer personal data. Add tests for multiple farmers, zero stock,
> deactivation and expiry.

## Prompt 7 --- Pilot readiness

> Implement Phase 7 only. Review security, permissions, uploads,
> database integrity, backup/restore, monitoring and performance. Run
> tests and produce a readiness report. Do not deploy to production
> without explicit approval.

------------------------------------------------------------------------

# 18. Definition of done

The dashboard MVP is complete only when: - Authorized staff can log in
securely. - Staff can register, search, view, edit and deactivate
farmers. - Staff can select products from the predefined catalog. -
Staff can record and update farmer-confirmed quantities for a business
date. - Aggregate product availability is correct across farmers. -
Zero-quantity and expired products are unavailable to customers. -
Dashboard insights reconcile with database records. - Sensitive actions
are permission-checked and audited. - Customer API exposes only
necessary product information. - Mandatory automated tests pass. -
Deployment, backup and recovery instructions exist. - Founders confirm
the open decisions in Section 16.

**Final product principle:** The catalog defines what Samkrushi is
willing to sell. Farmer supply records define what Samkrushi can
currently offer. The backend combines these two sources to decide what
the customer application displays.
