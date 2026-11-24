import { productDetailQuerySchema, toFieldErrors } from '@samkrushi/shared';
import { loadCatalog } from '../_shared/catalog-service.ts';
import { jsonError, jsonOk, log, preflight, requestIdFrom } from '../_shared/http.ts';

/**
 * GET /functions/v1/get-product-detail?businessDate=YYYY-MM-DD&(productId=|slug=)
 * Public. Same availability semantics as get-catalog; unavailable products are
 * returned with status "unavailable" so a shared link still renders.
 */
Deno.serve(async (req) => {
  const early = preflight(req);
  if (early) return early;
  const requestId = requestIdFrom(req);
  if (req.method !== 'GET') return jsonError(req, requestId, 'VALIDATION_ERROR', 'Use GET.');

  const parsed = productDetailQuerySchema.safeParse(
    Object.fromEntries(new URL(req.url).searchParams),
  );
  if (!parsed.success) {
    return jsonError(
      req,
      requestId,
      'VALIDATION_ERROR',
      'Invalid product query.',
      toFieldErrors(parsed.error),
    );
  }

  try {
    const [product] = await loadCatalog({
      businessDate: parsed.data.businessDate,
      zoneId: parsed.data.zoneId,
      includeUnavailable: true,
      ...(parsed.data.productId ? { productIds: [parsed.data.productId] } : {}),
      ...(parsed.data.slug ? { slug: parsed.data.slug } : {}),
    });
    if (!product) return jsonError(req, requestId, 'NOT_FOUND', 'Product not found.');
    return jsonOk(req, requestId, { businessDate: parsed.data.businessDate, product });
  } catch (error) {
    log('error', 'get_product_detail_failed', {
      requestId,
      code: (error as { code?: string }).code ?? 'unknown',
    });
    return jsonError(req, requestId, 'INTERNAL_ERROR', 'The product is temporarily unavailable.');
  }
});
