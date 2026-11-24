-- First super_admin bootstrap (ADR-0005 §9).
begin;
\ir _helpers.psql
select plan(6);

-- Start from a state with no super_admin (a dev bootstrap may exist locally).
delete from public.user_roles where role = 'super_admin';

create temporary table u as select tests.create_user('boot') as id, tests.create_user('boot2') as id2;
grant select on u to authenticated, service_role;

select tests.authenticate_as((select id from u));
select throws_ok($$select public.bootstrap_first_super_admin((select id from u), 'DEV Boot')$$,
  '42501', null, 'authenticated users cannot call the bootstrap');
select tests.clear_authentication();

select tests.authenticate_as_service_role();
select lives_ok($$select public.bootstrap_first_super_admin((select id from u), 'DEV Boot')$$,
  'service role bootstraps the first super_admin');
select throws_ok($$select public.bootstrap_first_super_admin((select id2 from u), 'DEV Boot 2')$$,
  'PT409', null, 'a second bootstrap is refused');
select tests.clear_authentication();

select is((select role::text from public.user_roles where user_id = (select id from u)), 'super_admin', 'role granted');
select is((select is_active from public.staff_profiles where user_id = (select id from u)), true, 'staff profile is active');
select is((select source from public.audit_logs where action = 'user_roles.insert'
            and after_data ->> 'user_id' = (select id from u)::text), 'bootstrap', 'bootstrap is audited with its source');

select * from finish();
rollback;
