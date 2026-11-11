import { requireWorkspace, allowed } from '@/lib/auth';
import { all } from '@/lib/db';
import {
  convertLeadAction,
  createDealAction,
  createLeadAction,
  logActivityAction,
  setDealStageAction,
  updateLeadAction,
} from '@/lib/actions/crm';
import { DEAL_STAGES } from '@/lib/deal-stages';
import { money, fmtDate, titleCase, timeAgo, todayISO } from '@/lib/format';
import { ActionForm, GhostSubmit } from '@/components/form';
import { Card, PageHeader, Stat, Field, StatusBadge, EmptyState, Badge, Avatar } from '@/components/ui';

export const dynamic = 'force-dynamic';

const SOURCES = [
  { value: 'website', label: 'Website' },
  { value: 'referral', label: 'Referral' },
  { value: 'portal', label: 'Listing portal' },
  { value: 'walk_in', label: 'Walk-in' },
  { value: 'campaign', label: 'Campaign' },
  { value: 'other', label: 'Other' },
];

export default async function CrmPage() {
  const session = await requireWorkspace();
  const orgId = session.orgId!;
  const cur = session.currency;
  const loc = session.locale;

  if (!allowed(session, 'crm.view')) {
    return (
      <div className="space-y-6">
        <PageHeader title="Agency CRM" subtitle="Leads, pipeline and deals." />
        <EmptyState title="No access" body="Your role does not include CRM visibility." />
      </div>
    );
  }

  const canWrite = allowed(session, 'crm.write');
  const leads = all<Record<string, any>>(
    `SELECT l.*, u.name AS owner_name, p.name AS property_name
       FROM leads l LEFT JOIN users u ON u.id = l.owner_id LEFT JOIN properties p ON p.id = l.property_id
      WHERE l.org_id = ? ORDER BY l.created_at DESC LIMIT 80`,
    [orgId],
  );
  const deals = all<Record<string, any>>(
    `SELECT d.*, l.name AS lead_name, u.name AS owner_name
       FROM deals d LEFT JOIN leads l ON l.id = d.lead_id LEFT JOIN users u ON u.id = d.owner_id
      WHERE d.org_id = ? ORDER BY d.created_at DESC LIMIT 80`,
    [orgId],
  );
  const agents = all<Record<string, any>>(
    `SELECT u.id, u.name, m.role FROM org_members m JOIN users u ON u.id = m.user_id
      WHERE m.org_id = ? AND m.status = 'active' ORDER BY u.name`,
    [orgId],
  );
  const properties = all<Record<string, any>>(`SELECT id, name FROM properties WHERE org_id = ? ORDER BY name`, [orgId]);
  const activities = all<Record<string, any>>(
    `SELECT a.*, u.name AS user_name FROM activities a LEFT JOIN users u ON u.id = a.user_id
      WHERE a.org_id = ? ORDER BY a.created_at DESC LIMIT 15`,
    [orgId],
  );

  const pipelineValue = deals.filter((d) => !['won', 'lost'].includes(d.stage)).reduce((s, d) => s + Number(d.value ?? 0), 0);
  const wonValue = deals.filter((d) => d.stage === 'won').reduce((s, d) => s + Number(d.value ?? 0), 0);
  const openLeads = leads.filter((l) => !['converted', 'lost'].includes(l.status)).length;
  const overdueFollowUps = leads.filter((l) => l.next_follow_up && l.next_follow_up < todayISO() && l.status !== 'converted').length;

  const byStage = DEAL_STAGES.map((stage) => ({
    stage,
    count: deals.filter((d) => d.stage === stage).length,
    value: deals.filter((d) => d.stage === stage).reduce((s, d) => s + Number(d.value ?? 0), 0),
  }));

  return (
    <div className="space-y-6">
      <PageHeader title="Agency CRM" eyebrow="Pipeline" subtitle="Capture leads, assign agents, advance deals and log every conversation.">
        <Badge tone="neutral">{openLeads} open leads</Badge>
        {overdueFollowUps > 0 && <Badge tone="warn">{overdueFollowUps} follow-ups due</Badge>}
      </PageHeader>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Open pipeline" value={money(pipelineValue, cur, loc)} tone="brand" />
        <Stat label="Won value" value={money(wonValue, cur, loc)} tone="ok" />
        <Stat label="Active leads" value={String(openLeads)} />
        <Stat label="Follow-ups overdue" value={String(overdueFollowUps)} tone={overdueFollowUps ? 'bad' : 'neutral'} />
      </div>

      <Card title="Pipeline by stage" pad={false}>
        <div className="grid grid-cols-2 divide-x divide-y divide-[var(--line)] sm:grid-cols-4 xl:grid-cols-8">
          {byStage.map((s) => (
            <div key={s.stage} className="px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide muted">{titleCase(s.stage)}</p>
              <p className="mt-1 text-[15px] font-semibold tabular-nums">{s.count}</p>
              <p className="text-[11px] muted">{money(s.value, cur, loc)}</p>
            </div>
          ))}
        </div>
      </Card>

      {canWrite && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="New lead" subtitle="Assigned leads notify the agent immediately.">
            <ActionForm action={createLeadAction} submit="Create lead">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Name" name="name" required />
                <Field label="Email" name="email" type="email" required />
                <Field label="Phone" name="phone" />
                <Field label="Source" name="source" options={SOURCES} />
                <Field label="Looking for" name="kind" options={[
                  { value: 'buyer', label: 'Buyer' },
                  { value: 'seller', label: 'Seller' },
                  { value: 'tenant', label: 'Tenant' },
                  { value: 'investor', label: 'Investor' },
                ]} />
                <Field label="Agent" name="owner_id" options={[{ value: '', label: '— unassigned —' }, ...agents.map((a) => ({ value: a.id, label: a.name }))]} />
                <Field label="Property of interest" name="property_id" options={[{ value: '', label: '— none —' }, ...properties.map((p) => ({ value: p.id, label: p.name }))]} />
                <Field label="Next follow-up" name="next_follow_up" type="date" />
                <Field label="Notes" name="notes" rows={2} className="sm:col-span-2" />
              </div>
            </ActionForm>
          </Card>

          <Card title="New deal" subtitle="Deals track value from qualification to close.">
            <ActionForm action={createDealAction} submit="Create deal">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Lead" name="lead_id" options={[{ value: '', label: '— none —' }, ...leads.map((l) => ({ value: l.id, label: l.name }))]} />
                <Field label="Title" name="title" required placeholder="3 desks · 12 months" />
                <Field label="Stage" name="stage" options={DEAL_STAGES.map((s) => ({ value: s, label: titleCase(s) }))} />
                <Field label="Value (cents)" name="value" type="number" min={0} />
                <Field label="Property" name="property_id" options={[{ value: '', label: '— none —' }, ...properties.map((p) => ({ value: p.id, label: p.name }))]} />
                <Field label="Owner" name="owner_id" options={[{ value: '', label: '— unassigned —' }, ...agents.map((a) => ({ value: a.id, label: a.name }))]} />
                <Field label="Expected close" name="expected_close" type="date" />
              </div>
            </ActionForm>
          </Card>
        </div>
      )}

      <Card title="Leads" subtitle={`${leads.length} most recent`} pad={false}>
        {leads.length === 0 ? (
          <div className="px-5 pb-5"><EmptyState title="No leads yet" body="Capture your first enquiry to start the pipeline." /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr><th>Lead</th><th>Source</th><th>Agent</th><th>Interest</th><th>Follow-up</th><th>Status</th><th /></tr>
              </thead>
              <tbody>
                {leads.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <div className="flex items-center gap-2">
                        <Avatar name={l.name} size={26} />
                        <div>
                          <div className="font-medium">{l.name}</div>
                          <div className="text-[11.5px] muted">{l.email}</div>
                        </div>
                      </div>
                    </td>
                    <td>{titleCase(l.source ?? '')}</td>
                    <td className="muted">{l.owner_name ?? 'Unassigned'}</td>
                    <td className="muted">{l.property_name ?? titleCase(l.kind ?? '')}</td>
                    <td className={l.next_follow_up && l.next_follow_up < todayISO() && l.status !== 'converted' ? 'text-bad' : ''}>
                      {l.next_follow_up ? fmtDate(l.next_follow_up, loc, session.timezone) : '—'}
                    </td>
                    <td><StatusBadge status={l.status} /></td>
                    <td className="text-right">
                      {canWrite && l.status !== 'converted' && (
                        <ActionForm action={convertLeadAction} submit="Convert" className="flex justify-end" compact>
                          <input type="hidden" name="id" value={l.id} />
                        </ActionForm>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Deals" subtitle="Move a deal forward by changing its stage" pad={false}>
        {deals.length === 0 ? (
          <div className="px-5 pb-5"><EmptyState title="No deals yet" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Deal</th><th>Lead</th><th>Owner</th><th className="text-right">Value</th><th>Close</th><th>Stage</th><th /></tr></thead>
              <tbody>
                {deals.map((d) => (
                  <tr key={d.id}>
                    <td className="font-medium">{d.title}</td>
                    <td className="muted">{d.lead_name ?? '—'}</td>
                    <td className="muted">{d.owner_name ?? 'Unassigned'}</td>
                    <td className="text-right tabular-nums">{money(d.value, cur, loc)}</td>
                    <td>{d.expected_close ? fmtDate(d.expected_close, loc, session.timezone) : '—'}</td>
                    <td><StatusBadge status={d.stage} /></td>
                    <td className="text-right">
                      {canWrite && (
                        <ActionForm action={setDealStageAction} submit="Move" className="flex items-center justify-end gap-2" compact>
                          <input type="hidden" name="id" value={d.id} />
                          <select name="stage" defaultValue={d.stage} className="select h-8 w-auto text-[12px]">
                            {DEAL_STAGES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
                          </select>
                        </ActionForm>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {canWrite && (
          <Card title="Log an interaction" subtitle="Notes and calls are appended to the activity history">
            <ActionForm action={logActivityAction} submit="Log activity">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Related to" name="entity_type" options={[
                  { value: 'lead', label: 'Lead' },
                  { value: 'deal', label: 'Deal' },
                  { value: 'tenant', label: 'Tenant' },
                ]} />
                <Field label="Record" name="entity_id" options={[
                  { value: '', label: '— select —' },
                  ...leads.map((l) => ({ value: l.id, label: `Lead · ${l.name}` })),
                  ...deals.map((d) => ({ value: d.id, label: `Deal · ${d.title}` })),
                ]} />
                <Field label="Type" name="kind" options={[
                  { value: 'call', label: 'Call' },
                  { value: 'email', label: 'Email' },
                  { value: 'meeting', label: 'Meeting' },
                  { value: 'viewing', label: 'Viewing' },
                  { value: 'note', label: 'Note' },
                ]} />
                <Field label="Summary" name="body" rows={2} required className="sm:col-span-2" />
              </div>
            </ActionForm>
          </Card>
        )}
        <Card title="Activity history" pad={false}>
          {activities.length === 0 ? (
            <div className="px-5 pb-5"><EmptyState title="No activity yet" /></div>
          ) : (
            <ul className="divide-y divide-[var(--line)]">
              {activities.map((a) => (
                <li key={a.id} className="flex items-start gap-3 px-5 py-3">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                  <div>
                    <p className="text-[12.5px]">{a.body}</p>
                    <p className="mt-0.5 text-[11px] muted">
                      {titleCase(a.kind ?? 'note')} · {titleCase(a.entity_type ?? '')} · {a.user_name ?? 'System'} · {timeAgo(a.created_at)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
