-- =============================================================================
-- DEVELOPMENT-ONLY SEED. Applied by `supabase db reset` / `supabase start`
-- locally. NEVER run against staging or production.
--
-- Everything here is SYNTHETIC and labelled "DEV". The launch catalog,
-- prices, units, thresholds, confirmation sources and rate limits are FOUNDER
-- DECISIONS (docs/business-decisions.md); these rows only make the admin UI
-- and tests usable. Prices are placeholders, not proposals.
-- No suppliers, staff or customers are seeded: create the first super_admin
-- with `pnpm bootstrap:super-admin` (see docs/runbooks/super-admin-bootstrap.md).
-- =============================================================================

-- Supply confirmation sources (placeholder list pending founder review)
insert into public.supply_confirmation_sources (code, label, display_order) values
  ('phone_call', 'Phone call (DEV placeholder)', 1),
  ('in_person',  'In person (DEV placeholder)',  2),
  ('message',    'Message (DEV placeholder)',    3),
  ('other',      'Other (DEV placeholder)',      9)
on conflict (code) do nothing;

-- Categories
insert into public.categories (id, code, name, display_order) values
  ('5eed0000-0000-4000-8000-0000000000c1', 'seed-greens',     'DEV Leafy Greens', 1),
  ('5eed0000-0000-4000-8000-0000000000c2', 'seed-vegetables', 'DEV Vegetables',   2),
  ('5eed0000-0000-4000-8000-0000000000c3', 'seed-fruits',     'DEV Fruits',       3)
on conflict (id) do nothing;

-- Products (base units per spec examples: kg, g, bunch, piece)
insert into public.products
  (id, product_code, category_id, name, slug, description, base_unit, quantity_precision, low_supply_threshold, is_listable, display_order)
values
  ('5eed0000-0000-4000-8000-0000000000a1', 'SEED-GREENS-01', '5eed0000-0000-4000-8000-0000000000c1',
   'DEV Sample Greens A', 'dev-sample-greens-a', 'Synthetic development product.', 'bunch', 0, 10, true, 1),
  ('5eed0000-0000-4000-8000-0000000000a2', 'SEED-VEG-01', '5eed0000-0000-4000-8000-0000000000c2',
   'DEV Sample Vegetable A', 'dev-sample-vegetable-a', 'Synthetic development product.', 'kg', 3, 5, true, 2),
  ('5eed0000-0000-4000-8000-0000000000a3', 'SEED-VEG-02', '5eed0000-0000-4000-8000-0000000000c2',
   'DEV Sample Vegetable B', 'dev-sample-vegetable-b', 'Synthetic development product.', 'kg', 3, null, true, 3),
  ('5eed0000-0000-4000-8000-0000000000a4', 'SEED-FRUIT-01', '5eed0000-0000-4000-8000-0000000000c3',
   'DEV Sample Fruit A', 'dev-sample-fruit-a', 'Synthetic development product.', 'piece', 0, 20, true, 4),
  ('5eed0000-0000-4000-8000-0000000000a5', 'SEED-VEG-03', '5eed0000-0000-4000-8000-0000000000c2',
   'DEV Sample Vegetable C (not listable)', 'dev-sample-vegetable-c', 'Synthetic, hidden from customers.', 'kg', 3, null, false, 5)
on conflict (id) do nothing;

-- Fixed-pack SKUs; price_paise values are DEV placeholders only.
insert into public.product_skus
  (id, product_id, sku_code, label, pack_quantity, sale_unit, price_paise, min_order_packs, max_order_packs, order_step_packs, display_order)
values
  ('5eed0000-0000-4000-8000-0000000000b1', '5eed0000-0000-4000-8000-0000000000a1', 'SEED-GREENS-01-1B', '1 bunch (DEV)',  1,     'bunch', 1000, 1, 5,  1, 1),
  ('5eed0000-0000-4000-8000-0000000000b2', '5eed0000-0000-4000-8000-0000000000a2', 'SEED-VEG-01-500G', '500 g (DEV)',    0.5,   'pack',  1000, 1, 10, 1, 1),
  ('5eed0000-0000-4000-8000-0000000000b3', '5eed0000-0000-4000-8000-0000000000a2', 'SEED-VEG-01-1KG',  '1 kg (DEV)',     1,     'pack',  2000, 1, 10, 1, 2),
  ('5eed0000-0000-4000-8000-0000000000b4', '5eed0000-0000-4000-8000-0000000000a3', 'SEED-VEG-02-250G', '250 g (DEV)',    0.25,  'pack',  1000, 1, 8,  1, 1),
  ('5eed0000-0000-4000-8000-0000000000b5', '5eed0000-0000-4000-8000-0000000000a4', 'SEED-FRUIT-01-6PC','6 pieces (DEV)', 6,     'pack',  3000, 1, 4,  1, 1),
  ('5eed0000-0000-4000-8000-0000000000b6', '5eed0000-0000-4000-8000-0000000000a5', 'SEED-VEG-03-1KG',  '1 kg (DEV)',     1,     'pack',  2000, 1, 10, 1, 1)
on conflict (id) do nothing;

-- Operating settings: DEV placeholders. Production values need ops/founder approval.
insert into public.app_settings (key, value, description) values
  ('rate_limit.staff_login', '{"limit": 5, "windowSeconds": 900}',
   'DEV placeholder: staff login attempts per email+IP per window (production value pending approval).'),
  ('storage.upload_max_bytes', '5242880',
   'DEV placeholder: maximum private upload size (5 MB; founder decision pending).')
on conflict (key) do nothing;
