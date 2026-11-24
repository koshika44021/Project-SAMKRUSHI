import 'server-only';
import { type ApiErrorCode, type FieldError, toFieldErrors } from '@samkrushi/shared';
import type { PostgrestError } from '@supabase/supabase-js';
import { headers } from 'next/headers';
import type { z } from 'zod';

/** Result returned by every server action (mirrors the shared API envelope). */
export type ActionResult<T = undefined> =
  | { ok: true; data: T; message?: string }
  | {
      ok: false;
      error: {
        code: ApiErrorCode;
        message: string;
        fieldErrors?: FieldError[];
        /** Extra structured context, e.g. duplicate-phone matches. */
        details?: unknown;
        requestId: string;
      };
    };

export async function currentRequestId(): Promise<string> {
  const id = (await headers()).get('x-request-id');
  return id && id.length <= 128 ? id : crypto.randomUUID();
}

export async function validationFailure(error: z.ZodError): Promise<ActionResult<never>> {
  return {
    ok: false,
    error: {
      code: 'VALIDATION_ERROR',
      message: 'Please correct the highlighted fields.',
      fieldErrors: toFieldErrors(error),
      requestId: await currentRequestId(),
    },
  };
}

export async function failure(
  code: ApiErrorCode,
  message: string,
  extra: { details?: unknown; fieldErrors?: FieldError[] } = {},
): Promise<ActionResult<never>> {
  return { ok: false, error: { code, message, ...extra, requestId: await currentRequestId() } };
}

const SQLSTATE_TO_CODE: Record<string, ApiErrorCode> = {
  PT403: 'FORBIDDEN',
  PT404: 'NOT_FOUND',
  PT409: 'CONFLICT',
  PT422: 'VALIDATION_ERROR',
  '42501': 'FORBIDDEN',
  '23514': 'VALIDATION_ERROR',
  '23505': 'CONFLICT',
  '23503': 'VALIDATION_ERROR',
  '22P02': 'VALIDATION_ERROR',
};

const CONFLICT_MESSAGES: Record<string, string> = {
  version_conflict: 'Someone else changed this record. Reload the page and try again.',
  duplicate_phone: 'This phone number is already used by another farmer.',
  duplicate_active_supply:
    'This farmer already has an active record for this product and date. Edit that record instead.',
};

/**
 * Maps an RPC/PostgREST error to the shared envelope. Database messages are
 * safe, user-facing rule descriptions (no row data); unknown errors become a
 * generic INTERNAL_ERROR and are logged without PII.
 */
export async function rpcFailure(
  error: PostgrestError,
  field?: string,
): Promise<ActionResult<never>> {
  const code = SQLSTATE_TO_CODE[error.code];
  const requestId = await currentRequestId();
  if (!code) {
    console.error(
      JSON.stringify({ level: 'error', msg: 'rpc_failed', sqlstate: error.code, requestId }),
    );
    return {
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Something went wrong. Please try again.',
        requestId,
      },
    };
  }

  let details: unknown;
  if (error.details) {
    try {
      details = JSON.parse(error.details);
    } catch {
      details = undefined;
    }
  }
  const message =
    CONFLICT_MESSAGES[error.message] ??
    (code === 'FORBIDDEN' ? 'You do not have permission to do this.' : error.message);
  const fieldName =
    field ??
    (typeof error.details === 'string' && /^[a-zA-Z]+$/.test(error.details)
      ? error.details
      : undefined);

  return {
    ok: false,
    error: {
      code,
      message,
      details:
        details ?? (error.message in CONFLICT_MESSAGES ? { reason: error.message } : undefined),
      ...(code === 'VALIDATION_ERROR' && fieldName
        ? { fieldErrors: [{ field: fieldName, message }] }
        : {}),
      requestId,
    },
  };
}
