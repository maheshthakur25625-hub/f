import Link from 'next/link';
import { requireWorkspace, allowed } from '@/lib/auth';
import { all } from '@/lib/db';
import { addTicketNoteAction, createTicketAction, updateTicketAction } from '@/lib/actions/maintenance';
import { money, fmtDate, titleCase, timeAgo } from '@/lib/format';
import { ActionForm, GhostSubmit } from '@/components/form';
import { Card, PageHeader, Stat, Field, StatusBadge, EmptyState, Badge } from '@/components/ui';

export const dynamic = 'force-dynamic';

const PRIORITIES = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

const STATUSES = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'on_hold', label: 'On hold' },
  { value: 'completed', label: 'Completed' },
];

export default async function MaintenancePage() {
  const session = await requireWorkspace();
  const orgId = session.orgId!;
  const cur = session.currency;
  const loc = session.locale;

  if (!allowed(session, 'maintenance.view')) {
    return (
      <div className="space-y-6">
        <PageHeader title="Maintenance" subtitle="Tickets, vendors and repairs." />
        <EmptyState title="No access" body="Your role does not include maintenance visibility." />
      </div>
    );
  }

  const canWrite = allowed(session, 'maintenance.write');
  const tickets = all<Record<string, any>>(
    `SELECT t.*, p.name AS property_name, u.name AS unit_name, v.name AS vendor_name
       FROM maintenance_tickets t
       LEFT JOIN properties p ON p.id = t.property_id
       LEFT JOIN units u ON u.id = t.unit_id
       LEFT JOIN vendors v ON v.id = t.vendor_id
      WHERE t.org_id = ?
      ORDER BY CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
               t.created_at DESC
      LIMIT 60`,
    [orgId],
  );
  const properties = all<Record<string, any>>(`SELECT id, name FROM properties WHERE org_id = ? AND status != 'archived' ORDER BY name`, [orgId]);
  const units = all<Record<string, any>>(`SELECT id, name, property_id FROM units WHERE org_id = ? ORDER BY name`, [orgId]);
  const vendors = all<Record<string, any>>(`SELECT id, name FROM vendors WHERE org_id = ? ORDER BY name`, [orgId]);
  const staff = all<Record<string, any>>(
    `SELECT u.id, u.name FROM org_members m JOIN users u ON u.id = m.user_id WHERE m.org_id = ? AND m.status = 'active' ORDER BY u.name`,
    [orgId],
  );
  const notes = all<Record<string, any>>(
    `SELECT a.*, u.name AS user_name FROM activities a LEFT JOIN users u ON u.id = a.user_id
      WHERE a.org_id = ? AND a.entity_type = 'maintenance_ticket' ORDER BY a.created_at DESC LIMIT 12`,
    [orgId],
  );

  const open = tickets.filter((t) => t.status === 'open').length;
  const progress = tickets.filter((t) => t.status === 'in_progress').length;
  const urgent = tickets.filter((t) => t.priority === 'urgent' && t.status !== 'completed').length;
  const spend = tickets.reduce((sum, t) => sum + Number(t.cost ?? 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader title="Maintenance" eyebrow="Operations" subtitle="Tickets across every property, prioritised and assigned.">
        <Badge tone="neutral">{tickets.length} tickets</Badge>
      </PageHeader>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Open" value={String(open)} tone={open > 0 ? 'warn' : 'neutral'} />
        <Stat label="In progress" value={String(progress)} tone="brand" />
        <Stat label="Urgent unresolved" value={String(urgent)} tone={urgent > 0 ? 'bad' : 'neutral'} />
        <Stat label="Recorded spend" value={money(spend, cur, loc)} />
      </div>

      {canWrite && (
        <Card title="New ticket" subtitle="Priority is suggested from the description, then saved with the ticket.">
          <ActionForm action={createTicketAction} submit="Create ticket">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Title" name="title" required placeholder="Air conditioning not cooling" />
              <Field label="Property" name="property_id" options={[{ value: '', label: '— select —' }, ...properties.map((p) => ({ value: p.id, label: p.name }))]} />
              <Field label="Unit" name="unit_id" options={[{ value: '', label: '— none —' }, ...units.map((u) => ({ value: u.id, label: u.name }))]} />
              <Field label="Priority" name="priority" options={PRIORITIES} defaultValue="medium" />
              <Field label="Assign to" name="assignee_id" options={[{ value: '', label: '— unassigned —' }, ...staff.map((s) => ({ value: s.id, label: s.name }))]} />
              <Field label="Vendor" name="vendor_id" options={[{ value: '', label: '— none —' }, ...vendors.map((v) => ({ value: v.id, label: v.name }))]} />
              <Field label="Description" name="description" rows={3} className="sm:col-span-2 lg:col-span-3" placeholder="What is wrong, access notes, tenant contact…" />
            </div>
          </ActionForm>
        </Card>
      )}

      <Card title="Ticket queue" subtitle="Ordered by priority then recency" pad={false}>
        {tickets.length === 0 ? (
          <div className="px-5 pb-5">
            <EmptyState title="No maintenance tickets" body="Tickets raised by tenants and members appear here." action={<Link href="/app/properties" className="btn btn-sm">Properties</Link>} />
          </div>
        ) : (
          <div className="divide-y divide-[var(--line)]">
            {tickets.map((t) => (
              <div key={t.id} className="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[13.5px] font-semibold">{t.title}</p>
                    <StatusBadge status={t.status} />
                    <Badge tone={t.priority === 'urgent' ? 'bad' : t.priority === 'high' ? 'warn' : 'neutral'}>{t.priority}</Badge>
                  </div>
                  <p className="mt-1 line-clamp-2 max-w-2xl text-[12.5px] muted">{t.description || 'No description provided.'}</p>
                  <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] muted">
                    <span>{t.property_name ?? 'No property'}{t.unit_name ? ` · ${t.unit_name}` : ''}</span>
                    {t.vendor_name && <span>Vendor: {t.vendor_name}</span>}
                    {t.cost ? <span>Cost: {money(t.cost, cur, loc)}</span> : null}
                    <span>Opened {timeAgo(t.created_at)}</span>
                    {t.completed_at && <span>Completed {fmtDate(t.completed_at, loc, session.timezone)}</span>}
                  </p>
                </div>
                {canWrite && (
                  <div className="flex flex-wrap items-center gap-2">
                    {t.status !== 'completed' && (
                      <ActionForm action={updateTicketAction} submit="Update" className="flex flex-wrap items-end gap-2" compact>
                        <input type="hidden" name="id" value={t.id} />
                        <select name="status" defaultValue={t.status} className="select h-8 w-auto text-[12px]">
                          {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </select>
                        <select name="assignee_id" defaultValue={t.assignee_id ?? ''} className="select h-8 w-auto text-[12px]">
                          <option value="">Unassigned</option>
                          {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                        <select name="vendor_id" defaultValue={t.vendor_id ?? ''} className="select h-8 w-auto text-[12px]">
                          <option value="">No vendor</option>
                          {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                        </select>
                        <input name="cost" type="number" min={0} defaultValue={t.cost ?? ''} placeholder="Cost ¢" className="input h-8 w-24 text-[12px]" />
                      </ActionForm>
                    )}
                    {t.status === 'completed' && <Badge tone="ok">Closed</Badge>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Add note to a ticket" subtitle="Notes are stored in the activity timeline">
          <ActionForm action={addTicketNoteAction} submit="Add note">
            <Field label="Ticket" name="id" options={tickets.map((t) => ({ value: t.id, label: `${t.title} — ${titleCase(t.status)}` }))} required />
            <Field label="Note" name="body" rows={3} required placeholder="Vendor scheduled for Thursday 09:00." />
          </ActionForm>
        </Card>
        <Card title="Recent ticket activity" pad={false}>
          {notes.length === 0 ? (
            <div className="px-5 pb-5"><EmptyState title="No activity yet" /></div>
          ) : (
            <ul className="divide-y divide-[var(--line)]">
              {notes.map((n) => (
                <li key={n.id} className="px-5 py-3">
                  <p className="text-[12.5px]">{n.body}</p>
                  <p className="mt-1 text-[11px] muted">{n.user_name ?? 'System'} · {timeAgo(n.created_at)}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
