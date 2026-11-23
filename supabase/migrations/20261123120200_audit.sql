-- =============================================================================
-- Append-only audit log (master §5, WEB_ADMIN §17)
--
-- Every change to an audited table is captured by a trigger, so no code path
-- can skip auditing. Trusted server code adds context per transaction:
--   select set_config('app.request_id', '<id>', true);
--   select set_config('app.actor_role', 'super_admin', true);
--   select set_config('app.reason', '<why>', true);
--   select set_config('app.source', 'admin-web', true);
-- Raw IP addresses are never stored; ip_hash stays NULL until founders approve.
-- =============================================================================

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  actor_user_id uuid,
  actor_role text check (actor_role is null or char_length(actor_role) <= 64),
  action text not null check (char_length(action) between 1 and 120),
  entity_type text not null check (char_length(entity_type) between 1 and 80),
  entity_id text not null check (char_length(entity_id) between 1 and 200),
  reason text check (reason is null or char_length(reason) <= 1000),
  before_data jsonb,
  after_data jsonb,
  request_id text check (request_id is null or char_length(request_id) <= 128),
  source text not null default 'database' check (char_length(source) <= 64),
  ip_hash text check (ip_hash is null or char_length(ip_hash) <= 128)
);
comment on table public.audit_logs is
  'Append-only audit trail. No UPDATE/DELETE/TRUNCATE for any role. ip_hash unused until founders approve (master §5).';
comment on column public.audit_logs.actor_user_id is
  'auth.users id of the actor (no FK: audit rows must outlive account lifecycle changes).';

create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id, occurred_at desc);
create index audit_logs_actor_idx on public.audit_logs (actor_user_id, occurred_at desc);
create index audit_logs_occurred_idx on public.audit_logs (occurred_at desc);

-- Append-only enforcement that also binds table owners and service_role.
create function private.audit_logs_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit_logs is append-only'
    using errcode = '42501';
end;
$$;

create trigger audit_logs_no_update_delete
  before update or delete on public.audit_logs
  for each row execute function private.audit_logs_append_only();

create trigger audit_logs_no_truncate
  before truncate on public.audit_logs
  for each statement execute function private.audit_logs_append_only();

revoke all on public.audit_logs from anon, authenticated, service_role;
grant select, insert on public.audit_logs to service_role;
grant select on public.audit_logs to authenticated;

alter table public.audit_logs enable row level security;

-- Audit history is super_admin-only (ADR-0005).
create policy audit_logs_select_super_admin on public.audit_logs
  for select to authenticated
  using ((select private.has_role('super_admin')));

-- -----------------------------------------------------------------------------
-- Redaction. Trigger args name columns to protect:
--   'col'        → value replaced with "[redacted]"
--   'col:phone'  → value masked with private.mask_phone
--   'col:omit'   → key removed entirely
-- -----------------------------------------------------------------------------
create function private.redact_row(p_row jsonb, p_rules text[])
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_rule text;
  v_column text;
  v_mode text;
  v_result jsonb := p_row;
begin
  if p_row is null then
    return null;
  end if;
  foreach v_rule in array coalesce(p_rules, '{}') loop
    v_column := split_part(v_rule, ':', 1);
    v_mode := coalesce(nullif(split_part(v_rule, ':', 2), ''), 'redact');
    if v_result ? v_column then
      if v_mode = 'omit' then
        v_result := v_result - v_column;
      elsif v_mode = 'phone' then
        v_result := jsonb_set(v_result, array[v_column],
          coalesce(to_jsonb(private.mask_phone(v_result ->> v_column)), 'null'::jsonb));
      elsif v_result -> v_column <> 'null'::jsonb then
        v_result := jsonb_set(v_result, array[v_column], '"[redacted]"'::jsonb);
      end if;
    end if;
  end loop;
  return v_result;
end;
$$;

-- Generic row-change audit trigger.
--   tg_argv[0]  primary-key column name (e.g. 'id', 'user_id', 'supplier_id')
--   tg_argv[1:] redaction rules (see private.redact_row)
create function private.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pk_column text := coalesce(tg_argv[0], 'id');
  v_rules text[] := coalesce(tg_argv[1:], '{}');
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_entity_id text := coalesce(v_new ->> v_pk_column, v_old ->> v_pk_column);
  v_actor_role text := private.request_setting('app.actor_role');
begin
  -- Skip no-op updates (nothing changed except bookkeeping).
  if tg_op = 'UPDATE'
     and (v_old - array['updated_at', 'version']) = (v_new - array['updated_at', 'version']) then
    return new;
  end if;

  if v_actor_role is null then
    v_actor_role := coalesce(
      nullif(array_to_string(private.current_roles(), ','), ''),
      nullif(auth.role(), ''),
      current_user
    );
  end if;

  insert into public.audit_logs (
    actor_user_id, actor_role, action, entity_type, entity_id, reason,
    before_data, after_data, request_id, source
  ) values (
    (select auth.uid()),
    left(v_actor_role, 64),
    tg_table_name || '.' || lower(tg_op),
    tg_table_name,
    v_entity_id,
    left(private.request_setting('app.reason'), 1000),
    private.redact_row(v_old, v_rules),
    private.redact_row(v_new, v_rules),
    private.current_request_id(),
    coalesce(left(private.request_setting('app.source'), 64), 'database')
  );

  return coalesce(new, old);
end;
$$;
revoke all on function private.audit_row_change() from public;

-- Audit identity tables now (later tables attach the trigger in their own migration).
create trigger staff_profiles_audit
  after insert or update or delete on public.staff_profiles
  for each row execute function private.audit_row_change('user_id');

create trigger user_roles_audit
  after insert or update or delete on public.user_roles
  for each row execute function private.audit_row_change('id');
