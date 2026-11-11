import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { one, run } from './db';
import { token as newToken } from './ids';
import { can } from './rbac';
import type { Permission, Role } from './permissions';

export const SESSION_COOKIE = 'sp_session';
const SESSION_DAYS = 30;

export type Session = {
  userId: string;
  name: string;
  email: string;
  isPlatformAdmin: boolean;
  orgId: string | null;
  orgName: string | null;
  orgSlug: string | null;
  role: Role | null;
  currency: string;
  timezone: string;
  locale: string;
  country: string;
  plan: string;
  businessType: string;
  modules: string[];
  onboardingComplete: boolean;
  onboardingStep: number;
};

type SessionRow = {
  token: string;
  org_id: string | null;
  user_id: string;
  name: string;
  email: string;
  is_platform_admin: number;
  o_id: string | null;
  org_name: string | null;
  slug: string | null;
  currency: string | null;
  timezone: string | null;
  locale: string | null;
  country: string | null;
  plan: string | null;
  business_type: string | null;
  modules: string | null;
  onboarding_complete: number | null;
  onboarding_step: number | null;
  role: string | null;
};

export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const row = one<SessionRow>(
    `SELECT s.token, s.org_id, u.id AS user_id, u.name, u.email, u.is_platform_admin,
            o.id AS o_id, o.name AS org_name, o.slug, o.currency, o.timezone, o.locale, o.country,
            o.plan, o.business_type, o.modules, o.onboarding_complete, o.onboarding_step, m.role
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN organizations o ON o.id = s.org_id
       LEFT JOIN org_members m ON m.user_id = u.id AND m.org_id = s.org_id
      WHERE s.token = ? AND s.expires_at > ?`,
    [token, new Date().toISOString()],
  );
  if (!row) return null;
  const orgId = row.o_id && row.role ? row.o_id : null;
  return {
    userId: row.user_id,
    name: row.name,
    email: row.email,
    isPlatformAdmin: Boolean(row.is_platform_admin),
    orgId,
    orgName: orgId ? row.org_name : null,
    orgSlug: orgId ? row.slug : null,
    role: (row.role as Role) ?? null,
    currency: row.currency ?? 'USD',
    timezone: row.timezone ?? 'UTC',
    locale: row.locale ?? 'en-US',
    country: row.country ?? 'US',
    plan: row.plan ?? 'starter',
    businessType: row.business_type ?? 'coworking',
    modules: row.modules ? JSON.parse(row.modules) : [],
    onboardingComplete: Boolean(row.onboarding_complete),
    onboardingStep: row.onboarding_step ?? 1,
  };
}

export async function createSession(userId: string, orgId: string | null): Promise<void> {
  const token = newToken();
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  run(`INSERT INTO sessions (token, user_id, org_id, expires_at, created_at) VALUES (?, ?, ?, ?, ?)`, [
    token,
    userId,
    orgId,
    expires.toISOString(),
    new Date().toISOString(),
  ]);
  run(`UPDATE users SET last_login_at = ? WHERE id = ?`, [new Date().toISOString(), userId]);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) run(`DELETE FROM sessions WHERE token = ?`, [token]);
  store.delete(SESSION_COOKIE);
}

export async function setSessionOrg(orgId: string): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return;
  run(`UPDATE sessions SET org_id = ? WHERE token = ?`, [orgId, token]);
}

export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect('/login');
  return session;
}

/** Workspace guard: requires an organization, finished onboarding and a staff role. */
export async function requireWorkspace(): Promise<Session> {
  const session = await requireSession();
  if (!session.orgId) redirect('/onboarding');
  if (!session.onboardingComplete) redirect('/onboarding');
  if (session.role === 'member') redirect('/portal');
  return session;
}

export async function requirePortal(): Promise<Session> {
  const session = await requireSession();
  if (!session.orgId) redirect('/onboarding');
  return session;
}

export function allowed(session: Session, permission: Permission): boolean {
  return can(session.role, permission);
}

export function assertPermission(session: Session, permission: Permission): void {
  if (!can(session.role, permission)) {
    throw new Error('You do not have permission to perform this action.');
  }
}
