import { createClient } from '@supabase/supabase-js';
import { expect, test as setup } from '@playwright/test';
import { E2E_DOMAIN, E2E_PASSWORD, signIn, storageStateFor, type UserKey, USERS } from './fixtures';

/**
 * Recreates the synthetic E2E accounts on the LOCAL stack and saves a signed-in
 * session for the roles that tests reuse. Never point this at a shared project.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const secret = process.env.SUPABASE_SECRET_KEY ?? '';
if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(url)) {
  throw new Error('E2E setup only runs against a local Supabase stack.');
}
const admin = createClient(url, secret, {
  auth: { autoRefreshToken: false, persistSession: false },
});

setup('recreate e2e accounts', async () => {
  // Users with audited history cannot be deleted (FKs from created_by etc.), so
  // reuse existing E2E accounts: reset password and ban, upsert profile, replace roles.
  const existing = new Map<string, string>();
  for (let page = 1; page < 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    for (const u of data.users)
      if (u.email?.endsWith(`@${E2E_DOMAIN}`)) existing.set(u.email, u.id);
    if (data.users.length < 200) break;
  }

  for (const [, user] of Object.entries(USERS)) {
    let id = existing.get(user.email);
    if (id) {
      const { error } = await admin.auth.admin.updateUserById(id, {
        password: E2E_PASSWORD,
        ban_duration: 'none',
        app_metadata: { password_change_required: false },
      });
      if (error) throw error;
    } else {
      const { data, error } = await admin.auth.admin.createUser({
        email: user.email,
        password: E2E_PASSWORD,
        email_confirm: true,
      });
      if (error || !data.user) throw error ?? new Error('createUser failed');
      id = data.user.id;
    }
    await admin.from('user_roles').delete().eq('user_id', id);
    if ('customer' in user) {
      await admin.from('staff_profiles').delete().eq('user_id', id);
    } else {
      const { error: profileError } = await admin.from('staff_profiles').upsert({
        user_id: id,
        full_name: user.name,
        is_active: user.active,
        deactivated_at: user.active ? null : new Date().toISOString(),
        deactivation_reason: user.active ? null : 'E2E inactive account',
      });
      if (profileError) throw profileError;
    }
    const { error: roleError } = await admin
      .from('user_roles')
      .insert(user.roles.map((role) => ({ user_id: id, role })));
    if (roleError) throw roleError;
  }

  // One fixture farmer so read-only tests never depend on other spec files.
  const { data: fixtureFarmer } = await admin
    .from('suppliers')
    .select('id')
    .eq('supplier_code', 'E2E-FIXTURE-1')
    .maybeSingle();
  if (!fixtureFarmer) {
    const { data: farmer, error: farmerError } = await admin
      .from('suppliers')
      .insert({
        supplier_code: 'E2E-FIXTURE-1',
        name: 'E2E Fixture Farmer',
        supplier_type: 'farmer',
        status: 'active',
      })
      .select('id')
      .single();
    if (farmerError) throw farmerError;
    await admin.from('farmer_profiles').insert({ supplier_id: farmer.id });
    await admin
      .from('supplier_contacts')
      .insert({ supplier_id: farmer.id, contact_type: 'primary', phone_e164: '+919000000001' });
  }

  // Login rate limit: DEV placeholder value from the seed; ensure it exists.
  await admin.from('app_settings').upsert({
    key: 'rate_limit.staff_login',
    value: { limit: 5, windowSeconds: 900 },
    description: 'DEV placeholder: staff login attempts per email+IP per window.',
  });
});

for (const key of ['super', 'ops', 'viewer'] as UserKey[]) {
  setup(`sign in as ${key}`, async ({ page }) => {
    await signIn(page, USERS[key].email);
    await expect(page).toHaveURL(/\/overview/);
    await expect(page.getByTestId('staff-name')).toHaveText(USERS[key].name);
    await page.context().storageState({ path: storageStateFor(key) });
  });
}
