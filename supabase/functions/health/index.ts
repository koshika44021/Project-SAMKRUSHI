import { serviceClient } from '../_shared/catalog-service.ts';
import { jsonError, jsonOk, preflight, requestIdFrom } from '../_shared/http.ts';

/** Liveness + DB reachability only (master §13.11). No dependency versions, no data. */
Deno.serve(async (req) => {
  const early = preflight(req);
  if (early) return early;
  const requestId = requestIdFrom(req);
  const { error } = await serviceClient().rpc('current_business_date');
  if (error) return jsonError(req, requestId, 'SERVICE_UNAVAILABLE', 'Database unreachable.');
  return jsonOk(req, requestId, {
    status: 'ok',
    service: 'edge-functions',
    time: new Date().toISOString(),
  });
});
