-- =============================================================================
-- SAMKRUSHI Phase 2 — foundation: extensions, private schema, privilege
-- lockdown, shared helper functions and generic triggers.
--
-- Conventions (master §5): UUID PKs, TIMESTAMPTZ (UTC), business dates in
-- Asia/Kolkata, INR as BIGINT paise, NUMERIC quantities with explicit units,
-- lowercase snake_case enums/codes.
--
-- Security model: every table in `public` has RLS enabled. Client roles
-- (`anon`, `authenticated`) get SELECT only where a policy allows it; ALL
-- business mutations go through trusted server code (service role or
-- SECURITY DEFINER RPCs added per phase). Helper functions live in the
-- non-exposed `private` schema with a pinned search_path.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- -----------------------------------------------------------------------------
-- Private schema (not exposed through PostgREST; see supabase/config.toml)
-- -----------------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Privilege lockdown: no implicit table/function access for client roles.
-- Each table grants exactly what its RLS policies are designed for.
-- -----------------------------------------------------------------------------
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
-- TRUNCATE bypasses row-level guards (append-only, no-delete); nobody gets it.
alter default privileges in schema public revoke truncate on tables from service_role;
-- Per-schema defaults cannot remove the global PUBLIC EXECUTE, so revoke it
-- globally for functions created by this role; each function grants explicitly.
alter default privileges revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon, authenticated;
alter default privileges in schema private revoke execute on functions from anon, authenticated;

-- -----------------------------------------------------------------------------
-- Business date (Asia/Kolkata), always from server time (master §5, §13.12)
-- -----------------------------------------------------------------------------
create function public.current_business_date()
returns date
language sql
stable
set search_path = ''
as $$
  select (pg_catalog.now() at time zone 'Asia/Kolkata')::date;
$$;
comment on function public.current_business_date() is
  'Current Asia/Kolkata business date from server time. Device time is display-only.';
revoke all on function public.current_business_date() from public;
grant execute on function public.current_business_date() to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Request context. Trusted server code sets these per transaction with
-- set_config(..., true); PostgREST requests fall back to the x-request-id header.
--   app.request_id  app.actor_role  app.reason  app.source
-- -----------------------------------------------------------------------------
create function private.request_setting(p_name text)
returns text
language sql
stable
set search_path = ''
as $$
  select nullif(pg_catalog.current_setting(p_name, true), '');
$$;
grant execute on function private.request_setting(text) to authenticated, service_role;

create function private.current_request_id()
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_request_id text := private.request_setting('app.request_id');
  v_headers text;
begin
  if v_request_id is null then
    v_headers := private.request_setting('request.headers');
    if v_headers is not null then
      begin
        v_request_id := (v_headers::jsonb) ->> 'x-request-id';
      exception when others then
        v_request_id := null;
      end;
    end if;
  end if;
  -- Bound length; never trust arbitrary header sizes.
  return left(v_request_id, 128);
end;
$$;

-- Phone masking for audit/viewer output: keeps country code and last 4 digits.
create function private.mask_phone(p_phone text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_phone is null then null
    when length(p_phone) <= 7 then '***'
    else left(p_phone, 3) || repeat('*', length(p_phone) - 7) || right(p_phone, 4)
  end;
$$;

-- -----------------------------------------------------------------------------
-- Generic triggers
-- -----------------------------------------------------------------------------

-- updated_at only
create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

-- updated_at + optimistic-concurrency version (callers compare the version
-- they read: UPDATE ... WHERE id = $1 AND version = $2). Attach BEFORE INSERT
-- OR UPDATE: inserts always start at version 1.
create function private.bump_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.version := 1;
    return new;
  end if;
  if new.version is distinct from old.version then
    raise exception 'version is managed by the database'
      using errcode = '42501';
  end if;
  new.version := old.version + 1;
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

-- Columns that must never change after insert (trigger args = column names).
create function private.forbid_column_change()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_column text;
  v_old jsonb := to_jsonb(old);
  v_new jsonb := to_jsonb(new);
begin
  foreach v_column in array tg_argv loop
    if (v_old -> v_column) is distinct from (v_new -> v_column) then
      raise exception '%.% is immutable', tg_table_name, v_column
        using errcode = '23514';
    end if;
  end loop;
  return new;
end;
$$;

-- Statement-level guard: TRUNCATE is never allowed on protected tables.
create function private.forbid_truncate()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% cannot be truncated', tg_table_name
    using errcode = '42501';
end;
$$;
