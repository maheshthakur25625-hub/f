import type { Permission, Role } from './permissions';

export const ROLES: { value: Role; label: string; description: string }[] = [
  { value: 'owner', label: 'Organization Owner', description: 'Full access to every module, billing and team settings.' },
  { value: 'super_admin', label: 'Super Admin', description: 'Full operational access except ownership transfer.' },
  { value: 'property_manager', label: 'Property Manager', description: 'Properties, units, leases, tenants and maintenance.' },
  { value: 'coworking_manager', label: 'Coworking Manager', description: 'Desks, rooms, bookings, members and memberships.' },
  { value: 'agent', label: 'Real Estate Agent', description: 'CRM leads, deals, listings and site visits.' },
  { value: 'accountant', label: 'Accountant', description: 'Invoices, payments, expenses and financial reports.' },
  { value: 'maintenance', label: 'Maintenance Staff', description: 'Assigned maintenance tickets and vendor work.' },
  { value: 'member', label: 'Member / Tenant', description: 'Self-service portal access only.' },
];

const ALL: Permission[] = [
  'properties.view',
  'properties.write',
  'workspaces.write',
  'bookings.view',
  'bookings.write',
  'members.view',
  'members.write',
  'memberships.write',
  'tenants.view',
  'tenants.write',
  'leases.write',
  'finance.view',
  'finance.write',
  'finance.confirm',
  'maintenance.view',
  'maintenance.write',
  'crm.view',
  'crm.write',
  'projects.view',
  'projects.write',
  'team.view',
  'team.write',
  'settings.write',
  'billing.write',
  'automations.write',
  'audit.view',
  'documents.write',
  'ai.use',
];

const MATRIX: Record<Role, Permission[]> = {
  owner: ALL,
  super_admin: ALL,
  property_manager: [
    'properties.view',
    'properties.write',
    'workspaces.write',
    'bookings.view',
    'tenants.view',
    'tenants.write',
    'leases.write',
    'maintenance.view',
    'maintenance.write',
    'documents.write',
    'finance.view',
    'members.view',
    'crm.view',
    'projects.view',
    'ai.use',
  ],
  coworking_manager: [
    'properties.view',
    'workspaces.write',
    'bookings.view',
    'bookings.write',
    'members.view',
    'members.write',
    'memberships.write',
    'finance.view',
    'maintenance.view',
    'maintenance.write',
    'documents.write',
    'ai.use',
  ],
  agent: ['properties.view', 'bookings.view', 'crm.view', 'crm.write', 'projects.view', 'tenants.view', 'documents.write', 'ai.use'],
  accountant: ['properties.view', 'tenants.view', 'members.view', 'bookings.view', 'finance.view', 'finance.write', 'finance.confirm', 'audit.view', 'ai.use'],
  maintenance: ['properties.view', 'maintenance.view', 'maintenance.write', 'documents.write'],
  member: [],
};

export function can(role: string | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  const list = MATRIX[role as Role];
  return Boolean(list && list.includes(permission));
}

export function roleLabel(role: string | null | undefined): string {
  return ROLES.find((r) => r.value === role)?.label ?? 'Member';
}

export function permissionsFor(role: string | null | undefined): Permission[] {
  if (!role) return [];
  return MATRIX[role as Role] ?? [];
}
