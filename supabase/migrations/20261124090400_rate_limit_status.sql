-- =============================================================================
-- Read-only rate-limit check. Lets callers count only FAILED attempts (e.g.
-- staff login): check status first, consume a hit only when the attempt fails.
-- =============================================================================
create function public.rate_limit_status(
  p_bucket text,
  p_key text,
  p_limit integer,
  p_window_seconds integer
)
returns table (allowed boolean, remaining integer, retry_after_seconds integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_window_start timestamptz;
  v_hits integer;
begin
  if p_limit < 1 or p_window_seconds < 1 then
    raise exception 'invalid rate limit configuration' using errcode = '22023';
  end if;
  v_window_start := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  select c.hits into v_hits
  from public.rate_limit_counters c
  where c.bucket = p_bucket
    and c.key_hash = encode(extensions.digest(p_bucket || ':' || coalesce(p_key, ''), 'sha256'), 'hex')
    and c.window_start = v_window_start;

  v_hits := coalesce(v_hits, 0);
  allowed := v_hits < p_limit;
  remaining := greatest(0, p_limit - v_hits);
  retry_after_seconds := case when allowed then 0
    else ceil(extract(epoch from (v_window_start + make_interval(secs => p_window_seconds) - now())))::integer end;
  return next;
end;
$$;
revoke all on function public.rate_limit_status(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_status(text, text, integer, integer) to service_role;
