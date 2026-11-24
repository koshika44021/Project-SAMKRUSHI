import { appRoleSchema, ROLE_LABELS } from '@samkrushi/shared';
import type { Metadata } from 'next';
import {
  Alert,
  Badge,
  Card,
  formatDateTimeIst,
  PageHeader,
  Table,
  Td,
  Th,
} from '@/components/ui/primitives';
import { requireCapability } from '@/lib/auth/session';
import { staffListSchema } from '@/lib/server/rpc-schemas';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { CreateStaffForm, StaffRowActions } from './staff-forms';

export const metadata: Metadata = { title: 'Staff / Users' };

export default async function StaffPage() {
  const session = await requireCapability('manageStaff');
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('admin_list_staff');
  const parsed = staffListSchema.safeParse(data);

  return (
    <>
      <PageHeader
        title="Staff / Users"
        description="No public registration: staff accounts are created here. Deactivated staff cannot sign in; history is kept."
      />
      <div className="space-y-6">
        <Card title="Add staff member">
          <CreateStaffForm />
        </Card>
        {error || !parsed.success ? (
          <Alert tone="danger">Staff could not be loaded.</Alert>
        ) : (
          <Table caption="Staff">
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Email</Th>
                <Th>Roles</Th>
                <Th>Status</Th>
                <Th>Last sign-in</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {parsed.data.map((s) => {
                const roles = s.roles.flatMap((r) => {
                  const role = appRoleSchema.safeParse(r);
                  return role.success && role.data !== 'customer' ? [role.data] : [];
                });
                return (
                  <tr key={s.userId} data-testid={`staff-row-${s.email}`}>
                    <Td>{s.fullName}</Td>
                    <Td>{s.email}</Td>
                    <Td>{roles.map((r) => ROLE_LABELS[r]).join(', ')}</Td>
                    <Td>
                      {s.isActive ? (
                        <Badge tone="success">Active</Badge>
                      ) : (
                        <span>
                          <Badge>Inactive</Badge>
                          <span className="block text-xs text-slate-500">
                            {s.deactivationReason}
                          </span>
                        </span>
                      )}
                    </Td>
                    <Td>{formatDateTimeIst(s.lastLoginAt)}</Td>
                    <Td>
                      {s.userId === session.userId ? (
                        <span className="text-xs text-slate-500">This is you</span>
                      ) : (
                        <StaffRowActions userId={s.userId} isActive={s.isActive} roles={roles} />
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </div>
    </>
  );
}
