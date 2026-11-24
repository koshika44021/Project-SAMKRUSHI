#!/usr/bin/env node
// One-time creation of the FIRST super_admin (ADR-0005 §9).
//
// Credentials come only from the environment; nothing is committed or printed:
//   SUPABASE_URL                 e.g. http://127.0.0.1:54321
//   SUPABASE_SECRET_KEY          service-role / secret key (server-only!)
//   BOOTSTRAP_ADMIN_EMAIL
//   BOOTSTRAP_ADMIN_PASSWORD     must satisfy the Auth password policy
//   BOOTSTRAP_ADMIN_NAME
//
// Refuses (exit 1) if any super_admin already exists. Usage:
//   pnpm bootstrap:super-admin            (reads the variables above)
//   pnpm bootstrap:super-admin --env-file=apps/admin-web/.env.local
import { createClient } from '@supabase/supabase-js';

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`Missing required environment variable ${name}.`);
    process.exit(1);
  }
  return value;
}

const url = requireEnv('SUPABASE_URL');
const secretKey = requireEnv('SUPABASE_SECRET_KEY');
const email = requireEnv('BOOTSTRAP_ADMIN_EMAIL').toLowerCase();
const password = requireEnv('BOOTSTRAP_ADMIN_PASSWORD');
const fullName = requireEnv('BOOTSTRAP_ADMIN_NAME');

const admin = createClient(url, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { count, error: countError } = await admin
  .from('user_roles')
  .select('id', { count: 'exact', head: true })
  .eq('role', 'super_admin');
if (countError) {
  console.error(`Could not check existing super_admins: ${countError.message}`);
  process.exit(1);
}
if ((count ?? 0) > 0) {
  console.error(
    'A super_admin already exists. Bootstrap refused; add staff from the admin dashboard.',
  );
  process.exit(1);
}

const { data: created, error: createError } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  app_metadata: { staff: true },
});
if (createError || !created.user) {
  console.error(`Could not create the Auth user: ${createError?.message ?? 'unknown error'}`);
  process.exit(1);
}

const { error: rpcError } = await admin.rpc('bootstrap_first_super_admin', {
  p_user_id: created.user.id,
  p_full_name: fullName,
});
if (rpcError) {
  // Roll back the Auth user so a retry starts clean.
  await admin.auth.admin.deleteUser(created.user.id);
  console.error(`Bootstrap failed and was rolled back: ${rpcError.message}`);
  process.exit(1);
}

console.warn(
  `First super_admin created for ${email}. Store the password in your password manager.`,
);
