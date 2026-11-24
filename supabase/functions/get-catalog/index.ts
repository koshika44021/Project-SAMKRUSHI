import { catalogQuerySchema, toFieldErrors } from '@samkrushi/shared';
import { loadCatalog } from '../_shared/catalog-service.ts';
import { jsonError, jsonOk, log, preflight, requestIdFrom } from '../_shared/http.ts';

/**
 * GET /functions/v1/get-catalog?businessDate=YYYY-MM-DD[&zoneId=&categoryCode=&includeUnavailable=]
 * Public (guest browsing). Returns listable products with per-SKU
 * availabilityStatus + maxOrderable from the shared availability function.
 * Never returns farmer-confirmed quantities (ADR-0003).
 */
Deno.serve(async (req) => {
  const early = preflight(req);
  if (early) return early;
  const requestId = requestIdFrom(req);
  if (req.method !== 'GET') return jsonError(req, requestId, 'VALIDATION_ERROR', 'Use GET.');

  const parsed = catalogQuerySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) {
    return jsonError(
      req,
      requestId,
      'VALIDATION_ERROR',
      'Invalid catalog query.',
      toFieldErrors(parsed.error),
    );
  }

  try {
    const products = await loadCatalog(parsed.data);
    log('info', 'get_catalog', {
      requestId,
      businessDate: parsed.data.businessDate,
      count: products.length,
    });
    return jsonOk(req, requestId, { businessDate: parsed.data.businessDate, products });
  } catch (error) {
    log('error', 'get_catalog_failed', {
      requestId,
      code: (error as { code?: string }).code ?? 'unknown',
    });
    return jsonError(req, requestId, 'INTERNAL_ERROR', 'The catalog is temporarily unavailable.');
  }
});
