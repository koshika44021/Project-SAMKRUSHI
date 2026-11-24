-- Audit trail (master §5, WEB_ADMIN §17): automatic capture, request
-- context, PII redaction, append-only, SKU price history.
begin;
\ir _helpers.psql
select * from no_plan();

-- Isolate from data left by E2E/integration runs: clear audit rows inside this
-- rolled-back transaction (replica role bypasses the append-only trigger).
set local session_replication_role = replica;
delete from public.audit_logs;
set local session_replication_role = origin;

create temporary table ctx as select tests.create_user('auditor', '{super_admin}', true) as staff_id;
grant select on ctx to authenticated;

-- Trusted server code sets context for the transaction.
select set_config('app.request_id', 'req-audit-001', true);
select set_config('app.actor_role', 'super_admin', true);
select set_config('app.reason', 'DEV registration', true);
select set_config('app.source', 'admin-web', true);
select set_config('request.jwt.claims', json_build_object('sub', (select staff_id from ctx), 'role', 'authenticated')::text, true);

insert into public.suppliers (id, supplier_code, name, supplier_type, status)
values ('00000000-0000-0000-0000-0000000000f1', 'SAM-FRM-900001', 'DEV Farmer', 'farmer', 'active');
insert into public.farmer_profiles (supplier_id, photo_storage_key)
values ('00000000-0000-0000-0000-0000000000f1', 'farmers/secret-photo-key.webp');
insert into public.supplier_contacts (supplier_id, contact_type, phone_e164, email)
values ('00000000-0000-0000-0000-0000000000f1', 'primary', '+919900001234', 'farmer@example.invalid');

select is(
  (select count(*)::int from public.audit_logs
    where entity_type = 'suppliers' and entity_id = '00000000-0000-0000-0000-0000000000f1' and action = 'suppliers.insert'),
  1, 'supplier creation is audited automatically'
);

select results_eq(
  $$select actor_user_id, actor_role, reason, request_id, source from public.audit_logs where action = 'suppliers.insert'$$,
  $$select (select staff_id from ctx), 'super_admin'::text, 'DEV registration'::text, 'req-audit-001'::text, 'admin-web'::text$$,
  'audit captures actor, role, reason, request id and source'
);

select is(
  (select after_data ->> 'name' from public.audit_logs where action = 'suppliers.insert'),
  'DEV Farmer', 'audit stores the after state'
);

select is(
  (select after_data ->> 'phone_e164' from public.audit_logs where action = 'supplier_contacts.insert'),
  '+91******1234', 'phone numbers are masked in audit'
);
select is(
  (select after_data ->> 'email' from public.audit_logs where action = 'supplier_contacts.insert'),
  '[redacted]', 'emails are redacted in audit'
);
select is(
  (select after_data ->> 'photo_storage_key' from public.audit_logs where action = 'farmer_profiles.insert'),
  '[redacted]', 'private photo keys are redacted in audit'
);
-- Change PII so before_data also carries it, and add an evidence key.
update public.supplier_contacts set phone_e164 = '+919900005678', email = 'farmer2@example.invalid'
  where supplier_id = '00000000-0000-0000-0000-0000000000f1';
update public.farmer_profiles set photo_storage_key = 'farmers/secret-photo-key-2.webp'
  where supplier_id = '00000000-0000-0000-0000-0000000000f1';
insert into public.categories (id, code, name) values ('00000000-0000-0000-0000-0000000000c9', 'dev-ev', 'DEV Evidence Cat');
insert into public.products (id, product_code, category_id, name, slug, base_unit)
  values ('00000000-0000-0000-0000-0000000000a9', 'DEV-EV', '00000000-0000-0000-0000-0000000000c9', 'DEV Evidence', 'dev-ev', 'kg');
insert into public.supply_confirmation_sources (code, label) values ('dev_phone_call', 'DEV phone call');
insert into public.supply_confirmations
  (supplier_id, product_id, business_date, quantity, unit, confirmation_source, confirmed_by, confirmed_at, evidence_storage_key)
  select '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000a9', public.current_business_date() + 1,
         1, 'kg', 'dev_phone_call', staff_id, now(), 'evidence/secret-evidence-key.jpg' from ctx;

select is(
  (select count(*)::int from public.audit_logs
    where coalesce(before_data::text, '') || coalesce(after_data::text, '')
          ~ '(9900001234|9900005678|farmer@example|farmer2@example|secret-photo-key|secret-evidence-key)'),
  0, 'no raw phone, email, photo key or evidence key appears in any before/after audit value'
);
select is(
  (select before_data ->> 'phone_e164' from public.audit_logs where action = 'supplier_contacts.update'),
  '+91******1234', 'before values are masked too'
);

