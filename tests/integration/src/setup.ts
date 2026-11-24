import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/** Helpers for integration tests against the LOCAL stack only. */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY ?? '';

if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(SUPABASE_URL)) {
  throw new Error('Integration tests only run against a local Supabase stack.');
}

export const DOMAIN = 'it.samkrushi.invalid';
export const PASSWORD = 'It-Test-Passw0rd-1';

export const admin = createClient(SUPABASE_URL, SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export const anon = () =>
  createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

/** Creates (or recreates) a user with roles and returns a signed-in client. */
export async function userClient(
  label: string,
  roles: string[],
  options: { staff?: boolean; active?: boolean } = {},
): Promise<{ client: SupabaseClient; userId: string }> {
  const email = `${label}@${DOMAIN}`;
  // Users with audited history cannot be deleted (FKs from created_by etc.), so
  // reuse existing accounts: reset password, upsert profile, replace roles.
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  let userId = list?.users.find((u) => u.email === email)?.id;
  if (userId) {
    const { error } = await admin.auth.admin.updateUserById(userId, {
      password: PASSWORD,
      ban_duration: 'none',
    });
    if (error) throw error;
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
    });
    if (error || !data.user) throw error ?? new Error('createUser failed');
    userId = data.user.id;
  }
  const active = options.active ?? true;
  await admin.from('user_roles').delete().eq('user_id', userId);
  if (options.staff ?? true) {
    const { error: pErr } = await admin.from('staff_profiles').upsert({
      user_id: userId,
      full_name: `IT ${label}`,
      is_active: active,
      deactivated_at: active ? null : new Date().toISOString(),
      deactivation_reason: active ? null : 'IT inactive',
    });
    if (pErr) throw pErr;
  } else {
    await admin.from('staff_profiles').delete().eq('user_id', userId);
  }
  if (roles.length) {
    const { error: rErr } = await admin
      .from('user_roles')
      .insert(roles.map((role) => ({ user_id: userId, role })));
    if (rErr) throw rErr;
  }
  const client = anon();
  const { error: signInError } = await client.auth.signInWithPassword({
    email,
    password: PASSWORD,
  });
  if (signInError) throw signInError;
  return { client, userId };
}

export const functionUrl = (name: string, params: Record<string, string> = {}) =>
  `${SUPABASE_URL}/functions/v1/${name}?${new URLSearchParams(params).toString()}`;

export function uniqueMobile(): string {
  return `9${`${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(-9)}`;
}
