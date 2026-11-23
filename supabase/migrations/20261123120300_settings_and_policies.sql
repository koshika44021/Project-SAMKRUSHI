-- =============================================================================
-- Settings and policy versions (master §5, §13.14; WEB_ADMIN §16)
--
-- No production values are created here: business settings (cutoffs, slots,
-- fees, COD limits, rate limits, contacts, ...) are founder decisions and are
-- inserted by authorized, audited operations — or by the dev-only seed.
-- Value shapes are validated server-side with shared Zod schemas per key.
-- =============================================================================

create table public.app_settings (
  key text primary key check (key ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$' and char_length(key) <= 120),
  value jsonb not null,
  description text not null check (char_length(description) between 1 and 500),
  is_customer_visible boolean not null default false,
  version integer not null default 1,
  updated_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.app_settings is
  'Typed operating settings (dot-namespaced keys). is_customer_visible rows may be exposed by get-app-config; all others are staff/server only.';

create trigger app_settings_bump_version
  before insert or update on public.app_settings
  for each row execute function private.bump_version();

create trigger app_settings_audit
  after insert or update or delete on public.app_settings
  for each row execute function private.audit_row_change('key');

-- -----------------------------------------------------------------------------
create type public.policy_type as enum (
  'substitution',
  'cancellation',
  'refund',
  'delivery',
  'privacy',
  'terms'
);

create type public.policy_status as enum ('draft', 'published', 'retired');

create table public.policy_versions (
  id uuid primary key default gen_random_uuid(),
  policy_type public.policy_type not null,
  version_number integer not null check (version_number >= 1),
  title text not null check (char_length(title) between 1 and 200),
  body_markdown text not null check (char_length(body_markdown) between 1 and 100000),
  status public.policy_status not null default 'draft',
  effective_from timestamptz,
  published_at timestamptz,
  published_by uuid references auth.users (id),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint policy_versions_type_version_unique unique (policy_type, version_number),
  constraint policy_versions_publish_consistent check (
    (status = 'draft' and published_at is null)
    or (status in ('published', 'retired') and published_at is not null and effective_from is not null)
  )
);
comment on table public.policy_versions is
  'Versioned customer policies. Orders record the version shown at checkout. Text requires founder/legal approval.';

-- At most one published version per policy type.
create unique index policy_versions_one_published_idx
  on public.policy_versions (policy_type) where status = 'published';

create trigger policy_versions_set_updated_at
  before update on public.policy_versions
  for each row execute function private.set_updated_at();

-- Published/retired text is immutable: publish a new version instead.
create function private.enforce_policy_immutability()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status <> 'draft' and new.status = 'draft' then
    raise exception 'a published policy version cannot return to draft; create a new version'
      using errcode = '23514';
  end if;
  if old.status <> 'draft' and (
       new.body_markdown is distinct from old.body_markdown
    or new.title is distinct from old.title
    or new.policy_type is distinct from old.policy_type
    or new.version_number is distinct from old.version_number
    or new.effective_from is distinct from old.effective_from
    or new.published_at is distinct from old.published_at
    or new.published_by is distinct from old.published_by
  ) then
    raise exception 'published policy versions are immutable; create a new version'
      using errcode = '23514';
  end if;
  if old.status = 'retired' and new.status <> 'retired' then
    raise exception 'retired policy versions cannot be republished'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger policy_versions_immutable
  before update on public.policy_versions
  for each row execute function private.enforce_policy_immutability();

-- Only drafts may be deleted; published/retired text is evidence of what
-- customers were shown.
create function private.forbid_non_draft_policy_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status <> 'draft' then
    raise exception 'published or retired policy versions cannot be deleted'
      using errcode = '42501';
  end if;
  return old;
end;
$$;

create trigger policy_versions_no_delete
  before delete on public.policy_versions
  for each row execute function private.forbid_non_draft_policy_delete();

create trigger policy_versions_no_truncate
  before truncate on public.policy_versions
  for each statement execute function private.forbid_truncate();

create trigger policy_versions_audit
  after insert or update or delete on public.policy_versions
  for each row execute function private.audit_row_change('id');

-- -----------------------------------------------------------------------------
-- RLS: settings are super_admin + server only; policies readable by staff.
-- Customers receive customer-visible settings and published policies through
-- get-app-config (service role), not direct table access.
-- -----------------------------------------------------------------------------
alter table public.app_settings enable row level security;
alter table public.policy_versions enable row level security;

revoke all on public.app_settings, public.policy_versions from anon, authenticated;
grant select on public.app_settings, public.policy_versions to authenticated;

create policy app_settings_select on public.app_settings
  for select to authenticated
  using ((select private.has_role('super_admin')));

create policy policy_versions_select on public.policy_versions
  for select to authenticated
  using ((select private.is_dashboard_staff()));
