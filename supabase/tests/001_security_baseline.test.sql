-- Security baseline: RLS everywhere, no client write privileges, pinned
-- search_path on privileged functions, private schema closed to anon.
begin;
\ir _helpers.psql
select plan(14);

select is(
  (select count(*)::int from pg_tables where schemaname = 'public' and not rowsecurity),
  0,
  'every table in public has row level security enabled'
);

select is(
  (select coalesce(string_agg(table_name || ':' || privilege_type, ', '), '')
     from information_schema.role_table_grants
    where table_schema = 'public' and grantee = 'anon'),
  '',
  'anon has no privileges on any public table'
);

select is(
  (select coalesce(string_agg(table_name || ':' || privilege_type, ', '), '')
     from information_schema.role_table_grants
    where table_schema = 'public' and grantee = 'authenticated'
      and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')),
  '',
  'authenticated has no write privileges on public tables (mutations go through trusted server code)'
);

select is(
  (select coalesce(string_agg(n.nspname || '.' || p.proname, ', '), '')
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private')
      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c in ('search_path=""', 'search_path=')) ),
  '',
  'every function in public/private pins an EMPTY search_path'
);

select is(
  (select coalesce(string_agg(n.nspname || '.' || p.proname, ', '), '')
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private')
      and (has_function_privilege('anon', p.oid, 'execute')
           or exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                      where a.grantee = 0 and a.privilege_type = 'EXECUTE'))),
  '',
  'no function in public/private is executable by PUBLIC or anon'
);

select is(
  (select coalesce(string_agg(table_name || ':' || grantee, ', '), '')
     from information_schema.role_table_grants
    where table_schema = 'public' and privilege_type = 'TRUNCATE'
      and grantee in ('anon', 'authenticated', 'service_role', 'PUBLIC')),
  '',
  'no API role holds TRUNCATE on any public table'
);

select is(
  (select coalesce(string_agg(table_name || '.' || column_name, ', '), '')
     from information_schema.column_privileges
    where table_schema = 'public' and grantee in ('anon', 'PUBLIC')),
  '',
  'anon/PUBLIC hold no column privileges'
);

select is(
  (select coalesce(string_agg(table_name || '.' || column_name, ', '), '')
     from information_schema.column_privileges
    where table_schema = 'public' and grantee = 'authenticated'
      and column_name in ('photo_storage_key', 'evidence_storage_key')),
  '',
  'no client can read private storage keys'
);

select ok(not has_schema_privilege('anon', 'private', 'usage'), 'anon cannot use the private schema');

select ok(
  not has_function_privilege('anon', 'public.product_availability(date, uuid, uuid[])', 'execute'),
  'anon cannot execute product_availability'
);
select ok(
  not has_function_privilege('anon', 'public.sku_availability(date, uuid, uuid[])', 'execute'),
  'anon cannot execute sku_availability'
);
select ok(
  not has_function_privilege('anon', 'public.supplier_contact_summaries(uuid[])', 'execute'),
  'anon cannot execute supplier_contact_summaries'
);
select ok(
  not has_function_privilege('anon', 'public.my_access()', 'execute'),
  'anon cannot execute my_access'
);

select is(
  (select count(*)::int from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'audit_logs'
      and grantee in ('service_role', 'authenticated')
      and privilege_type in ('UPDATE', 'DELETE', 'TRUNCATE')),
  0,
  'no role holds UPDATE/DELETE/TRUNCATE on audit_logs'
);

select * from finish();
rollback;
