import { ok, requestIdSchema } from '@samkrushi/shared';

export const dynamic = 'force-dynamic';

const SERVICE_NAME = 'admin-web';

/**
 * Liveness probe. Returns the shared success envelope and never includes
 * secrets, environment values or dependency details.
 */
export function GET(request: Request): Response {
  const incoming = requestIdSchema.safeParse(request.headers.get('x-request-id'));
  const requestId = incoming.success ? incoming.data : crypto.randomUUID();

  const body = ok(
    { status: 'ok' as const, service: SERVICE_NAME, time: new Date().toISOString() },
    { requestId },
  );

  return Response.json(body, {
    status: 200,
    headers: { 'Cache-Control': 'no-store', 'X-Request-Id': requestId },
  });
}
