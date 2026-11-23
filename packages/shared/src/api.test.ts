import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  API_ERROR_CODES,
  apiErrorSchema,
  apiResponseSchema,
  apiSuccessSchema,
  fail,
  httpStatusForErrorCode,
  MAX_PAGE_SIZE,
  ok,
  paginationQuerySchema,
  toFieldErrors,
} from './api.ts';

describe('envelope', () => {
  const payload = z.object({ id: z.string() });

  it('builds and validates a success envelope', () => {
    const body = ok({ id: 'abc' }, { requestId: 'req-1' });
    expect(apiSuccessSchema(payload).parse(body)).toEqual(body);
  });

  it('builds and validates an error envelope', () => {
    const body = fail('VALIDATION_ERROR', 'Please correct the highlighted fields.', 'req-2', [
      { field: 'primaryPhone', message: 'Enter a valid Indian phone number.' },
    ]);
    expect(apiErrorSchema.parse(body)).toEqual(body);
  });

  it('omits details when none are given', () => {
    expect(fail('NOT_FOUND', 'Not found', 'req-3').error).not.toHaveProperty('details');
  });

  it('response schema accepts either envelope and rejects anything else', () => {
    const schema = apiResponseSchema(payload);
    expect(schema.safeParse(ok({ id: 'x' }, { requestId: 'r' })).success).toBe(true);
    expect(schema.safeParse(fail('INTERNAL_ERROR', 'oops', 'r')).success).toBe(true);
    expect(schema.safeParse({ data: { id: 'x' } }).success).toBe(false);
    expect(
      schema.safeParse({ error: { code: 'NOPE', message: 'x', requestId: 'r' } }).success,
    ).toBe(false);
  });
});

describe('httpStatusForErrorCode', () => {
  it('maps every code to an HTTP error status', () => {
    for (const code of API_ERROR_CODES) {
      const status = httpStatusForErrorCode(code);
      expect(status).toBeGreaterThanOrEqual(400);
      expect(status).toBeLessThan(600);
    }
    expect(httpStatusForErrorCode('CONFLICT')).toBe(409);
    expect(httpStatusForErrorCode('RATE_LIMITED')).toBe(429);
  });
});

describe('paginationQuerySchema', () => {
  it('applies defaults and coerces query strings', () => {
    expect(paginationQuerySchema.parse({})).toEqual({ page: 1, pageSize: 25 });
    expect(paginationQuerySchema.parse({ page: '3', pageSize: '50' })).toEqual({
      page: 3,
      pageSize: 50,
    });
  });

  it('enforces the maximum page size', () => {
    expect(paginationQuerySchema.safeParse({ pageSize: MAX_PAGE_SIZE + 1 }).success).toBe(false);
    expect(paginationQuerySchema.safeParse({ page: 0 }).success).toBe(false);
  });
});

describe('toFieldErrors', () => {
  it('flattens Zod issues into field paths', () => {
    const result = z.object({ farmer: z.object({ name: z.string().min(1) }) }).safeParse({
      farmer: { name: '' },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(toFieldErrors(result.error)).toEqual([
        { field: 'farmer.name', message: expect.any(String) },
      ]);
    }
  });
});
