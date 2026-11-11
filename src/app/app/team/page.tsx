import { requireWorkspace, allowed } from '@/lib/auth';
import { all } from '@/lib/db';
import { changeRoleAction, inviteMemberAction, removeMemberAction, revokeInviteAction } from '@/lib/actions/team';
import { fmtDate, titleCase } from '@/lib/format';
import { ActionForm, CopyField, DangerSubmit, GhostSubmit } from '@/components/form';
import { Card, PageHeader, Stat, Field, EmptyState, Badge, Avatar } from '@/components/ui';

export const dynamic = 'force-dynamic';

const ROLE_OPTIONS = [
  { value: 'super_admin', label: 'Super admin' },
  { value: 'property_manager', label: 'Property manager' },
  { value: 'coworking_manager', label: 'Coworking manager' },
  { value: 'agent', label: 'Real estate agent' },
  { value: 'accountant', label: 'Accountant' },
  { value: 'maintenance', label: 'Maintenance staff' },
  { value: 'member', label: 'Member / tenant' },
];

export default async function TeamPage() {
  const session = await requireWorkspace();
  const orgId = session.orgId!;

  if (!allowed(session, 'team.view')) {
    return (
      <div className="space-y-6">
        <PageHeader title="Team" subtitle="People and roles." />
        <EmptyState title="No access" body="Your role cannot view team management." />
      </div>
    );
  }

  const canWrite = allowed(session, 'team.write');
  const members = all<Record<string, any>>(
    `SELECT m.*, u.name, u.email, u.last_login_at FROM org_members m JOIN users u ON u.id = m.user_id
      WHERE m.org_id = ? ORDER BY m.created_at`,
    [orgId],
  );
  const invites = all<Record<string, any>>(
    `SELECT * FROM invites WHERE org_id = ? AND accepted_at IS NULL ORDER BY created_at DESC`,
    [orgId],
  );
  const staff = members.filter((m) => m.role !== 'member');

  return (
    <div className="space-y-6">
      <PageHeader title="Team" eyebrow="Access control" subtitle="Roles are enforced on the server for every action, not just hidden in the interface.">
        <Badge tone="neutral">{members.length} members</Badge>
      </PageHeader>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Active people" value={String(members.filter((m) => m.status === 'active').length)} />
        <Stat label="Staff" value={String(staff.length)} />
        <Stat label="Pending invites" value={String(invites.length)} tone={invites.length ? 'warn' : 'neutral'} />
      </div>

      <Card title="Team members" subtitle="Change a role or remove access at any time" pad={false}>
        <div className="overflow-x-auto">
          <table className="table">
            <thead><tr><th>Person</th><th>Role</th><th>Title</th><th>Last login</th><th>Status</th><th /></tr></thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id}>
                  <td>
                    <div className="flex items-center gap-2">
                      <Avatar name={m.name} size={26} />
                      <div>
                        <div className="font-medium">{m.name}</div>
                        <div className="text-[11.5px] muted">{m.email}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    {canWrite && m.role !== 'owner' ? (
                      <ActionForm action={changeRoleAction} submit="Save" className="flex items-center gap-2" compact>
                        <input type="hidden" name="id" value={m.id} />
                        <select name="role" defaultValue={m.role} className="select h-8 w-auto text-[12px]">
                          {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                        </select>
                      </ActionForm>
                    ) : (
                      <Badge tone={m.role === 'owner' ? 'brand' : 'neutral'}>{titleCase(m.role)}</Badge>
                    )}
                  </td>
                  <td className="muted">{m.title ?? '—'}</td>
                  <td className="muted">{m.last_login_at ? fmtDate(m.last_login_at, session.locale, session.timezone) : 'Never'}</td>
                  <td><Badge tone={m.status === 'active' ? 'ok' : 'warn'}>{m.status}</Badge></td>
                  <td className="text-right">
                    {canWrite && m.role !== 'owner' && m.user_id !== session.userId && (
                      <ActionForm action={removeMemberAction} className="flex justify-end">
                        <input type="hidden" name="id" value={m.id} />
                        <DangerSubmit label="Remove" confirmText={`Remove ${m.name} from this workspace?`} />
                      </ActionForm>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {canWrite && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Invite a team member" subtitle="Share the generated link — it expires once accepted.">
            <ActionForm action={inviteMemberAction} submit="Create invite">
              <Field label="Work email" name="email" type="email" required placeholder="colleague@company.com" />
              <Field label="Role" name="role" options={ROLE_OPTIONS} defaultValue="property_manager" />
            </ActionForm>
          </Card>

          <Card title="Pending invites" pad={false}>
            {invites.length === 0 ? (
              <div className="px-5 pb-5"><EmptyState title="No pending invites" /></div>
            ) : (
              <ul className="divide-y divide-[var(--line)]">
                {invites.map((i) => (
                  <li key={i.id} className="space-y-2 px-5 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[12.5px] font-medium">{i.email}</p>
                        <p className="text-[11px] muted">{titleCase(i.role)} · invited {fmtDate(i.created_at, session.locale, session.timezone)}</p>
                      </div>
                      <ActionForm action={revokeInviteAction} className="flex justify-end">
                        <input type="hidden" name="id" value={i.id} />
                        <DangerSubmit label="Revoke" confirmText="Revoke this invite?" />
                      </ActionForm>
                    </div>
                    <CopyField label="Invite link" value={`/invite/${i.token}`} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
