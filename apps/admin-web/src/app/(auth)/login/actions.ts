'use server';

import { staffLoginSchema } from '@samkrushi/shared';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { type ActionResult, failure, validationFailure } from '@/lib/server/actions';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const GENERIC_LOGIN_ERROR = 'Invalid email or password.';

const rateLimitSettingSchema = z.object({
  limit: z.int().min(1),
  windowSeconds: z.int().min(1),
});

/** Only allow same-site relative redirects. */
function safeNext(next: unknown): string {
  return typeof next === 'string' && next.startsWith('/') && !next.startsWith('//')
    ? next
    : '/overview';
}

async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'unknown';
}

/**
 * Rate limit FAILED sign-ins beyond Supabase defaults (WEB_ADMIN §3, master
 * §13.7). The limit comes from settings (`rate_limit.staff_login`); when it is
 * not configured, Supabase Auth's built-in limits still apply.
 */
async function loginRateLimit(email: string): Promise<{
  check: () => Promise<{ allowed: boolean; retryAfter: number }>;
  recordFailure: () => Promise<void>;
}> {
  const admin = createSupabaseAdminClient();
  const { data: setting } = await admin
    .from('app_settings')
    .select('value')
    .eq('key', 'rate_limit.staff_login')
    .maybeSingle();
  const parsed = rateLimitSettingSchema.safeParse(setting?.value);
  const args = parsed.success
    ? {
        p_bucket: 'staff_login',
        p_key: `${email}|${await clientIp()}`,
        p_limit: parsed.data.limit,
        p_window_seconds: parsed.data.windowSeconds,
      }
    : null;

  return {
    async check() {
      if (!args) return { allowed: true, retryAfter: 0 };
      const { data, error } = await admin.rpc('rate_limit_status', args).single();
      if (error || !data) return { allowed: true, retryAfter: 0 };
      return { allowed: data.allowed, retryAfter: data.retry_after_seconds };
    },
    async recordFailure() {
      if (args) await admin.rpc('consume_rate_limit', args);
    },
  };
}

export async function signIn(input: unknown, next?: string): Promise<ActionResult<never>> {
  const parsed = staffLoginSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const { email, password } = parsed.data;

  const limiter = await loginRateLimit(email);
  const limit = await limiter.check();
  if (!limit.allowed) {
    return failure('RATE_LIMITED', 'Too many sign-in attempts. Please wait and try again.', {
      details: { retryAfter: limit.retryAfter },
    });
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    await limiter.recordFailure();
    return failure('UNAUTHENTICATED', GENERIC_LOGIN_ERROR);
  }

  // Customers and inactive/role-less staff can authenticate with Supabase but
  // must never reach the dashboard: sign them out with the same generic error.
  const { data: access } = await supabase.rpc('my_access').single();
  if (!access?.is_active_staff) {
    await supabase.auth.signOut({ scope: 'local' });
    await limiter.recordFailure();
    return failure('UNAUTHENTICATED', GENERIC_LOGIN_ERROR);
  }

  await supabase.rpc('record_staff_login');
  redirect(safeNext(next));
}

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  // Revokes this session's refresh token server-side and clears the cookies.
  await supabase.auth.signOut({ scope: 'local' });
  redirect('/login?reason=signed_out');
}
