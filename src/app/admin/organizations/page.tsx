import { all } from '@/lib/db';
import { adminSetOrgPlanAction, allPlans } from '@/lib/actions/settings';
import { fmtDate, titleCase } from '@/lib/format';
import { ActionForm } from '@/components/form';
import { Card, PageHeader, Badge, EmptyState } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function AdminOrganizationsPage() {
  const plans = await allPlans();
  const orgs = all<Record<string, any>>(
    `SELECT o.*,
            (SELECT COUNT(*) FROM properties p WHERE p.org_id = o.id) AS properties,
            (SELECT COUNT(*) FROM org_members m WHERE m.org_id = o.id) AS people,
            (SELECT s.status FROM subscriptions s WHERE s.org_id = o.id ORDER BY s.created_at DESC LIMIT 1) AS sub_status,
            (SELECT s.current_period_end FROM subscriptions s WHERE s.org_id = o.id ORDER BY s.created_at DESC LIMIT 1) AS renews
       FROM organizations o ORDER BY o.created_at DESC`,
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Organizations" eyebrow="Tenants" subtitle="Administrative metadata only — customer records remain isolated inside each workspace." />

      <Card pad={false}>
        {orgs.length === 0 ? (
          <div className="px-5 pb-5"><EmptyState title="No organizations" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr><th>Organization</th><th>Type</th><th>Region</th><th>Properties</th><th>People</th><th>Renews</th><th>Plan</th></tr>
              </thead>
              <tbody>
                {orgs.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <div className="font-medium">{o.name}</div>
                      <div className="text-[11px] muted">/{o.slug} · joined {fmtDate(o.created_at)}</div>
                    </td>
                    <td className="muted">{titleCase(o.business_type ?? '')}</td>
                    <td className="muted">{o.country} · {o.currency}</td>
                    <td className="tabular-nums">{o.properties}</td>
                    <td className="tabular-nums">{o.people}</td>
                    <td className="muted">{o.renews ? fmtDate(o.renews) : '—'}</td>
                    <td>
                      <ActionForm action={adminSetOrgPlanAction} submit="Set" compact className="flex items-center gap-2">
                        <input type="hidden" name="org_id" value={o.id} />
                        <select name="plan" defaultValue={o.plan} className="select h-8 w-auto text-[12px]">
                          {plans.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
                        </select>
                      </ActionForm>
                    </td>
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
