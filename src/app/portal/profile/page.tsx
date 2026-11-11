import { requirePortal } from '@/lib/auth';
import { all, one } from '@/lib/db';
import { portalDocuments, portalProfileAction } from '@/lib/actions/portal';
import { fmtDate, money, titleCase } from '@/lib/format';
import { ActionForm } from '@/components/form';
import { Card, PageHeader, Field, DataRow, EmptyState, StatusBadge, Avatar } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function PortalProfilePage() {
  const session = await requirePortal();
  const user = one<Record<string, any>>(`SELECT * FROM users WHERE id = ?`, [session.userId]);
  const membership = one<Record<string, any>>(
    `SELECT * FROM memberships WHERE org_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 1`,
    [session.orgId!, session.userId],
  );
  const tenant = one<Record<string, any>>(
    `SELECT * FROM tenants WHERE org_id = ? AND email = ? LIMIT 1`,
    [session.orgId!, user?.email ?? ''],
  );
  const lease = tenant
    ? one<Record<string, any>>(
        `SELECT l.*, u.name AS unit_name FROM leases l LEFT JOIN units u ON u.id = l.unit_id WHERE l.org_id = ? AND l.tenant_id = ? ORDER BY l.start_date DESC LIMIT 1`,
        [session.orgId!, tenant.id],
      )
    : null;
  const documents = await portalDocuments(session.orgId!, session.userId);

  return (
    <div className="space-y-6">
      <PageHeader title="Your profile" eyebrow="Account" subtitle="Keep your contact details current so the team can reach you." />

      <div className="grid gap-4 lg:grid-cols-5">
        <Card title="Account details" className="lg:col-span-3">
          <div className="mb-4 flex items-center gap-3">
            <Avatar name={user?.name ?? 'Member'} size={42} />
            <div>
              <p className="text-[14px] font-semibold">{user?.name}</p>
              <p className="text-[12px] muted">{user?.email}</p>
            </div>
          </div>
          <ActionForm action={portalProfileAction} submit="Save changes">
            <Field label="Full name" name="name" defaultValue={user?.name ?? ''} required />
            <Field label="Email" name="email" defaultValue={user?.email ?? ''} disabled hint="Contact your workspace admin to change your email." />
            <Field label="Phone" name="phone" defaultValue={user?.phone ?? ''} disabled hint="Managed by your workspace admin." />
          </ActionForm>
        </Card>

        <div className="space-y-4 lg:col-span-2">
          <Card title="Membership">
            <div className="space-y-0">
              <DataRow label="Plan" value={membership ? membership.plan_name : 'Pay as you go'} />
              <DataRow label="Price" value={membership ? `${money(membership.price, session.currency, session.locale)} / ${membership.period}` : '—'} />
              <DataRow label="Status" value={membership ? <StatusBadge status={membership.status} /> : '—'} />
              <DataRow label="Renews" value={membership ? fmtDate(membership.ends_on, session.locale, session.timezone) : '—'} />
            </div>
          </Card>

          <Card title="Tenancy">
            {tenant ? (
              <div className="space-y-0">
                <DataRow label="Tenant" value={tenant.name} />
                <DataRow label="Unit" value={lease?.unit_name ?? '—'} />
                <DataRow label="Rent" value={lease ? money(lease.rent_amount, session.currency, session.locale) : '—'} />
                <DataRow label="Lease ends" value={lease ? fmtDate(lease.end_date, session.locale, session.timezone) : '—'} />
                <DataRow label="Kind" value={titleCase(tenant.kind)} />
              </div>
            ) : (
              <EmptyState title="No tenancy on file" body="Your workspace has not linked a lease to this account." />
            )}
          </Card>
        </div>
      </div>

      <Card title="Documents" subtitle="Files shared with you by your workspace" pad={false}>
        {documents.length === 0 ? (
          <div className="px-5 pb-5"><EmptyState title="No documents shared" /></div>
        ) : (
          <ul className="divide-y divide-[var(--line)]">
            {documents.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div>
                  <p className="text-[13px] font-medium">{d.name}</p>
                  <p className="text-[11px] muted">{Math.round(Number(d.size ?? 0) / 1024)} KB · {fmtDate(d.created_at, session.locale, session.timezone)}</p>
                </div>
                <a href={`/api/files/${d.id}`} className="btn btn-sm btn-ghost">Download</a>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
