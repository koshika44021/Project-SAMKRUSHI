-- =============================================================================
-- Identity and roles (master §3, ADR-0005)
--   profiles        — customer profile (1:1 auth.users); creation flow is Phase 5
--   staff_profiles  — staff extension of auth.users (is_active gate)
--   user_roles      — protected multi-role assignments, UNIQUE(user_id, role)
-- Privileged roles are written ONLY by trusted server operations (service
-- role) or the bootstrap script. Client roles can read their own rows only.
-- =============================================================================

create type public.app_role as enum (
  'customer',
  'super_admin',
  'operations_admin',
  'finance_admin',
  'dispatch_admin',
  'support_agent',
  'rider',
  'viewer'
);
comment on type public.app_role is
  'Platform roles (master §3). Source mapping: ADMIN→super_admin, OPERATIONS→operations_admin, VIEWER→viewer.';

-- -----------------------------------------------------------------------------
-- profiles (customers)
-- -----------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text check (full_name is null or char_length(full_name) <= 120 and char_length(btrim(full_name)) >= 1),
  phone_e164 text check (phone_e164 is null or phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  email text check (email is null or (char_length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.profiles is 'Customer profile. Contains no role or admin flag (master §3).';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- staff_profiles
-- -----------------------------------------------------------------------------
create table public.staff_profiles (
  user_id uuid primary key references auth.users (id) on delete restrict,
  full_name text not null check (char_length(full_name) <= 120 and char_length(btrim(full_name)) >= 2),
  is_active boolean not null default true,
  last_login_at timestamptz,
  deactivated_at timestamptz,
  deactivation_reason text check (deactivation_reason is null or char_length(deactivation_reason) <= 500),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_profiles_deactivation_consistent check (
    (is_active and deactivated_at is null)
    or (not is_active and deactivated_at is not null and deactivation_reason is not null)
  )
);
comment on table public.staff_profiles is
  'Staff extension of auth.users. Inactive staff fail every role check; Auth ban + session revoke happen in trusted server code (ADR-0005).';

create trigger staff_profiles_set_updated_at
  before update on public.staff_profiles
  for each row execute function private.set_updated_at();

create trigger staff_profiles_immutable_columns
  before update on public.staff_profiles
  for each row execute function private.forbid_column_change('user_id', 'created_at', 'created_by');

-- -----------------------------------------------------------------------------
-- user_roles
-- -----------------------------------------------------------------------------
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.app_role not null,
  assigned_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  constraint user_roles_user_role_unique unique (user_id, role)
);
comment on table public.user_roles is
  'Protected role assignments. Written only by trusted server operations; never customer-editable.';

create index user_roles_role_idx on public.user_roles (role);

-- A staff role requires a staff profile: a customer sign-up can never hold
-- staff access by accident (ADR-0005 §8).
create function private.enforce_staff_role_requires_profile()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.role <> 'customer' and not exists (
    select 1 from public.staff_profiles sp where sp.user_id = new.user_id
  ) then
    raise exception 'role % requires a staff profile', new.role
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger user_roles_require_staff_profile
  before insert or update on public.user_roles
  for each row execute function private.enforce_staff_role_requires_profile();

create trigger user_roles_immutable_columns
  before update on public.user_roles
  for each row execute function private.forbid_column_change('user_id', 'role', 'created_at');

-- -----------------------------------------------------------------------------
-- Role helpers for RLS and RPCs. SECURITY DEFINER so they can read
-- user_roles/staff_profiles regardless of the caller's RLS; search_path is
-- pinned. Use as `(select private.has_any_role(...))` in policies so the
-- planner evaluates them once per statement.
-- -----------------------------------------------------------------------------

-- Active staff = active staff profile AND at least one non-customer role.
create function private.is_active_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.staff_profiles sp
    join public.user_roles ur on ur.user_id = sp.user_id
    where sp.user_id = (select auth.uid())
      and sp.is_active
      and ur.role <> 'customer'
  );
$$;

-- True when the caller holds any of the given roles. Staff roles count only
-- while the staff profile is active; 'customer' needs no staff profile.
create function private.has_any_role(p_roles public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    left join public.staff_profiles sp on sp.user_id = ur.user_id
    where ur.user_id = (select auth.uid())
      and ur.role = any (p_roles)
      and (ur.role = 'customer' or coalesce(sp.is_active, false))
  );
$$;

create function private.has_role(p_role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_any_role(array[p_role]);
$$;

-- Roles that may use the admin dashboard (rider uses the separate rider route).
create function private.is_dashboard_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_any_role(array[
    'super_admin', 'operations_admin', 'finance_admin',
    'dispatch_admin', 'support_agent', 'viewer'
  ]::public.app_role[]);
$$;

-- Active roles of the caller (for audit actor_role fallback and UI).
create function private.current_roles()
returns public.app_role[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(ur.role order by ur.role), '{}')
  from public.user_roles ur
  left join public.staff_profiles sp on sp.user_id = ur.user_id
  where ur.user_id = (select auth.uid())
    and (ur.role = 'customer' or coalesce(sp.is_active, false));
$$;

revoke all on function private.is_active_staff() from public;
revoke all on function private.has_any_role(public.app_role[]) from public;
revoke all on function private.has_role(public.app_role) from public;
revoke all on function private.is_dashboard_staff() from public;
revoke all on function private.current_roles() from public;
grant execute on function private.is_active_staff() to authenticated, service_role;
grant execute on function private.has_any_role(public.app_role[]) to authenticated, service_role;
grant execute on function private.has_role(public.app_role) to authenticated, service_role;
grant execute on function private.is_dashboard_staff() to authenticated, service_role;
grant execute on function private.current_roles() to authenticated, service_role;

-- Public RPC so admin-web can resolve the signed-in user's access in one call.
create function public.my_access()
returns table (user_id uuid, is_active_staff boolean, roles public.app_role[])
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()), private.is_active_staff(), private.current_roles();
$$;
revoke all on function public.my_access() from public;
grant execute on function public.my_access() to authenticated;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.staff_profiles enable row level security;
alter table public.user_roles enable row level security;

revoke all on public.profiles, public.staff_profiles, public.user_roles from anon, authenticated;
grant select on public.profiles, public.staff_profiles, public.user_roles to authenticated;

create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

-- Staff/Users is super_admin-only (WEB_ADMIN §2): others read only their own
-- row. Actor names for other screens come from staff_display_names().
create policy staff_profiles_select on public.staff_profiles
  for select to authenticated
  using (user_id = (select auth.uid()) or (select private.has_role('super_admin')));

-- Display names only (no status, login or deactivation data) for actor
-- columns such as "confirmed by" / "updated by".
create function public.staff_display_names(p_user_ids uuid[])
returns table (user_id uuid, full_name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_dashboard_staff() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  return query
    select sp.user_id, sp.full_name
    from public.staff_profiles sp
    where sp.user_id = any (p_user_ids);
end;
$$;
revoke all on function public.staff_display_names(uuid[]) from public;
grant execute on function public.staff_display_names(uuid[]) to authenticated;

create policy user_roles_select on public.user_roles
  for select to authenticated
  using (user_id = (select auth.uid()) or (select private.has_role('super_admin')));
