'use server';

import { revalidatePath } from 'next/cache';
import { audit, one, run } from '../db';
import { allowed, requireWorkspace } from '../auth';
import { id as newId } from '../ids';
import { token } from '../ids';
import type { ActionState } from '@/components/form';

function str(fd: FormData, k: string, fallback = ''): string {
  const v = fd.get(k);
  return v === null ? fallback : String(v).trim();
}

export async function inviteMemberAction(_s: ActionState, fd: FormData): Promise<ActionState> {
  const session = await requireWorkspace();
  if (!allowed(session, 'team.write')) return { error: 'Your role cannot invite team members.' };
  const orgId = session.orgId!;
  const email = str(fd, 'email').toLowerCase();
  const role = str(fd, 'role', 'member');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: 'Enter a valid email address.' };

  const existingMember = one<{ id: string }>(
    `SELECT om.id FROM org_members om JOIN users u ON u.id = om.user_id WHERE om.org_id = ? AND u.email = ?`,
    [orgId, email],
  );
  if (existingMember) return { error: 'That person is already part of this workspace.' };

  const pending = one(`SELECT id FROM invites WHERE org_id = ? AND email = ? AND accepted_at IS NULL`, [orgId, email]);
  if (pending) return { error: 'An invitation is already pending for that email.' };

  const inviteId = newId('inv_');
  const inviteToken = token();
  run(
    `INSERT INTO invites (id, org_id, email, role, token, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    [inviteId, orgId, email, role, inviteToken, new Date().toISOString()],
  );
  audit({ orgId, userId: session.userId, actor: session.name, action: 'team.invited', entityType: 'invite', entityId: inviteId });
  revalidatePath('/app/team');
  return { ok: true, message: `Invitation created. Share the link shown below with ${email}.` };
}

export async function changeRoleAction(_s: ActionState, fd: FormData): Promise<ActionState> {
  const session = await requireWorkspace();
  if (!allowed(session, 'team.write')) return { error: 'Your role cannot change roles.' };
  const orgId = session.orgId!;
  const memberId = str(fd, 'id');
  const role = str(fd, 'role');
  const member = one<{ user_id: string; role: string }>(
    `SELECT user_id, role FROM org_members WHERE id = ? AND org_id = ?`,
    [memberId, orgId],
  );
  if (!member) return { error: 'Team member not found.' };
  if (member.role === 'owner' && session.role !== 'owner') return { error: 'Only the owner can change the owner role.' };

  const owners = one<{ c: number }>(`SELECT COUNT(*) AS c FROM org_members WHERE org_id = ? AND role = 'owner'`, [orgId]);
  if (member.role === 'owner' && role !== 'owner' && Number(owners?.c ?? 0) <= 1) {
    return { error: 'The workspace needs at least one owner.' };
  }
  run(`UPDATE org_members SET role = ? WHERE id = ? AND org_id = ?`, [role, memberId, orgId]);
  audit({ orgId, userId: session.userId, actor: session.name, action: 'team.role_changed', entityType: 'member', entityId: memberId, meta: { role } });
  revalidatePath('/app/team');
  return { ok: true, message: `Role updated to ${role.replace('_', ' ')}.` };
}

export async function removeMemberAction(_s: ActionState, fd: FormData): Promise<ActionState> {
  const session = await requireWorkspace();
  if (!allowed(session, 'team.write')) return { error: 'Your role cannot remove team members.' };
  const orgId = session.orgId!;
  const memberId = str(fd, 'id');
  const member = one<{ user_id: string; role: string }>(`SELECT user_id, role FROM org_members WHERE id = ? AND org_id = ?`, [
    memberId,
    orgId,
  ]);
  if (!member) return { error: 'Team member not found.' };
  if (member.user_id === session.userId) return { error: 'You cannot remove your own access.' };
  if (member.role === 'owner') return { error: 'Transfer ownership before removing an owner.' };

  run(`DELETE FROM org_members WHERE id = ? AND org_id = ?`, [memberId, orgId]);
  run(`DELETE FROM sessions WHERE user_id = ? AND org_id = ?`, [member.user_id, orgId]);
  audit({ orgId, userId: session.userId, actor: session.name, action: 'team.removed', entityType: 'member', entityId: memberId });
  revalidatePath('/app/team');
  return { ok: true, message: 'Access removed for that team member.' };
}

export async function revokeInviteAction(_s: ActionState, fd: FormData): Promise<ActionState> {
  const session = await requireWorkspace();
  if (!allowed(session, 'team.write')) return { error: 'Your role cannot revoke invitations.' };
  const id = str(fd, 'id');
  const invite = one(`SELECT id FROM invites WHERE id = ? AND org_id = ?`, [id, session.orgId]);
  if (!invite) return { error: 'Invitation not found.' };
  run(`DELETE FROM invites WHERE id = ? AND org_id = ?`, [id, session.orgId]);
  revalidatePath('/app/team');
  return { ok: true, message: 'Invitation revoked.' };
}
