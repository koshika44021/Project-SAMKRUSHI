'use server';

import {
  staffCreateSchema,
  staffPasswordResetSchema,
  staffRolesChangeSchema,
  staffStatusChangeSchema,
} from '@samkrushi/shared';
import { revalidatePath } from 'next/cache';
import { requireCapability } from '@/lib/auth/session';
import {
  type ActionResult,
  currentRequestId,
  failure,
  rpcFailure,
  validationFailure,
} from '@/lib/server/actions';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/** Effectively permanent Auth ban for deactivated staff (lifted on reactivation). */
const DEACTIVATED_BAN = '876000h';

export async function createStaff(input: unknown): Promise<ActionResult<{ userId: string }>> {
  await requireCapability('manageStaff');
  const parsed = staffCreateSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const v = parsed.data;

  const admin = createSupabaseAdminClient();
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: v.email,
    password: v.temporaryPassword,
    email_confirm: true,
    app_metadata: { staff: true, password_change_required: true },
  });
  if (createError || !created.user) {
    const exists = createError?.status === 422 || /already/i.test(createError?.message ?? '');
    return exists
      ? failure('CONFLICT', 'An account with this email already exists.', {
          fieldErrors: [{ field: 'email', message: 'An account with this email already exists.' }],
        })
      : failure(
          'VALIDATION_ERROR',
          'The account could not be created. Check the temporary password policy.',
          {
            fieldErrors: [
              { field: 'temporaryPassword', message: 'Use a stronger temporary password.' },
            ],
          },
        );
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('admin_register_staff', {
    p_user_id: created.user.id,
    p_full_name: v.fullName,
    p_roles: v.roles,
    p_request_id: await currentRequestId(),
  });
  if (error) {
    await admin.auth.admin.deleteUser(created.user.id);
    return rpcFailure(error);
  }
  revalidatePath('/staff');
  return {
    ok: true,
    data: { userId: created.user.id },
    message:
      'Staff account created. Share the temporary password securely; it must be changed at first sign-in.',
  };
}

export async function changeStaffRoles(input: unknown): Promise<ActionResult<undefined>> {
  await requireCapability('manageStaff');
  const parsed = staffRolesChangeSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('admin_set_staff_roles', {
    p_user_id: parsed.data.userId,
    p_roles: parsed.data.roles,
    p_reason: parsed.data.reason,
    p_request_id: await currentRequestId(),
  });
  if (error) return rpcFailure(error);
  revalidatePath('/staff');
  return { ok: true, data: undefined, message: 'Roles updated.' };
}

export async function changeStaffStatus(input: unknown): Promise<ActionResult<undefined>> {
  await requireCapability('manageStaff');
  const parsed = staffStatusChangeSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const v = parsed.data;
  const requestId = await currentRequestId();

  // 1. Database first: an inactive staff profile fails every role check at once.
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('admin_set_staff_status', {
    p_user_id: v.userId,
    p_is_active: v.isActive,
    p_reason: v.reason,
    p_request_id: requestId,
  });
  if (error) return rpcFailure(error);

  // 2. Auth ban so the account cannot sign in or refresh tokens.
  const admin = createSupabaseAdminClient();
  const { error: banError } = await admin.auth.admin.updateUserById(v.userId, {
    ban_duration: v.isActive ? 'none' : DEACTIVATED_BAN,
  });
  if (banError) {
    revalidatePath('/staff');
    return failure(
      'SERVICE_UNAVAILABLE',
      `The staff profile was ${v.isActive ? 'reactivated' : 'deactivated'}, but the sign-in ${v.isActive ? 'unban' : 'ban'} failed. Retry this action.`,
    );
  }
  await supabase.rpc('admin_record_staff_auth_event', {
    p_user_id: v.userId,
    p_event: v.isActive ? 'auth_unbanned' : 'auth_banned',
    p_reason: v.reason,
    p_request_id: requestId,
  });
  revalidatePath('/staff');
  return {
    ok: true,
    data: undefined,
    message: v.isActive ? 'Staff member reactivated.' : 'Staff member deactivated.',
  };
}

/** Admin-assisted password reset (dev default; founder decision pending). */
export async function resetStaffPassword(input: unknown): Promise<ActionResult<undefined>> {
  const session = await requireCapability('manageStaff');
  const parsed = staffPasswordResetSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const v = parsed.data;
  if (v.userId === session.userId) {
    return failure('CONFLICT', 'Use “Change password” to change your own password.');
  }

  const admin = createSupabaseAdminClient();
  const { data: existing, error: getError } = await admin.auth.admin.getUserById(v.userId);
  if (getError || !existing.user) return failure('NOT_FOUND', 'Staff member not found.');
  const { error } = await admin.auth.admin.updateUserById(v.userId, {
    password: v.temporaryPassword,
    app_metadata: { ...(existing.user.app_metadata ?? {}), password_change_required: true },
  });
  if (error) {
    return failure('VALIDATION_ERROR', 'The temporary password was rejected. Use a stronger one.', {
      fieldErrors: [{ field: 'temporaryPassword', message: 'Use a stronger temporary password.' }],
    });
  }

  const supabase = await createSupabaseServerClient();
  const { error: auditError } = await supabase.rpc('admin_record_staff_auth_event', {
    p_user_id: v.userId,
    p_event: 'password_reset',
    p_reason: v.reason,
    p_request_id: await currentRequestId(),
  });
  if (auditError) return rpcFailure(auditError);
  return {
    ok: true,
    data: undefined,
    message: 'Temporary password set. It must be changed at next sign-in.',
  };
}
