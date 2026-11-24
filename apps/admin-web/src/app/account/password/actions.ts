'use server';

import { ownPasswordChangeSchema } from '@samkrushi/shared';
import { redirect } from 'next/navigation';
import { requireStaff } from '@/lib/auth/session';
import { type ActionResult, failure, validationFailure } from '@/lib/server/actions';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/** Staff member sets their own password (required after an admin-assisted reset). */
export async function changeOwnPassword(input: unknown): Promise<ActionResult<never>> {
  const session = await requireStaff({ allowPasswordChange: true });
  const parsed = ownPasswordChangeSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.newPassword });
  if (error) {
    return failure(
      'VALIDATION_ERROR',
      'That password cannot be used. Choose a different, stronger password.',
      {
        fieldErrors: [{ field: 'newPassword', message: 'Choose a different, stronger password.' }],
      },
    );
  }

  const admin = createSupabaseAdminClient();
  const { data: current } = await admin.auth.admin.getUserById(session.userId);
  await admin.auth.admin.updateUserById(session.userId, {
    app_metadata: { ...(current.user?.app_metadata ?? {}), password_change_required: false },
  });

  // Force a fresh sign-in so the new session carries updated metadata.
  await supabase.auth.signOut({ scope: 'global' });
  redirect('/login?reason=password_changed');
}
