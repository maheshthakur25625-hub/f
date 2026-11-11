import { requirePortal } from '@/lib/auth';
import { all } from '@/lib/db';
import { portalRequestAction } from '@/lib/actions/portal';
import { fmtDate, titleCase } from '@/lib/format';
import { ActionForm } from '@/components/form';
import { Card, PageHeader, Field, EmptyState, StatusBadge, Badge } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function PortalRequestsPage() {
  const session = await requirePortal();
  const properties = all<Record<string, any>>(`SELECT id, name FROM properties WHERE org_id = ? ORDER BY name`, [session.orgId!]);
  const tickets = all<Record<string, any>>(
    `SELECT t.*, p.name AS property_name FROM maintenance_tickets t
       LEFT JOIN properties p ON p.id = t.property_id
      WHERE t.org_id = ? AND t.created_by = ? ORDER BY t.created_at DESC`,
    [session.orgId!, session.userId],
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Maintenance requests" eyebrow="Support" subtitle="Report an issue — urgent keywords are escalated automatically." />

      <div className="grid gap-4 lg:grid-cols-5">
        <Card title="Report an issue" className="lg:col-span-2">
          <ActionForm action={portalRequestAction} submit="Submit request">
            <Field label="Title" name="title" required placeholder="Air conditioning not working" />
            <Field label="Property" name="property_id" options={properties.map((p) => ({ value: p.id, label: p.name }))} />
            <Field label="Priority" name="priority" defaultValue="medium" options={[
              { value: 'low', label: 'Low' },
              { value: 'medium', label: 'Medium' },
              { value: 'high', label: 'High' },
            ]} />
            <Field label="Details" name="description" rows={4} placeholder="Describe what happened and where." />
          </ActionForm>
        </Card>

        <Card title="Your history" className="lg:col-span-3" pad={false}>
          {tickets.length === 0 ? (
            <div className="px-5 pb-5"><EmptyState title="No requests yet" body="Submitted requests and their status appear here." /></div>
          ) : (
            <ul className="divide-y divide-[var(--line)]">
              {tickets.map((t) => (
                <li key={t.id} className="px-5 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[13px] font-medium">{t.title}</p>
                    <div className="flex items-center gap-2">
                      <Badge tone={t.priority === 'high' ? 'bad' : t.priority === 'low' ? 'neutral' : 'warn'}>{titleCase(t.priority ?? 'medium')}</Badge>
                      <StatusBadge status={t.status} />
                    </div>
                  </div>
                  {t.description && <p className="mt-1 line-clamp-2 text-[12px] muted">{t.description}</p>}
                  <p className="mt-1 text-[11px] muted">
                    {t.property_name ? `${t.property_name} · ` : ''}Opened {fmtDate(t.created_at, session.locale, session.timezone)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
