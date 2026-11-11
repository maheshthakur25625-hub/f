import { requireWorkspace, allowed } from '@/lib/auth';
import { all } from '@/lib/db';
import { createAutomationAction, runAutomationsAction, toggleAutomationAction } from '@/lib/actions/automations';
import { AUTOMATION_KINDS } from '@/lib/automation-kinds';
import { fmtDate, titleCase, timeAgo } from '@/lib/format';
import { ActionForm, GhostSubmit } from '@/components/form';
import { Card, PageHeader, Stat, Field, EmptyState, Badge, StatusBadge } from '@/components/ui';

export const dynamic = 'force-dynamic';

const CHANNELS = [
  { value: 'email', label: 'Email' },
  { value: 'in_app', label: 'In-app' },
  { value: 'sms', label: 'SMS (optional)' },
  { value: 'whatsapp', label: 'WhatsApp (optional)' },
];

export default async function AutomationsPage() {
  const session = await requireWorkspace();
  const orgId = session.orgId!;

  if (!allowed(session, 'automations.write')) {
    return (
      <div className="space-y-6">
        <PageHeader title="Automations" subtitle="Reminders and notifications." />
        <EmptyState title="No access" body="Your role cannot configure automations." />
      </div>
    );
  }

  const automations = all<Record<string, any>>(`SELECT * FROM automations WHERE org_id = ? ORDER BY created_at DESC`, [orgId]);
  const recent = all<Record<string, any>>(
    `SELECT * FROM notifications WHERE org_id = ? ORDER BY created_at DESC LIMIT 12`,
    [orgId],
  );

  const enabled = automations.filter((a) => Number(a.enabled) === 1).length;
  const lastRun = automations
    .map((a) => a.last_run_at)
    .filter(Boolean)
    .sort()
    .pop();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Automations"
        eyebrow="Workflows"
        subtitle="Reminders are generated from live records — rent due, membership expiry, lease renewals, bookings and follow-ups."
      >
        <ActionForm action={runAutomationsAction} submit="Run all now" className="flex items-center gap-2" compact>
          <input type="hidden" name="scope" value="all" />
        </ActionForm>
      </PageHeader>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Configured" value={String(automations.length)} />
        <Stat label="Enabled" value={String(enabled)} tone="ok" />
        <Stat label="Last run" value={lastRun ? timeAgo(lastRun) : 'Never'} hint={lastRun ? fmtDate(lastRun, session.locale, session.timezone) : 'Run once to populate'} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Create a workflow" subtitle="Each workflow scans your organization's records when it runs.">
          <ActionForm action={createAutomationAction} submit="Create workflow">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Trigger" name="kind" options={AUTOMATION_KINDS.map((k) => ({ value: k, label: titleCase(k) }))} />
              <Field label="Name" name="name" required placeholder="Rent due reminder" />
              <Field label="Channel" name="channel" options={CHANNELS} />
              <Field label="Days before / after" name="offset_days" type="number" min={0} defaultValue="3" hint="Used by reminders and follow-ups." />
              <Field
                label="Message template"
                name="template"
                rows={2}
                className="sm:col-span-2"
                placeholder="Hi {{name}}, your payment of {{amount}} is due on {{date}}."
              />
            </div>
          </ActionForm>
        </Card>

        <Card title="Recent notifications" subtitle="Delivered in-app, ready for email dispatch" pad={false}>
          {recent.length === 0 ? (
            <div className="px-5 pb-5"><EmptyState title="Nothing sent yet" body="Run a workflow to generate reminders." /></div>
          ) : (
            <ul className="divide-y divide-[var(--line)]">
              {recent.map((n) => (
                <li key={n.id} className="px-5 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[12.5px] font-medium">{n.title}</p>
                    <Badge tone={n.kind === 'warning' ? 'warn' : n.kind === 'success' ? 'ok' : n.kind === 'error' ? 'bad' : 'neutral'}>
                      {n.kind ?? 'info'}
                    </Badge>
                  </div>
                  {n.body && <p className="mt-0.5 line-clamp-2 text-[12px] muted">{n.body}</p>}
                  <p className="mt-1 text-[11px] muted">{timeAgo(n.created_at)}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title="Workflows" pad={false}>
        {automations.length === 0 ? (
          <div className="px-5 pb-5"><EmptyState title="No workflows configured" body="Add a reminder above to start automating operations." /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Workflow</th><th>Trigger</th><th>Channel</th><th>Offset</th><th>Last run</th><th>Status</th><th /></tr></thead>
              <tbody>
                {automations.map((a) => (
                  <tr key={a.id}>
                    <td className="font-medium">{a.name}</td>
                    <td className="muted">{titleCase(a.kind ?? '')}</td>
                    <td>{titleCase(a.channel ?? '')}</td>
                    <td className="tabular-nums">{a.offset_days ?? 0}d</td>
                    <td className="muted">{a.last_run_at ? timeAgo(a.last_run_at) : 'Never'}</td>
                    <td><StatusBadge status={Number(a.enabled) === 1 ? 'active' : 'paused'} /></td>
                    <td className="text-right">
                      <ActionForm action={toggleAutomationAction} submit={Number(a.enabled) === 1 ? 'Disable' : 'Enable'} className="flex justify-end" compact>
                        <input type="hidden" name="id" value={a.id} />
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
