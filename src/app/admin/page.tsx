import Link from 'next/link';
import { all, one } from '@/lib/db';
import { adminResolveSupportAction } from '@/lib/actions/settings';
import { money, fmtDate, timeAgo, titleCase } from '@/lib/format';
import { ActionForm } from '@/components/form';
import { Card, PageHeader, Stat, Badge, EmptyState } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function AdminOverview() {
  const orgs = Number(one<{ c: number }>(`SELECT COUNT(*) AS c FROM organizations`)?.c ?? 0);
  const users = Number(one<{ c: number }>(`SELECT COUNT(*) AS c FROM users`)?.c ?? 0);
  const activeSubs = Number(one<{ c: number }>(`SELECT COUNT(*) AS c FROM subscriptions WHERE status = 'active'`)?.c ?? 0);
  const mrrRow = one<{ v: number }>(
    `SELECT COALESCE(SUM(CASE WHEN s.period = 'yearly' THEN p.price_yearly / 12 ELSE p.price_monthly END), 0) AS v
       FROM subscriptions s JOIN plans p ON p.code = s.plan WHERE s.status = 'active'`,
  );
  const planMix = all<Record<string, any>>(
    `SELECT COALESCE(s.plan, o.plan) AS plan, COUNT(*) AS c FROM organizations o
       LEFT JOIN subscriptions s ON s.org_id = o.id GROUP BY COALESCE(s.plan, o.plan) ORDER BY c DESC`,
  );
  const support = all<Record<string, any>>(`SELECT * FROM support_requests ORDER BY created_at DESC LIMIT 8`);
  const recent = all<Record<string, any>>(`SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 10`);
  const usage = all<Record<string, any>>(
    `SELECT o.id, o.name, o.plan, o.country,
            (SELECT COUNT(*) FROM properties p WHERE p.org_id = o.id) AS properties,
            (SELECT COUNT(*) FROM org_members m WHERE m.org_id = o.id) AS people
       FROM organizations o ORDER BY o.created_at DESC LIMIT 6`,
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Platform overview" eyebrow="Administration" subtitle="Aggregate platform health only — customer operational data stays inside each workspace.">
        <Link href="/admin/plans" className="btn btn-sm">Manage plans</Link>
      </PageHeader>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Organizations" value={String(orgs)} />
        <Stat label="Registered users" value={String(users)} />
        <Stat label="Active subscriptions" value={String(activeSubs)} tone="ok" />
        <Stat label="Platform MRR" value={money(Number(mrrRow?.v ?? 0), 'USD', 'en-US')} hint="Active subscriptions, normalized monthly" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Plan mix" subtitle="Organizations by current plan" pad={false}>
          {planMix.length === 0 ? (
            <div className="px-5 pb-5"><EmptyState title="No organizations yet" /></div>
          ) : (
            <ul className="divide-y divide-[var(--line)]">
              {planMix.map((p) => (
                <li key={p.plan} className="flex items-center justify-between px-5 py-3">
                  <span className="text-[13px] font-medium">{titleCase(p.plan ?? 'free')}</span>
                  <Badge tone="neutral">{p.c} orgs</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Support requests" pad={false} action={<Link href="/admin/organizations" className="btn btn-sm btn-ghost">Organizations</Link>}>
          {support.length === 0 ? (
            <div className="px-5 pb-5"><EmptyState title="No support requests" /></div>
          ) : (
            <ul className="divide-y divide-[var(--line)]">
              {support.map((s) => (
                <li key={s.id} className="px-5 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[12.5px] font-medium">{s.subject}</p>
                      <p className="mt-0.5 line-clamp-2 text-[11.5px] muted">{s.body}</p>
                      <p className="mt-1 text-[11px] muted">{timeAgo(s.created_at)}</p>
                    </div>
                    {s.status === 'open' ? (
                      <ActionForm action={adminResolveSupportAction} submit="Resolve" compact className="flex shrink-0">
                        <input type="hidden" name="id" value={s.id} />
                        <input type="hidden" name="status" value="resolved" />
                      </ActionForm>
                    ) : (
                      <Badge tone="ok">{s.status}</Badge>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Newest organizations" pad={false}>
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Organization</th><th>Plan</th><th>Properties</th><th>People</th></tr></thead>
              <tbody>
                {usage.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <div className="font-medium">{o.name}</div>
                      <div className="text-[11px] muted">{o.country}</div>
                    </td>
                    <td><Badge tone="brand">{o.plan}</Badge></td>
                    <td className="tabular-nums">{o.properties}</td>
                    <td className="tabular-nums">{o.people}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Latest platform activity" pad={false} action={<Link href="/admin/audit" className="btn btn-sm btn-ghost">Full log</Link>}>
          {recent.length === 0 ? (
            <div className="px-5 pb-5"><EmptyState title="No activity recorded" /></div>
          ) : (
            <ul className="divide-y divide-[var(--line)]">
              {recent.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-[12.5px] font-medium">{a.action}</p>
                    <p className="text-[11px] muted">{a.actor ?? 'system'} · {a.entity_type ?? '—'}</p>
                  </div>
                  <span className="shrink-0 text-[11px] muted">{fmtDate(a.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