-- Updates capture before/after; no-op updates are not logged.
select set_config('app.reason', 'DEV correction', true);
update public.suppliers set name = 'DEV Farmer Renamed' where id = '00000000-0000-0000-0000-0000000000f1';
select results_eq(
  $$select before_data ->> 'name', after_data ->> 'name', reason from public.audit_logs where action = 'suppliers.update'$$,
  $$values ('DEV Farmer'::text, 'DEV Farmer Renamed'::text, 'DEV correction'::text)$$,
  'updates record before and after values with the reason'
);
update public.suppliers set name = name where id = '00000000-0000-0000-0000-0000000000f1';
select is(
  (select count(*)::int from public.audit_logs where action = 'suppliers.update'), 1,
  'no-op updates are not audited'
);

-- Request id falls back to the PostgREST x-request-id header.
select set_config('app.request_id', '', true);
select set_config('request.headers', '{"x-request-id": "hdr-req-42"}', true);
insert into public.categories (code, name) values ('dev-audit', 'DEV Audit Category');
select is(
  (select request_id from public.audit_logs where action = 'categories.insert' and after_data ->> 'code' = 'dev-audit'),
  'hdr-req-42', 'request id falls back to the x-request-id header'
);
select set_config('request.headers', '{"x-request-id": "' || repeat('x', 500) || '"}', true);
insert into public.categories (code, name) values ('dev-audit-2', 'DEV Audit Category 2');
select is(
  (select char_length(request_id) from public.audit_logs where after_data ->> 'code' = 'dev-audit-2'),
  128, 'oversized request ids are truncated'
);

-- Role changes are audited (privilege escalation trail).
select is(
  (select count(*)::int from public.audit_logs where action = 'user_roles.insert'
     and after_data ->> 'role' = 'super_admin' and after_data ->> 'user_id' = (select staff_id from ctx)::text),
  1, 'role assignments are audited'
);

-- Append-only: even the table owner cannot rewrite history.
select throws_ok($$update public.audit_logs set reason = 'tampered'$$, '42501', null, 'audit rows cannot be updated');
select throws_ok($$delete from public.audit_logs$$, '42501', null, 'audit rows cannot be deleted');
select throws_ok($$truncate public.audit_logs$$, '42501', null, 'audit log cannot be truncated');

select tests.authenticate_as_service_role();
select throws_ok($$update public.audit_logs set reason = 'tampered'$$, '42501', null, 'service_role cannot update audit rows');
select throws_ok($$delete from public.audit_logs$$, '42501', null, 'service_role cannot delete audit rows');
select tests.clear_authentication();

-- SKU price history (master §5, ADR-0006 §5).
select set_config('request.jwt.claims', json_build_object('sub', (select staff_id from ctx), 'role', 'authenticated')::text, true);
select set_config('app.reason', 'DEV initial price', true);
insert into public.categories (id, code, name) values ('00000000-0000-0000-0000-0000000000c1', 'dev-cat', 'DEV Category');
insert into public.products (id, product_code, category_id, name, slug, base_unit)
  values ('00000000-0000-0000-0000-0000000000a1', 'DEV-A', '00000000-0000-0000-0000-0000000000c1', 'DEV A', 'dev-a', 'kg');
insert into public.product_skus (id, product_id, sku_code, label, pack_quantity, sale_unit, price_paise)
  values ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1', 'DEV-A-1KG', '1 kg', 1, 'pack', 1000);
select set_config('app.reason', 'DEV price change', true);
update public.product_skus set price_paise = 1200 where id = '00000000-0000-0000-0000-0000000000b1';
update public.product_skus set label = '1 kg pack' where id = '00000000-0000-0000-0000-0000000000b1';

select results_eq(
  $$select price_paise, previous_price_paise, reason, changed_by from public.sku_price_history
     where sku_id = '00000000-0000-0000-0000-0000000000b1' order by effective_from, price_paise$$,
  $$values (1000::bigint, null::bigint, 'DEV initial price'::text, (select staff_id from ctx)),
           (1200::bigint, 1000::bigint, 'DEV price change'::text, (select staff_id from ctx))$$,
  'price history records every price set/change (not label edits) with actor and reason'
);
select throws_ok($$update public.sku_price_history set price_paise = 1$$, '42501', null, 'price history is append-only');

select * from finish();
rollback;
