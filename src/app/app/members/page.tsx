import { requireWorkspace, allowed } from '@/lib/auth';
import { all } from '@/lib/db';
import {
  assignMembershipAction,
  createMemberAction,
  createMembershipPlanAction,
  setMembershipStatusAction,
} from '@/lib/actions/bookings';
import { money, fmtDate, titleCase, todayISO } from '@/lib/format';
import { ActionForm, GhostSubmit } from '@/components/form';
import { Card, PageHeader, Field, EmptyState, StatusBadge, Badge, Stat, Avatar } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function MembersPage() {
  const session = await requireWorkspace();
  const orgId = session.orgId!;
  const cur = session.currency;
  const loc = session.locale;

  const members = all<{
    id: string;
    name: string;
    email: string;
    role: string;
    membership_id: string | null;
    plan_name: string | null;
    ends_on: string | null;
    membership_status: string | null;
    price: number | null;
    period: string | null;
  }>(
    `SELECT u.id, u.name, u.email, m.role,
            ms.id AS membership_id, ms.plan_name, ms.ends_on, ms.status AS membership_status, ms.price, ms.period
       FROM org_members m
       JOIN users u ON u.id = m.user_id
       LEFT JOIN memberships ms ON ms.user_id = u.id AND ms.org_id = m.org_id AND ms.status = 'active'
      WHERE m.org_id = ? AND m.status = 'active'
      ORDER BY (ms.id IS NULL), u.name`,
    [orgId],
  );

  const plans = all<{ id: string; name: string; price: number; period: string; room_hours: number; day_passes: number; active: number; subscribers: number }>(
    `SELECT p.*, (SELECT COUNT(*) FROM memberships m WHERE m.plan_id = p.id AND m.status = 'active') AS subscribers
       FROM membership_plans p WHERE p.org_id = ? ORDER BY p.price`,
    [orgId],
  );

  const mrr = all<{ s: number }>(
    `SELECT COALESCE(SUM(CASE WHEN period = 'yearly' THEN price / 12 WHEN period = 'weekly' THEN price * 4 ELSE price END),0) AS s
       FROM memberships WHERE org_id = ? AND status = 'active'`,
    [orgId],
  )[0]?.s ?? 0;

  const activeCount = members.filter((m) => m.membership_id).length;
  const expiring = members.filter((m) => m.ends_on && m.ends_on <= new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10));
  const canWrite = allowed(session, 'members.write');
  const canPlans = allowed(session, 'memberships.write');

  return (
    <div className="mx-auto max-w-[1320px]">
      <PageHeader
        eyebrow="Community"
        title="Members & memberships"
        subtitle="Recurring revenue, plans and expiry tracking for every person using your spaces."
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Active memberships" value={String(activeCount)} hint={`${members.length} people in workspace`} tone="brand" />
        <Stat label="Membership MRR" value={money(mrr, cur, loc)} hint="Normalised to monthly" />
        <Stat label="Expiring soon" value={String(expiring.length)} hint="Within 30 days" tone={expiring.length ? 'warn' : 'ok'} />
        <Stat label="Plans live" value={String(plans.filter((p) => p.active).length)} hint={`${plans.length} configured`} />
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1fr_360px]">
        <div className="space-y-3">
          <Card title="People" subtitle="Members with their current plan">
            {members.length ? (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Member</th>
                      <th>Role</th>
                      <th>Plan</th>
                      <th>Renews</th>
                      {canPlans && <th />}
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((m) => (
                      <tr key={m.id}>
                        <td>
                          <div className="flex items-center gap-2">
                            <Avatar name={m.name} size={26} />
                            <div className="min-w-0">
                              <p className="truncate text-[12.5px] font-semibold">{m.name}</p>
                              <p className="truncate text-[11px] muted">{m.email}</p>
                            </div>
                          </div>
                        </td>
                        <td><Badge>{titleCase(m.role)}</Badge></td>
                        <td>
                          {m.plan_name ? (
                            <span className="text-[12.5px]">
                              <span className="font-medium">{m.plan_name}</span>
                              <span className="muted"> · {money(Number(m.price ?? 0), cur, loc)}/{m.period}</span>
                            </span>
                          ) : (
                            <span className="text-[11.5px] muted">No active plan</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap text-[12px]">
                          {m.ends_on ? fmtDate(m.ends_on, loc, session.timezone) : '—'}
                          {m.membership_status && <span className="ml-1.5"><StatusBadge status={m.membership_status} /></span>}
                        </td>
                        {canPlans && (
                          <td className="text-right">
                            {m.membership_id ? (
                              <ActionForm action={setMembershipStatusAction} compact submit="" className="inline">
                                <input type="hidden" name="id" value={m.membership_id} />
                                <input type="hidden" name="status" value="cancelled" />
                                <GhostSubmit label="End plan" />
                              </ActionForm>
                            ) : (
                              <ActionForm action={assignMembershipAction} compact submit="" className="flex items-center justify-end gap-1">
                                <input type="hidden" name="user_id" value={m.id} />
                                <input type="hidden" name="starts_on" value={todayISO()} />
                                <select name="plan_id" className="select !py-1 !text-[11.5px]" required>
                                  {plans.filter((p) => p.active).map((p) => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                  ))}
                                </select>
                                <GhostSubmit label="Assign" />
                              </ActionForm>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState title="No members yet" body="Add members or invite your team to start billing memberships." />
            )}
          </Card>

          <Card title="Membership plans" subtitle="Packages available to your community">
            {plans.length ? (
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {plans.map((p) => (
                  <div key={p.id} className="rounded-lg border border-[var(--line)] p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[13px] font-semibold">{p.name}</p>
                      <Badge tone={p.active ? 'ok' : 'neutral'}>{p.active ? 'Live' : 'Paused'}</Badge>
                    </div>
                    <p className="mt-1 text-[12px] muted">
                      {money(p.price, cur, loc)} / {p.period} · {p.subscribers} member{p.subscribers === 1 ? '' : 's'}
                    </p>
                    <p className="mt-1 text-[11.5px] muted">
                      {p.room_hours} room hours · {p.day_passes} day passes included
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="No plans" body="Create a membership package to start recurring billing." />
            )}
          </Card>
        </div>

        <div className="space-y-3">
          {canPlans && (
            <Card title="New membership plan" subtitle="Defines recurring member value">
              <ActionForm action={createMembershipPlanAction} submit="Create plan">
                <Field label="Plan name" name="name" placeholder="Resident Pro" required />
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Price" name="price" type="number" min={0} step="0.01" required />
                  <Field
                    label="Period"
                    name="period"
                    options={[
                      { value: 'monthly', label: 'Monthly' },
                      { value: 'yearly', label: 'Yearly' },
                      { value: 'weekly', label: 'Weekly' },
                      { value: 'daily', label: 'Day pass' },
                    ]}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Room hours" name="room_hours" type="number" min={0} defaultValue={0} />
                  <Field label="Day passes" name="day_passes" type="number" min={0} defaultValue={0} />
                </div>
                <Field label="Description" name="description" rows={2} placeholder="Dedicated desk, 10 room hours, printing." />
              </ActionForm>
            </Card>
          )}

          {canWrite && (
            <Card title="Add a member" subtitle="Creates portal access instantly">
              <ActionForm action={createMemberAction} submit="Add member">
                <Field label="Full name" name="name" placeholder="Noor Haddad" required />
                <Field label="Email" name="email" type="email" placeholder="noor@company.com" required />
                <Field label="Job title" name="title" placeholder="Founder" />
                <p className="text-[11px] muted">
                  A temporary password is generated and shown once so the member can sign in to the portal.
                </p>
              </ActionForm>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
