import Link from 'next/link';
import { requireWorkspace, allowed } from '@/lib/auth';
import { all, one } from '@/lib/db';
import { requestSupportAction, toggleModuleAction, updateOrganizationAction } from '@/lib/actions/settings';
import { CURRENCIES, COUNTRIES, TIMEZONES, BUSINESS_TYPES, fmtDate } from '@/lib/format';
import { ActionForm } from '@/components/form';
import { Card, PageHeader, Field, EmptyState, Badge, DataRow } from '@/components/ui';

export const dynamic = 'force-dynamic';

const MODULES = [
  { key: 'coworking', label: 'Coworking', body: 'Desks, rooms, bookings and memberships.' },
  { key: 'commercial', label: 'Commercial property', body: 'Units, leases, rent collection.' },
  { key: 'residential', label: 'Residential property', body: 'Apartments, tenants, renewals.' },
  { key: 'crm', label: 'Agency CRM', body: 'Leads, pipeline, agents.' },
  { key: 'development', label: 'Development', body: 'Projects, inventory, buyers.' },
  { key: 'maintenance', label: 'Maintenance', body: 'Tickets, vendors, repairs.' },
  { key: 'finance', label: 'Finance', body: 'Invoices, payments, expenses.' },
];

export default async function SettingsPage() {
  const session = await requireWorkspace();

  if (!allowed(session, 'settings.write')) {
    return (
      <div className="space-y-6">
        <PageHeader title="Settings" subtitle="Organization profile and modules." />
        <EmptyState title="No access" body="Only owners and administrators can change workspace settings." />
      </div>
    );
  }

  const modules = new Set(session.modules ?? []);
  const org = one<Record<string, any>>(`SELECT * FROM organizations WHERE id = ?`, [session.orgId!]);
  const support = all<Record<string, any>>(
    `SELECT * FROM support_requests WHERE org_id = ? ORDER BY created_at DESC LIMIT 10`,
    [session.orgId!],
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" eyebrow="Workspace" subtitle="Business identity, regional formatting and the modules your team sees.">
        <Badge tone="brand">{session.plan ?? 'free'}</Badge>
        <Link href="/app/billing" className="btn btn-sm">Billing & plans</Link>
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Organization profile" subtitle="Used across documents, invoices and portals" className="lg:col-span-2">
          <ActionForm action={updateOrganizationAction} submit="Save profile">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Business name" name="name" defaultValue={session.orgName} required />
              <Field label="Business type" name="business_type" defaultValue={session.businessType ?? 'coworking'} options={BUSINESS_TYPES.map((b) => ({ value: b.value, label: b.label }))} />
              <Field label="Country" name="country" defaultValue={session.country ?? ''} options={COUNTRIES.map((c) => ({ value: c[0], label: c[1] }))} />
              <Field label="Currency" name="currency" defaultValue={session.currency} options={CURRENCIES.map((c) => (typeof c === 'string' ? { value: c, label: c } : c))} />
              <Field label="Timezone" name="timezone" defaultValue={session.timezone} options={TIMEZONES.map((t) => ({ value: t, label: t }))} />
              <Field label="Locale" name="locale" defaultValue={session.locale} options={[
                { value: 'en-US', label: 'English (United States)' },
                { value: 'en-GB', label: 'English (United Kingdom)' },
                { value: 'de-DE', label: 'German' },
                { value: 'fr-FR', label: 'French' },
                { value: 'es-ES', label: 'Spanish' },
                { value: 'pt-PT', label: 'Portuguese' },
                { value: 'ar-AE', label: 'Arabic' },
              ]} />
              <Field label="Website" name="website" defaultValue={org?.website ?? ''} placeholder="https://" />
              <Field label="Address" name="address" defaultValue={org?.address ?? ''} />
            </div>
          </ActionForm>
        </Card>

        <Card title="Workspace summary">
          <div className="space-y-0">
            <DataRow label="Workspace slug" value={<code className="text-[12px]">{session.orgSlug}</code>} />
            <DataRow label="Your role" value={<span className="capitalize">{(session.role ?? 'member').replace(/_/g, ' ')}</span>} />
            <DataRow label="Plan" value={session.plan ?? 'free'} />
            <DataRow label="Currency" value={session.currency} />
            <DataRow label="Timezone" value={session.timezone} />
            <DataRow label="Modules" value={`${modules.size} enabled`} />
          </div>
        </Card>
      </div>

      <Card title="Modules" subtitle="Toggle the operational areas your organization needs." pad={false}>
        <div className="grid gap-0 sm:grid-cols-2">
          {MODULES.map((m) => {
            const on = modules.has(m.key);
            return (
              <div key={m.key} className="flex items-start justify-between gap-4 border-b border-[var(--line)] px-5 py-3.5 last:border-0">
                <div>
                  <p className="text-[13px] font-medium">{m.label}</p>
                  <p className="text-[11.5px] muted">{m.body}</p>
                </div>
                <ActionForm action={toggleModuleAction} submit={on ? 'Disable' : 'Enable'} className="flex items-center" compact>
                  <input type="hidden" name="module" value={m.key} />
                  <Badge tone={on ? 'ok' : 'neutral'}>{on ? 'enabled' : 'off'}</Badge>
                </ActionForm>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Contact support" subtitle="Requests are visible to the platform team only">
          <ActionForm action={requestSupportAction} submit="Send request">
            <Field label="Subject" name="subject" required />
            <Field label="Details" name="body" rows={3} required />
          </ActionForm>
        </Card>
        <Card title="Your requests" pad={false}>
          {support.length === 0 ? (
            <div className="px-5 pb-5"><EmptyState title="No requests yet" /></div>
          ) : (
            <ul className="divide-y divide-[var(--line)]">
              {support.map((s) => (
                <li key={s.id} className="px-5 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[12.5px] font-medium">{s.subject}</p>
                    <Badge tone={s.status === 'resolved' ? 'ok' : s.status === 'open' ? 'warn' : 'neutral'}>{s.status}</Badge>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-[12px] muted">{s.body}</p>
                  <p className="mt-1 text-[11px] muted">{fmtDate(s.created_at, session.locale, session.timezone)}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
