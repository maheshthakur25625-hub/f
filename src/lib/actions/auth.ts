'use server';

import { redirect } from 'next/navigation';
import { audit, one, run } from '../db';
import { hashPassword, verifyPassword } from '../password';
import { createSession, destroySession, getSession } from '../auth';
import { id as newId, token as newToken } from '../ids';
import type { ActionState } from '@/components/form';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? '').trim();
}

export async function registerAction(_state: ActionState, fd: FormData): Promise<ActionState> {
  const name = str(fd, 'name');
  const email = str(fd, 'email').toLowerCase();
  const password = String(fd.get('password') ?? '');

  if (name.length < 2) return { error: 'Enter your full name.' };
  if (!EMAIL_RE.test(email)) return { error: 'Enter a valid email address.' };
  if (password.length < 8) return { error: 'Choose a password with at least 8 characters.' };

  if (one(`SELECT id FROM users WHERE email = ?`, [email])) {
    return { error: 'An account already exists for this email. Sign in instead.' };
  }

  const userId = newId('usr_');
  run(
    `INSERT INTO users (id, email, name, password_hash, verify_token, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    [userId, email, name, hashPassword(password), newToken(), new Date().toISOString()],
  );
  audit({ orgId: null, userId, actor: name, action: 'user.registered', entityType: 'user', entityId: userId });
  await createSession(userId, null);
  redirect('/onboarding?step=2');
}

export async function loginAction(_state: ActionState, fd: FormData): Promise<ActionState> {
  const email = str(fd, 'email').toLowerCase();
  const password = String(fd.get('password') ?? '');
  if (!EMAIL_RE.test(email) || !password) return { error: 'Enter your email and password.' };

  const user = one<{ id: string; password_hash: string; name: string }>(
    `SELECT id, password_hash, name FROM users WHERE email = ?`,
    [email],
  );
  if (!user || !verifyPassword(password, user.password_hash)) {
    return { error: 'Those credentials do not match an account.' };
  }

  const membership = one<{ org_id: string; role: string; onboarding_complete: number }>(
    `SELECT m.org_id, m.role, o.onboarding_complete
       FROM org_members m JOIN organizations o ON o.id = m.org_id
      WHERE m.user_id = ? AND m.status = 'active'
      ORDER BY CASE m.role WHEN 'owner' THEN 0 ELSE 1 END
      LIMIT 1`,
    [user.id],
  );

  await createSession(user.id, membership?.org_id ?? null);
  audit({ orgId: membership?.org_id ?? null, userId: user.id, actor: user.name, action: 'user.logged_in' });

  if (!membership) redirect('/onboarding?step=2');
  if (!membership.onboarding_complete) redirect('/onboarding?step=2');
  if (membership.role === 'member') redirect('/portal');
  redirect('/app');
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect('/login');
}

export async function verifyEmailAction(): Promise<void> {
  const session = await getSession();
  if (!session) redirect('/login');
  run(`UPDATE users SET email_verified_at = ?, verify_token = NULL WHERE id = ?`, [
    new Date().toISOString(),
    session.userId,
  ]);
  audit({ orgId: session.orgId, userId: session.userId, actor: session.name, action: 'user.email_verified' });
  redirect('/onboarding?step=2&verified=1');
}

export async function verifyByTokenAction(_state: ActionState, fd: FormData): Promise<ActionState> {
  const token = str(fd, 'token');
  const user = one<{ id: string }>(`SELECT id FROM users WHERE verify_token = ?`, [token]);
  if (!user) return { error: 'That verification link is no longer valid.' };
  run(`UPDATE users SET email_verified_at = ?, verify_token = NULL WHERE id = ?`, [new Date().toISOString(), user.id]);
  return { ok: true, message: 'Email verified. You can sign in now.' };
}

/** Accept a team invite: joins the inviting organization with the invited role. */
export async function acceptInviteAction(_state: ActionState, fd: FormData): Promise<ActionState> {
  const session = await getSession();
  if (!session) return { error: 'Sign in or create an account first, then open the invite link again.' };
  const token = str(fd, 'token');
  const invite = one<{ id: string; org_id: string; email: string; role: string; accepted_at: string | null }>(
    `SELECT * FROM invites WHERE token = ?`,
    [token],
  );
  if (!invite || invite.accepted_at) return { error: 'This invitation is invalid or already used.' };
  if (invite.email.toLowerCase() !== session.email.toLowerCase()) {
    return { error: `This invitation was sent to ${invite.email}. Sign in with that address.` };
  }
  const existing = one(`SELECT id FROM org_members WHERE org_id = ? AND user_id = ?`, [invite.org_id, session.userId]);
  if (!existing) {
    run(`INSERT INTO org_members (id, org_id, user_id, role, status, created_at) VALUES (?, ?, ?, ?, 'active', ?)`, [
      newId('mem_'),
      invite.org_id,
      session.userId,
      invite.role,
      new Date().toISOString(),
    ]);
  }
  run(`UPDATE invites SET accepted_at = ? WHERE id = ?`, [new Date().toISOString(), invite.id]);
  await createSession(session.userId, invite.org_id);
  redirect(invite.role === 'member' ? '/portal' : '/app');
}
