import { createClient } from '@supabase/supabase-js';
import {
  buildCatalogProducts,
  type CatalogProduct,
  type CatalogSourceProduct,
  type SkuAvailabilityRow,
} from '@samkrushi/shared';

/**
 * Reads the catalog with the service role (customers never query tables
 * directly) and combines it with the single shared availability function.
 */
export function serviceClient() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('Supabase service configuration missing');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function imageUrl(key: string): string {
  const base = (Deno.env.get('PUBLIC_SUPABASE_URL') ?? Deno.env.get('SUPABASE_URL') ?? '').replace(
    /\/$/,
    '',
  );
  return `${base}/storage/v1/object/public/product-images/${key.split('/').map(encodeURIComponent).join('/')}`;
}

const PRODUCT_SELECT =
  'id, product_code, slug, name, local_name, description, base_unit, is_active, is_listable, display_order, ' +
  'category:categories(code, name, is_active), ' +
  'images:product_images(storage_key, alt_text, is_primary, display_order), ' +
  'skus:product_skus(id, sku_code, label, sale_unit, min_order_packs, order_step_packs, is_active, display_order)';

export async function loadCatalog(options: {
  businessDate: string;
  zoneId?: string | undefined;
  productIds?: string[];
  slug?: string;
  includeUnavailable?: boolean | undefined;
  categoryCode?: string | undefined;
}): Promise<CatalogProduct[]> {
  const db = serviceClient();

  let productQuery = db
    .from('products')
    .select(PRODUCT_SELECT)
    .eq('is_active', true)
    .eq('is_listable', true);
  if (options.productIds) productQuery = productQuery.in('id', options.productIds);
  if (options.slug) productQuery = productQuery.eq('slug', options.slug);
  const { data: products, error: productError } = await productQuery;
  if (productError) throw productError;
  const source = (products ?? []) as unknown as CatalogSourceProduct[];
  if (source.length === 0) return [];

  const { data: availability, error: availabilityError } = await db.rpc('sku_availability', {
    p_business_date: options.businessDate,
    ...(options.zoneId ? { p_zone_id: options.zoneId } : {}),
    p_product_ids: source.map((p) => p.id),
  });
  if (availabilityError) throw availabilityError;

  return buildCatalogProducts(source, (availability ?? []) as SkuAvailabilityRow[], {
    imageUrl,
    includeUnavailable: options.includeUnavailable,
    categoryCode: options.categoryCode,
  });
}
