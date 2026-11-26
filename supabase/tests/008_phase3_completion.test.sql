-- Phase 3 completion: evidence key access, job run log, orphan detection.
begin;
\ir _helpers.psql
select * from no_plan();

set local session_replication_role = replica;
delete from public.supply_confirmations;
delete from public.supplier_contacts;
delete from public.farmer_profiles;
delete from public.suppliers;
delete from storage.objects where bucket_id in ('farmer-photos', 'supply-evidence');
set local session_replication_role = origin;

create temporary table actors (label text primary key, user_id uuid);
grant select on actors to authenticated, service_role;
insert into actors values
  ('ops',    tests.create_user('p3c-ops', '{operations_admin}', true)),
  ('viewer', tests.create_user('p3c-viewer', '{viewer}', true)),
  ('super',  tests.create_user('p3c-super', '{super_admin}', true));

insert into public.supply_confirmation_sources (code, label) values ('dev_src', 'DEV') on conflict do nothing;
insert into public.categories (id, code, name) values ('00000000-0000-0000-0000-0000000000c1', 'p3c-cat', 'DEV P3C');
insert into public.products (id, product_code, category_id, name, slug, base_unit)
  values ('00000000-0000-0000-0000-0000000000a1', 'P3C-A', '00000000-0000-0000-0000-0000000000c1', 'DEV P3C A', 'p3c-a', 'kg');
insert into public.suppliers (id, supplier_code, name, supplier_type, status)
  values ('00000000-0000-0000-0000-0000000000f1', 'SAM-FRM-990001', 'DEV P3C Farmer', 'farmer', 'active');
insert into public.farmer_profiles (supplier_id, photo_storage_key)
  values ('00000000-0000-0000-0000-0000000000f1', 'farmers/00000000-0000-0000-0000-0000000000f1/kept.webp');
insert into public.supply_confirmations
  (id, supplier_id, product_id, business_date, quantity, unit, confirmation_source, confirmed_by, confirmed_at, evidence_storage_key)
select '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000a1',
       public.current_business_date() + 1, 1, 'kg', 'dev_src', user_id, now(), 'supply/evidence-kept.webp'
from actors where label = 'ops';

-- Evidence key access
select tests.authenticate_as((select user_id from actors where label = 'ops'));
select is(public.admin_supply_evidence_key('00000000-0000-0000-0000-0000000000e1'), 'supply/evidence-kept.webp',
  'operations can resolve supply evidence keys for signing');
select tests.clear_authentication();
select tests.authenticate_as((select user_id from actors where label = 'viewer'));
select throws_ok($$select public.admin_supply_evidence_key('00000000-0000-0000-0000-0000000000e1')$$, 'PT403', null,
  'viewer never receives evidence keys');
select tests.clear_authentication();

-- Orphan detection (storage rows inserted directly for the test only)
insert into storage.objects (bucket_id, name, created_at) values
  ('farmer-photos', 'farmers/00000000-0000-0000-0000-0000000000f1/kept.webp', now() - interval '3 days'),
  ('farmer-photos', 'farmers/00000000-0000-0000-0000-0000000000f1/orphan-old.webp', now() - interval '3 days'),
  ('farmer-photos', 'farmers/00000000-0000-0000-0000-0000000000f1/orphan-new.webp', now() - interval '10 minutes'),
  ('supply-evidence', 'supply/evidence-kept.webp', now() - interval '3 days'),
  ('supply-evidence', 'supply/evidence-orphan.webp', now() - interval '3 days'),
  ('product-images', 'public-orphan.webp', now() - interval '3 days');

select tests.authenticate_as_service_role();
select results_eq(
  $$select bucket_id, object_name from public.storage_orphan_candidates(86400) order by bucket_id, object_name$$,
  $$values ('farmer-photos'::text, 'farmers/00000000-0000-0000-0000-0000000000f1/orphan-old.webp'::text),
           ('supply-evidence'::text, 'supply/evidence-orphan.webp'::text)$$,
  'only unreferenced private objects past the grace period are candidates (public bucket ignored)'
);
select is((select count(*)::int from public.storage_orphan_candidates(0)), 2,
  'grace period is never shorter than one hour');
select tests.clear_authentication();

select tests.authenticate_as((select user_id from actors where label = 'super'));
select throws_ok($$select * from public.storage_orphan_candidates(86400)$$, '42501', null,
  'clients cannot list orphan candidates');
select tests.clear_authentication();

-- Job run log
select tests.authenticate_as_service_role();
select lives_ok($$insert into public.scheduled_job_runs (job_name, status, finished_at, counts)
  values ('sweep-orphan-objects', 'succeeded', now(), '{"deleted": 2}')$$, 'service role records job runs');
select throws_ok($$insert into public.scheduled_job_runs (job_name, status) values ('x-job', 'failed')$$, '23514', null,
  'finished runs must record finished_at');
select tests.clear_authentication();
select is(tests.visible_rows((select user_id from actors where label = 'super'), 'scheduled_job_runs') > 0, true,
  'super_admin can read job runs');
select is(tests.visible_rows((select user_id from actors where label = 'ops'), 'scheduled_job_runs'), 0::bigint,
  'other staff cannot read job runs');

select * from finish();
rollback;
