-- =============================================================================
-- First super_admin bootstrap (ADR-0005 §9). Called once by
-- scripts/bootstrap-super-admin.mjs with the service role after it created the
-- Auth user from env-supplied credentials. Refuses if any super_admin exists.
-- =============================================================================
create function public.bootstrap_first_super_admin(p_user_id uuid, p_full_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'bootstrap requires the service role' using errcode = 'PT403';
  end if;

  -- Serialize concurrent bootstrap attempts.
  perform pg_advisory_xact_lock(hashtext('samkrushi.bootstrap_first_super_admin'));

  if exists (select 1 from public.user_roles where role = 'super_admin') then
    raise exception 'a super_admin already exists; bootstrap refused' using errcode = 'PT409';
  end if;
  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'auth user not found' using errcode = 'PT404';
  end if;

  perform set_config('app.source', 'bootstrap', true);
  perform set_config('app.actor_role', 'bootstrap', true);
  perform set_config('app.reason', 'first super_admin bootstrap', true);

  insert into public.staff_profiles (user_id, full_name) values (p_user_id, btrim(p_full_name));
  insert into public.user_roles (user_id, role) values (p_user_id, 'super_admin');
  return jsonb_build_object('userId', p_user_id, 'role', 'super_admin');
end;
$$;
revoke all on function public.bootstrap_first_super_admin(uuid, text) from public, anon, authenticated;
grant execute on function public.bootstrap_first_super_admin(uuid, text) to service_role;
