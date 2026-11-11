import { redirect } from 'next/navigation';
import { Sidebar, type NavGroup, type NavItem } from '@/components/sidebar';
import { requireWorkspace, allowed } from '@/lib/auth';
import { ROLES } from '@/lib/rbac';
import type { Permission } from '@/lib/permissions';
import { unreadNotifications } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const session = await requireWorkspace();
  if (!session.onboardingComplete) redirect('/onboarding?step=2');

  const modules = new Set(session.modules);
  const can = (p: Permission) => allowed(session, p);
  const has = (m: string) => modules.size === 0 || modules.has(m);

  const unread = unreadNotifications(session.userId, session.orgId!);

  const groups: NavGroup[] = [
    {
      label: 'Overview',
      items: [
        { href: '/app', label: 'Dashboard', icon: 'grid' },
        ...(can('properties.view') ? [{ href: '/app/properties', label: 'Properties', icon: 'building' as const }] : []),
        ...(can('bookings.view') ? [{ href: '/app/bookings', label: 'Bookings', icon: 'calendar' as const, badge: unread.length ? String(unread.length) : undefined }] : []),
      ],
    },
  ];

  const operations = [];
  if (has('coworking') && can('members.view')) operations.push({ href: '/app/members', label: 'Members', icon: 'users' as const });
  if (can('tenants.view')) operations.push({ href: '/app/tenants', label: 'Tenants & leases', icon: 'home' as const });
  if (has('maintenance') && can('maintenance.view')) operations.push({ href: '/app/maintenance', label: 'Maintenance', icon: 'wrench' as const });
  if (operations.length) groups.push({ label: 'Operations', items: operations });

  const growth = [];
  if (has('crm') && can('crm.view')) growth.push({ href: '/app/crm', label: 'Sales CRM', icon: 'briefcase' as const });
  if (has('projects') && can('projects.view')) growth.push({ href: '/app/projects', label: 'Developments', icon: 'layers' as const });
  if (growth.length) groups.push({ label: 'Growth', items: growth });

  const money = [];
  if (can('finance.view')) money.push({ href: '/app/finance', label: 'Finance', icon: 'receipt' as const });
  if (money.length) groups.push({ label: 'Money', items: money });

  const intelligence = [];
  if (has('ai') && can('ai.use')) intelligence.push({ href: '/app/ai', label: 'AI analyst', icon: 'sparkles' as const });
  if (can('automations.write')) intelligence.push({ href: '/app/automations', label: 'Automations', icon: 'bolt' as const });
  if (intelligence.length) groups.push({ label: 'Intelligence', items: intelligence });

  const settings: NavItem[] = [{ href: '/app/settings', label: 'Settings', icon: 'settings' }];
  if (can('team.write')) settings.push({ href: '/app/team', label: 'Team & roles', icon: 'shield' });
  if (can('billing.write')) settings.push({ href: '/app/billing', label: 'Plan & usage', icon: 'chart' });
  groups.push({ label: 'Workspace', items: settings });

  const roleLabel = ROLES.find((r) => r.value === session.role)?.label ?? 'Member';

  return (
    <div className="min-h-screen lg:pl-[248px]">
      <Sidebar
        groups={groups}
        orgName={session.orgName ?? 'Workspace'}
        plan={session.plan}
        userName={session.name}
        roleLabel={roleLabel}
        isPlatformAdmin={session.isPlatformAdmin}
        businessType={session.businessType}
      />
      <main className="px-4 pb-16 pt-16 sm:px-6 lg:pt-8">{children}</main>
    </div>
  );
}
