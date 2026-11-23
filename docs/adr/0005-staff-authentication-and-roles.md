# ADR-0005: Staff authentication and roles

- **Status:** Accepted
- **Date:** 2026-11-23
- **Deciders:** Founders (approved 2026-11-23)

## Context

- ADMIN_DASHBOARD §5.1 (v1.0 L349–358) defines `staff_users` with an app-managed `password_hash` and a single `role` enum (`ADMIN`, `OPERATIONS`, `VIEWER`), with login by email/username (L101–108, L135).
- Master §3 and ARCH §7.2 use Supabase Auth with a protected multi-role `user_roles` table.
- An app-managed hash would duplicate Supabase Auth and bypass its session/refresh handling, and a single role column cannot represent multi-role staff (ARCH L155).
- ARCH `app_role` (L647) has no read-only role, yet master §3 and WEB_ADMIN §3 require VIEWER to map to an explicit read-only set without silently gaining privileges.
- ADMIN_DASHBOARD L117 marks audit as "Optional" for OPERATIONS. Every other source restricts it.
- Customers, staff and riders will share one Supabase Auth project.

## Decision

1. **Staff sign in with Supabase Auth email+password.** There is no app-managed `password_hash`. Username login is added only if the founders require it, through a trusted username→email lookup.
2. **Tables:**
   - `staff_profiles` (`user_id` PK/FK `auth.users`, `full_name`, `is_active`, `last_login_at`, `deactivated_at`, `deactivation_reason`, created/updated by and at).
   - `user_roles` (`id`, `user_id`, `role app_role`, `assigned_by`, `created_at`, `UNIQUE(user_id, role)`).
   - Customer `profiles` are separate.
3. **`app_role`** = `customer`, `super_admin`, `operations_admin`, `finance_admin`, `dispatch_admin`, `support_agent`, `rider`, `viewer`.
4. **Role mapping:** `ADMIN` → `super_admin`, `OPERATIONS` → `operations_admin`, `VIEWER` → `viewer`. No finance, dispatch, support or role-admin privilege is granted implicitly.
5. **`viewer`:** SELECT-only RLS on MVP dashboard data (overview, farmers/suppliers without restricted fields, dated supply, catalog). No audit, no finance/bank fields, no mutations. Covered by role-matrix tests. The founders still decide whether viewer sees farmer phone numbers and photos; the dev default masks phones and hides photos.
6. **Scope rules (MVP):** audit history is super_admin-only. Catalog writes are super_admin-only. Any later delegation (operations catalog edits, a scoped operations audit view) is added as an explicit permission, never by widening a role silently.
7. **Next.js sessions:** `@supabase/ssr` with HTTP-only, SameSite, Secure (outside local) cookies. CSRF protection on server actions/route handlers. Generic invalid-credential message. Login rate limiting beyond Supabase defaults. `last_login_at` is updated by a trusted server step.
8. **Shared Auth project rules:**
   - admin-web rejects any session without an active `staff_profiles` row **and** at least one active staff role (any role except `customer`). The rider route requires `rider`, and dashboard routes require a dashboard role.
   - Customer sign-up (any method) never creates a `staff_profiles` row or a staff role. Privileged roles are inserted only by trusted server operations or the bootstrap script. Users cannot read or write `user_roles` beyond their own role list.
   - Inactive staff are banned in Supabase Auth (admin API) and all their sessions are revoked. Every protected request and RLS helper (`is_active_staff()`, `has_role()` with a fixed `search_path`) also checks `is_active`.
   - The rider sign-in method is an open founder decision, because riders may lack email.
9. **Bootstrap:** a one-time server script (`scripts/`) creates the first `super_admin` from env-supplied credentials. It refuses to run if a `super_admin` exists and never prints the password. No default password is committed. The production seed never resets data.
10. **Staff lifecycle:** a super_admin creates, deactivates and reactivates staff and assigns roles through trusted server operations that use the Auth admin API. Each action is audited. The password-reset method is an open founder decision (MVP default: admin-assisted).

## Consequences

- One identity system with Supabase session handling. Staff MFA can be added later without schema change.
- RLS policies and server checks must handle multi-role users. Role-matrix tests (pgTAP or `supabase test db`) must include `viewer`, inactive staff and customer-only sessions.
- Customer phone auth (if chosen) shares the project. Tests must prove a customer can never reach admin routes.

## References

- Master §3, §8, §9
- WEB_ADMIN §2, §3, §17, §19
- ADMIN_DASHBOARD §2 (L84–117), §3.1, §5.1 (L349–358), §14 — status block
- ARCH §2, §7.1 (L647), §7.2 (L665–684), §10 — status block
- ADR-0004 (farmer field visibility)
