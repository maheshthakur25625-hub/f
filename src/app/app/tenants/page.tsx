import Link from 'next/link';
import { requireWorkspace, allowed } from '@/lib/auth';
import { all, one } from '@/lib/db';
import {
  createDocumentFormAction,
  createLeaseAction,
  createTenantAction,
  endLeaseFormAction,
  renewLeaseFormAction,
  updateTenantAction,
} from '@/lib/actions/leasing';
import { money, fmtDate, todayISO, titleCase } from '@/lib/format';
import { ActionForm, DangerSubmit, GhostSubmit } from '@/components/form';
import { Card, PageHeader, Stat, Field, Badge, StatusBadge, EmptyState } from '@/components/ui';

export const dynamic = 'force-dynamic';

type TenantRow = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  kind: string;
  status: string;
  notes: string | null;
  unit_name: string | null;
  property_name: string | null;
  lease_id: string | null;
  rent_amount: number | null;
  end_date: string | null;
  deposit: number | null;
};

export default async function TenantsPage() {
  const session = await requireWorkspace();
  if (!allowed(session, 'tenants.view')) {
    return (
      <div className="space-y-6">
        <PageHeader title="Tenants & leases" subtitle="Your role does not include tenant records." />
        <EmptyState title="No access" body="Ask a workspace owner or admin for tenant permissions." icon="lock" />
      </div>
    );
  }
  const orgId = session.orgId!;
  const canWrite = allowed(session, 'tenants.write');

  const tenants = all<TenantRow>(
    `SELECT t.id, t.name, t.email, t.phone, t.company, t.kind, t.status, t.notes,
            u.name AS unit_name, p.name AS property_name,
            l.id AS lease_id, l.rent_amount, l.end_date, l.deposit
       FROM tenants t
       LEFT JOIN units u ON u.id = t.unit_id
       LEFT JOIN properties p ON p.id = u.property_id
       LEFT JOIN leases l ON l.tenant_id = t.id AND l.status = 'active'
      WHERE t.org_id = ?
      ORDER BY t.created_at DESC`,
    [orgId],
  );

  const units = all<{ id: string; label: string }>(
    `SELECT u.id, p.name || ' · ' || u.name AS label
       FROM units u JOIN properties p ON p.id = u.property_id
      WHERE u.org_id = ? AND u.status != 'occupied'
      ORDER BY p.name, u.name`,
    [orgId],
  );
  const leaseUnits = all<{ id: string; label: string }>(
    `SELECT u.id, p.name || ' · ' || u.name AS label
       FROM units u JOIN properties p ON p.id = u.property_id
      WHERE u.org_id = ? ORDER BY p.name, u.name`,
    [orgId],
  );

  const activeLeases = tenants.filter((t) => t.lease_id).length;
  const monthlyRent = tenants.reduce((sum, t) => sum + Number(t.rent_amount ?? 0), 0);
  const deposits = tenants.reduce((sum, t) => sum + Number(t.deposit ?? 0), 0);
  const expiring = tenants.filter(
    (t) => t.end_date && t.end_date <= new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tenants & leases"
        eyebrow="Commercial & residential"
        subtitle="Every tenant, active lease, rent schedule and security deposit in this workspace."
      >
        <Badge tone="brand">{tenants.length} tenants</Badge>
        <Badge tone="neutral">{activeLeases} active leases</Badge>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Tenants" value={String(tenants.length)} hint="Across all properties" icon="users" />
        <Stat label="Contracted rent" value={money(monthlyRent, session.currency, session.locale)} hint="Monthly, active leases" icon="wallet" tone="brand" />
        <Stat label="Deposits held" value={money(deposits, session.currency, session.locale)} hint="Security deposits on file" icon="shield" />
        <Stat
          label="Renewals due"
          value={String(expiring.length)}
          hint="Leases ending in 60 days"
          icon="bell"
          tone={expiring.length ? 'warn' : 'neutral'}
        />
      </div>

      {expiring.length > 0 && (
        <Card title="Renewal reminders" subtitle="These leases end within the next 60 days.">
          <ul className="space-y-2 text-sm">
            {expiring.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-amber-50 px-3 py-2 text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
                <span>
                  <strong>{t.name}</strong> — {t.property_name} · {t.unit_name}
                </span>
                <span>ends {fmtDate(t.end_date, session.locale)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <Card title="Tenant register" subtitle="Live from your database" pad={false}>
          {tenants.length === 0 ? (
            <div className="p-6">
              <EmptyState title="No tenants yet" body="Add your first tenant to start tracking leases and rent." icon="users" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  <tr className="border-b border-slate-200 dark:border-slate-800">
                    <th className="px-4 py-3">Tenant</th>
                    <th className="px-4 py-3">Unit</th>
                    <th className="px-4 py-3">Rent</th>
                    <th className="px-4 py-3">Lease ends</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {tenants.map((t) => (
                    <tr key={t.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800/60">
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900 dark:text-white">{t.name}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">{t.email}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                        {t.unit_name ? (
                          <>
                            <div>{t.unit_name}</div>
                            <div className="text-xs text-slate-500 dark:text-slate-400">{t.property_name}</div>
                          </>
                        ) : (
                          <span className="text-slate-400">Unassigned</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                        {t.rent_amount ? money(t.rent_amount, session.currency, session.locale) : '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                        {t.end_date ? fmtDate(t.end_date, session.locale) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={t.lease_id ? 'active' : t.status} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        {canWrite && t.lease_id && (
                          <div className="flex justify-end gap-1">
                            <form action={renewLeaseFormAction}>
                              <input type="hidden" name="id" value={t.lease_id} />
                              <input type="hidden" name="months" value="12" />
                              <GhostSubmit label="Renew 12m" title="Extend this lease by 12 months" />
                            </form>
                            <form action={endLeaseFormAction}>
                              <input type="hidden" name="id" value={t.lease_id} />
                              <DangerSubmit label="End" confirmText="End this lease and release the unit?" />
                            </form>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div className="space-y-6">
          {canWrite && (
            <Card title="Add tenant" subtitle="Creates a tenant profile you can lease a unit to.">
              <ActionForm action={createTenantAction}>
                <Field label="Full name" name="name" required placeholder="Amara Osei" />
                <Field label="Email" name="email" type="email" required placeholder="amara@example.com" />
                <Field label="Phone" name="phone" placeholder="+1 415 555 0132" />
                <Field label="Company" name="company" placeholder="Northwind Studio" />
                <Field
                  label="Type"
                  name="kind"
                  options={[
                    { value: 'residential', label: 'Residential' },
                    { value: 'commercial', label: 'Commercial' },
                  ]}
                />
                <Field label="Unit" name="unit_id" options={[{ value: '', label: 'Unassigned' }, ...units.map((u) => ({ value: u.id, label: u.label }))]} />
                <Field label="Notes" name="notes" rows={2} />
              </ActionForm>
            </Card>
          )}

          {canWrite && (
            <Card title="Start a lease" subtitle="The unit is marked occupied in the same transaction.">
              <ActionForm action={createLeaseAction}>
                <Field
                  label="Unit"
                  name="unit_id"
                  required
                  options={[{ value: '', label: 'Select unit' }, ...leaseUnits.map((u) => ({ value: u.id, label: u.label }))]}
                />
                <Field
                  label="Tenant"
                  name="tenant_id"
                  required
                  options={[{ value: '', label: 'Select tenant' }, ...tenants.map((t) => ({ value: t.id, label: t.name }))]}
                />
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Start" name="start_date" type="date" defaultValue={todayISO()} required />
                  <Field label="End" name="end_date" type="date" required />
                </div>
                <Field label={`Rent (${session.currency})`} name="rent" type="number" step="0.01" min="0" required placeholder="2400" />
                <Field
                  label="Billing period"
                  name="billing_period"
                  options={[
                    { value: 'monthly', label: 'Monthly' },
                    { value: 'quarterly', label: 'Quarterly' },
                    { value: 'yearly', label: 'Yearly' },
                  ]}
                />
                <Field label={`Security deposit (${session.currency})`} name="deposit" type="number" step="0.01" min="0" placeholder="2400" />
              </ActionForm>
            </Card>
          )}
        </div>
      </div>

      {canWrite && tenants.length > 0 && (
        <Card title="Tenant records" subtitle="Update contact details, status and lease documents.">
          <div className="grid gap-4 lg:grid-cols-2">
            {tenants.map((t) => (
              <div key={t.id} className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <div className="font-medium text-slate-900 dark:text-white">{t.name}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {titleCase(t.kind)} · {t.unit_name ?? 'No unit'}
                    </div>
                  </div>
                  <StatusBadge status={t.status} />
                </div>
                <ActionForm action={updateTenantAction}>
                  <input type="hidden" name="id" value={t.id} />
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Name" name="name" defaultValue={t.name} required />
                    <Field label="Email" name="email" type="email" defaultValue={t.email} required />
                    <Field label="Phone" name="phone" defaultValue={t.phone ?? ''} />
                    <Field label="Company" name="company" defaultValue={t.company ?? ''} />
                    <Field
                      label="Status"
                      name="status"
                      defaultValue={t.status}
                      options={[
                        { value: 'active', label: 'Active' },
                        { value: 'notice', label: 'On notice' },
                        { value: 'past', label: 'Past tenant' },
                      ]}
                    />
                    <Field label="Notes" name="notes" defaultValue={t.notes ?? ''} />
                  </div>
                </ActionForm>
                {t.lease_id && (
                  <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                    <span>Lease {t.lease_id}</span>
                    <span>Deposit {money(Number(t.deposit ?? 0), session.currency, session.locale)}</span>
                    <form action={createDocumentFormAction} className="flex items-center gap-2">
                      <input type="hidden" name="entity_type" value="lease" />
                      <input type="hidden" name="entity_id" value={t.lease_id} />
                      <input type="file" name="file" required className="text-xs" />
                      <GhostSubmit label="Upload" />
                    </form>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      <p className="text-xs text-slate-500 dark:text-slate-400">
        Need invoices for these leases? Run the monthly rent run in{' '}
        <Link href="/app/finance" className="text-brand-600 hover:underline dark:text-brand-400">
          Finance
        </Link>
        .
      </p>
    </div>
  );
}
