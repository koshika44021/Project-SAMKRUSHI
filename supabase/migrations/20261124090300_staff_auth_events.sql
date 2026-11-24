-- =============================================================================
-- Audit for Auth-side staff events that are not table changes (password reset
-- by an admin, Auth ban/unban). admin-web calls this right after performing
-- the Auth admin API action, with the acting super_admin's JWT.
-- =============================================================================
create function public.admin_record_staff_auth_event(
  p_user_id uuid,
  p_event text,
  p_reason text,
  p_request_id text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := private.require_reason(p_reason);
begin
  perform private.begin_admin_action(array['super_admin']::public.app_role[], p_request_id, v_reason);
  if p_event not in ('password_reset', 'auth_banned', 'auth_unbanned') then
    raise exception 'unknown staff auth event' using errcode = 'PT422', detail = 'event';
  end if;
  if not exists (select 1 from public.staff_profiles where user_id = p_user_id) then
    raise exception 'staff member not found' using errcode = 'PT404';
  end if;

  insert into public.audit_logs (actor_user_id, actor_role, action, entity_type, entity_id, reason, request_id, source)
  values (
    (select auth.uid()), 'super_admin', 'staff_auth.' || p_event, 'staff_profiles', p_user_id::text,
    v_reason, private.current_request_id(), coalesce(private.request_setting('app.source'), 'admin-web')
  );
end;
$$;
revoke all on function public.admin_record_staff_auth_event(uuid, text, text, text) from public, anon;
grant execute on function public.admin_record_staff_auth_event(uuid, text, text, text) to authenticated;
