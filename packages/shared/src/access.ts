import { z } from 'zod';

/**
 * Platform roles (master §3, ADR-0005). These mirror `public.app_role`.
 * The helpers below drive UI visibility ONLY — the database and server
 * operations enforce authorization (ADR-0011).
 */
export const APP_ROLES = [
  'customer',
  'super_admin',
  'operations_admin',
  'finance_admin',
  'dispatch_admin',
  'support_agent',
  'rider',
  'viewer',
] as const;
export const appRoleSchema = z.enum(APP_ROLES);
export type AppRole = z.infer<typeof appRoleSchema>;

export const STAFF_ROLES = APP_ROLES.filter(
  (role): role is Exclude<AppRole, 'customer'> => role !== 'customer',
);
export type StaffRole = (typeof STAFF_ROLES)[number];
export const staffRoleSchema = z.enum(STAFF_ROLES as [StaffRole, ...StaffRole[]]);

export const ROLE_LABELS: Record<AppRole, string> = {
  customer: 'Customer',
  super_admin: 'Super admin',
  operations_admin: 'Operations',
  finance_admin: 'Finance',
  dispatch_admin: 'Dispatch',
  support_agent: 'Support',
  rider: 'Rider',
  viewer: 'Viewer (read-only)',
};

const DASHBOARD_ROLES: readonly AppRole[] = [
  'super_admin',
  'operations_admin',
  'finance_admin',
  'dispatch_admin',
  'support_agent',
  'viewer',
];

const hasAny = (roles: readonly AppRole[], allowed: readonly AppRole[]): boolean =>
  roles.some((role) => allowed.includes(role));

/** UI capability map for the MVP (WEB_ADMIN §3). Mirrors the DB role checks. */
export const capabilities = {
  useDashboard: (roles: readonly AppRole[]) => hasAny(roles, DASHBOARD_ROLES),
  viewFarmers: (roles: readonly AppRole[]) =>
    hasAny(roles, ['super_admin', 'operations_admin', 'finance_admin', 'viewer']),
  manageFarmers: (roles: readonly AppRole[]) => hasAny(roles, ['super_admin', 'operations_admin']),
  viewFarmerPhotos: (roles: readonly AppRole[]) =>
    hasAny(roles, ['super_admin', 'operations_admin', 'finance_admin']),
  viewSupply: (roles: readonly AppRole[]) =>
    hasAny(roles, ['super_admin', 'operations_admin', 'viewer']),
  manageSupply: (roles: readonly AppRole[]) => hasAny(roles, ['super_admin', 'operations_admin']),
  viewCatalog: (roles: readonly AppRole[]) =>
    hasAny(roles, ['super_admin', 'operations_admin', 'finance_admin', 'support_agent', 'viewer']),
  manageStaff: (roles: readonly AppRole[]) => hasAny(roles, ['super_admin']),
  viewAudit: (roles: readonly AppRole[]) => hasAny(roles, ['super_admin']),
} as const;
export type Capability = keyof typeof capabilities;
