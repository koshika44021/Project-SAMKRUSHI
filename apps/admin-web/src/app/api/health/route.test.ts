import { apiSuccessSchema } from '@samkrushi/shared';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { GET } from './route';

const healthSchema = apiSuccessSchema(
  z.object({ status: z.literal('ok'), service: z.string(), time: z.iso.datetime() }),
);

describe('GET /api/health', () => {
  it('returns the shared success envelope with a request id', async () => {
    const response = GET(new Request('http://localhost/api/health'));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');

    const body = healthSchema.parse(await response.json());
    expect(body.data.service).toBe('admin-web');
    expect(response.headers.get('x-request-id')).toBe(body.meta.requestId);
  });

  it('propagates a valid incoming x-request-id', async () => {
    const response = GET(
      new Request('http://localhost/api/health', { headers: { 'x-request-id': 'trace-123' } }),
    );
    const body = healthSchema.parse(await response.json());
    expect(body.meta.requestId).toBe('trace-123');
  });

  it('replaces an oversized incoming request id', async () => {
    const response = GET(
      new Request('http://localhost/api/health', { headers: { 'x-request-id': 'x'.repeat(500) } }),
    );
    const body = healthSchema.parse(await response.json());
    expect(body.meta.requestId).not.toBe('x'.repeat(500));
  });
});
