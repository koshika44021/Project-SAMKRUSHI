import {
  type ApiErrorCode,
  fail,
  httpStatusForErrorCode,
  ok,
  requestIdSchema,
} from '@samkrushi/shared';

/** Shared HTTP helpers for Edge Functions: envelope, request id, restricted CORS, JSON logs. */

export function requestIdFrom(req: Request): string {
  const parsed = requestIdSchema.safeParse(req.headers.get('x-request-id'));
  return parsed.success && /^[\w.:-]+$/.test(parsed.data) ? parsed.data : crypto.randomUUID();
}

function corsHeaders(req: Request): Record<string, string> {
  const allowed = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const origin = req.headers.get('origin');
  if (!origin || !allowed.includes(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type, x-request-id',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    Vary: 'Origin',
  };
}

const BASE_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'X-Content-Type-Options': 'nosniff',
};

export function jsonOk<T>(req: Request, requestId: string, data: T): Response {
  return new Response(JSON.stringify(ok(data, { requestId })), {
    status: 200,
    headers: {
      ...BASE_HEADERS,
      ...corsHeaders(req),
      'X-Request-Id': requestId,
      'Cache-Control': 'no-store',
    },
  });
}

export function jsonError(
  req: Request,
  requestId: string,
  code: ApiErrorCode,
  message: string,
  details?: { field: string; message: string }[],
): Response {
  return new Response(JSON.stringify(fail(code, message, requestId, details)), {
    status: httpStatusForErrorCode(code),
    headers: {
      ...BASE_HEADERS,
      ...corsHeaders(req),
      'X-Request-Id': requestId,
      'Cache-Control': 'no-store',
    },
  });
}

export function preflight(req: Request): Response | null {
  if (req.method !== 'OPTIONS') return null;
  return new Response(null, { status: 204, headers: corsHeaders(req) });
}

/** Structured log line without PII or secrets. */
export function log(
  level: 'info' | 'error',
  msg: string,
  fields: Record<string, unknown> = {},
): void {
  const line = JSON.stringify({ level, msg, ...fields, at: new Date().toISOString() });
  if (level === 'error') console.error(line);
  else console.log(line);
}
