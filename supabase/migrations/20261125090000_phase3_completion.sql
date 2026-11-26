-- =============================================================================
-- Phase 3 completion: supply evidence access, scheduled-job run log, and
-- orphaned private storage object detection (master §13.1, §13.9).
-- =============================================================================

-- Evidence key for server-side signed URLs (same roles that manage supply;
-- viewer never receives private object keys).
create function public.admin_supply_evidence_key(p_supply_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.has_any_role(array['super_admin', 'operations_admin']::public.app_role[]) then
    raise exception 'not authorized' using errcode = 'PT403';
  end if;
  return (select evidence_storage_key from public.supply_confirmations where id = p_supply_id);
end;
$$;
revoke all on function public.admin_supply_evidence_key(uuid) from public, anon;
grant execute on function public.admin_supply_evidence_key(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Scheduled job runs (master §13.1: every job records start, end, outcome,
-- counts and error with a request id). Written by trusted job code only.
-- -----------------------------------------------------------------------------
create type public.job_run_status as enum ('running', 'succeeded', 'failed');

create table public.scheduled_job_runs (
  id uuid primary key default gen_random_uuid(),
  job_name text not null check (job_name ~ '^[a-z][a-z0-9_-]{1,63}$'),
  status public.job_run_status not null default 'running',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  counts jsonb not null default '{}'::jsonb,
  error text check (error is null or char_length(error) <= 2000),
  request_id text check (request_id is null or char_length(request_id) <= 128),
  constraint scheduled_job_runs_finished_consistent check (
    (status = 'running' and finished_at is null) or (status <> 'running' and finished_at is not null)
  )
);
comment on table public.scheduled_job_runs is 'Run log for scheduled jobs (master §13.1). super_admin read; service role write.';
create index scheduled_job_runs_job_idx on public.scheduled_job_runs (job_name, started_at desc);

alter table public.scheduled_job_runs enable row level security;
revoke all on public.scheduled_job_runs from anon, authenticated;
grant select on public.scheduled_job_runs to authenticated;
grant select, insert, update on public.scheduled_job_runs to service_role;
create policy scheduled_job_runs_select on public.scheduled_job_runs
  for select to authenticated using ((select private.has_role('super_admin')));

-- -----------------------------------------------------------------------------
-- Orphan detection for PRIVATE buckets: objects older than the grace period
-- that no database row references. Deletion happens through the Storage API
-- (Edge Function sweep-orphan-objects), never by deleting storage rows in SQL.
-- -----------------------------------------------------------------------------
create function public.storage_orphan_candidates(p_grace_seconds integer, p_limit integer default 500)
returns table (bucket_id text, object_name text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select o.bucket_id, o.name, o.created_at
  from storage.objects o
  where o.bucket_id in ('farmer-photos', 'supply-evidence')
    and o.created_at < now() - make_interval(secs => greatest(p_grace_seconds, 3600))
    and not exists (
      select 1 from public.farmer_profiles fp
      where o.bucket_id = 'farmer-photos' and fp.photo_storage_key = o.name
    )
    and not exists (
      select 1 from public.supply_confirmations sc
      where o.bucket_id = 'supply-evidence' and sc.evidence_storage_key = o.name
    )
  order by o.created_at
  limit least(greatest(p_limit, 1), 1000);
$$;
comment on function public.storage_orphan_candidates(integer, integer) is
  'Unreferenced private objects past the grace period (minimum 1 hour). Service role only.';
revoke all on function public.storage_orphan_candidates(integer, integer) from public, anon, authenticated;
grant execute on function public.storage_orphan_candidates(integer, integer) to service_role;
