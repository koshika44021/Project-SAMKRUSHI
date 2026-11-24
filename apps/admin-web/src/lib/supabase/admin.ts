import 'server-only';
import type { Database } from '@samkrushi/shared/database';
import { createClient } from '@supabase/supabase-js';
import { publicEnv } from '@/lib/env';

/**
 * Service-role client. SERVER-ONLY: used for the Auth admin API (create/ban
 * staff, temporary passwords), private storage (upload, signed URLs, delete)
 * and the rate limiter. Never import this from client components.
 */
export function createSupabaseAdminClient() {
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) {
    throw new Error('SUPABASE_SECRET_KEY is not configured');
  }
  return createClient<Database>(publicEnv().NEXT_PUBLIC_SUPABASE_URL, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
