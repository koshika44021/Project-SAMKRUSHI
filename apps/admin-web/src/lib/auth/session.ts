import 'server-only';
import { type AppRole, appRoleSchema, type Capability, capabilities } from '@samkrushi/shared';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export interface StaffSession {
  userId: string;
  email: string;
  fullName: string;
  roles: AppRole[];
  passwordChangeRequired: boolean;
}

/**
 * Resolves the signed-in staff member for this request (cached per render).
 * Uses getUser() so the session is validated by the Auth server, then
 * my_access() so inactive staff and customer-only accounts are rejected.
 */
export const getStaffSession = cache(async (): Promise<StaffSession | null> => {
  const supabase = await createSupabaseServerClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return null;

  const { data: access, error: accessError } = await supabase.rpc('my_access').single();
  if (accessError || !access?.is_active_staff) return null;

  const roles = (access.roles ?? []).flatMap((role) => {
    const parsed = appRoleSchema.safeParse(role);
    return parsed.success && parsed.data !== 'customer' ? [parsed.data] : [];
  });
  if (!capabilities.useDashboard(roles) && !roles.includes('rider')) return null;

  const { data: profile } = await supabase
    .from('staff_profiles')
    .select('full_name')
    .eq('user_id', userData.user.id)
    .single();

  return {
    userId: userData.user.id,
    email: userData.user.email ?? '',
    fullName: profile?.full_name ?? userData.user.email ?? 'Staff',
    roles,
    passwordChangeRequired: userData.user.app_metadata?.password_change_required === true,
  };
});

/** Requires an active dashboard staff session; otherwise signs out and redirects. */
export async function requireStaff(
  options: { allowPasswordChange?: boolean } = {},
): Promise<StaffSession> {
  const session = await getStaffSession();
  if (!session) {
    redirect('/login?reason=signed_out');
  }
  if (session.passwordChangeRequired && !options.allowPasswordChange) {
    redirect('/account/password');
  }
  return session;
}

/** Requires a capability (UI routing); the database enforces the same rule. */
export async function requireCapability(capability: Capability): Promise<StaffSession> {
  const session = await requireStaff();
  if (!capabilities[capability](session.roles)) {
    redirect('/forbidden');
  }
  return session;
}

export function can(session: StaffSession, capability: Capability): boolean {
  return capabilities[capability](session.roles);
}
