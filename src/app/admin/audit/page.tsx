import { all } from '@/lib/db';
import { fmtDateTime } from '@/lib/format';
import { Card, PageHeader, EmptyState, Badge } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function AdminAuditPage() {
  const logs = all<Record<string, any>>(
    `SELECT a.*, o.name AS org_name FROM audit_logs a LEFT JOIN organizations o ON o.id = a.org_id
      ORDER BY a.created_at DESC LIMIT 200`,
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Audit log" eyebrow="Security" subtitle="Every privileged action is recorded with actor, entity and organization context." />

      <Card pad={false}>
        {logs.length === 0 ? (
          <div className="px-5 pb-5"><EmptyState title="No audit entries" body="Actions performed in the workspace will be recorded here." /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>When</th><th>Action</th><th>Actor</th><th>Entity</th><th>Organization</th></tr></thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id}>
                    <td className="whitespace-nowrap muted">{fmtDateTime(l.created_at)}</td>
                    <td><Badge tone="neutral">{l.action}</Badge></td>
                    <td>{l.actor ?? 'system'}</td>
                    <td className="muted">{l.entity_type ?? '—'}</td>
                    <td className="muted">{l.org_name ?? 'platform'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
