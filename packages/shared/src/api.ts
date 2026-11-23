import { z } from 'zod';

/**
 * Shared API envelope for Edge Functions and admin server operations
 * (ADR-0003). JSON fields are camelCase; quantities are decimal strings and
 * money is integer paise.
 */

export const API_ERROR_CODES = [
  'VALIDATION_ERROR',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'UNPROCESSABLE',
  'RATE_LIMITED',
  'SERVICE_UNAVAILABLE',
  'INTERNAL_ERROR',
] as const;

export const apiErrorCodeSchema = z.enum(API_ERROR_CODES);
export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;

const HTTP_STATUS_BY_ERROR_CODE: Record<ApiErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE: 422,
  RATE_LIMITED: 429,
  SERVICE_UNAVAILABLE: 503,
  INTERNAL_ERROR: 500,
};

export function httpStatusForErrorCode(code: ApiErrorCode): number {
  return HTTP_STATUS_BY_ERROR_CODE[code];
}

export const requestIdSchema = z.string().min(1).max(128);

export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 25;

/** Query parameters for paginated list endpoints (stable sorting is server-side). */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export const paginationMetaSchema = z.object({
  page: z.int().min(1),
  pageSize: z.int().min(1).max(MAX_PAGE_SIZE),
  totalItems: z.int().nonnegative(),
  totalPages: z.int().nonnegative(),
});
export type PaginationMeta = z.infer<typeof paginationMetaSchema>;

export const responseMetaSchema = z.object({
  requestId: requestIdSchema,
  pagination: paginationMetaSchema.optional(),
});
export type ResponseMeta = z.infer<typeof responseMetaSchema>;

export const fieldErrorSchema = z.object({
  field: z.string(),
  message: z.string(),
});
export type FieldError = z.infer<typeof fieldErrorSchema>;

export const apiErrorSchema = z.object({
  error: z.object({
    code: apiErrorCodeSchema,
    message: z.string(),
    details: z.array(fieldErrorSchema).optional(),
    requestId: requestIdSchema,
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

/** Builds the success-envelope schema for a given payload schema. */
export function apiSuccessSchema<T extends z.ZodType>(data: T) {
  return z.object({ data, meta: responseMetaSchema });
}

/** Builds a schema accepting either the success envelope or the error envelope. */
export function apiResponseSchema<T extends z.ZodType>(data: T) {
  return z.union([apiSuccessSchema(data), apiErrorSchema]);
}

export interface ApiSuccess<T> {
  data: T;
  meta: ResponseMeta;
}

export function ok<T>(data: T, meta: ResponseMeta): ApiSuccess<T> {
  return { data, meta };
}

export function fail(
  code: ApiErrorCode,
  message: string,
  requestId: string,
  details?: FieldError[],
): ApiError {
  return { error: { code, message, requestId, ...(details ? { details } : {}) } };
}

/** Converts a Zod validation failure into field-level error details. */
export function toFieldErrors(error: z.ZodError): FieldError[] {
  return error.issues.map((issue) => ({
    field: issue.path.map(String).join('.'),
    message: issue.message,
  }));
}
