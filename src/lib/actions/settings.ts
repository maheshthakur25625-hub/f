'use server';

import { revalidatePath } from 'next/cache';
import { all, audit, one, run } from '../db';
import { allowed, requireSession, requireWorkspace } from '../auth';
import { id as newId } from '../ids';
import type { ActionState } from '@/components/form';

function str(fd: FormData, k: string, fallback = ''): string {
  const v = fd.get(k);
  return v === null ? fallback : String(v).trim();
}

export async function updateOrganizationAction(_s: ActionState, fd: FormData): Promise<ActionState> {
  const session = await requireWorkspace();
  if (!allowed(session, 'settings.write')) return { error: 'Your role cannot change workspace settings.' };
  const orgId = session.orgId!;
  const name = str(fd, 'name');
  if (name.length < 2) return { error: 'Enter the business name.' };

  run(
    `UPDATE organizations
        SET name = ?, country = ?, currency = ?, timezone = ?, locale = ?, website = ?, address = ?, business_type = ?
      WHERE id = ?`,
    [
      name,
      str(fd, 'country', 'US'),
      str(fd, 'currency', 'USD'),
      str(fd, 'timezone', 'UTC'),
      str(fd, 'locale', 'en-US'),
      str(fd, 'website') || null,
      str(fd, 'address') || null,
      str(fd, 'business_type', 'coworking'),
      orgId,
    ],
  );
  audit({ orgId, userId: session.userId, actor: session.name, action: 'org.updated', entityType: 'organization', entityId: orgId });
  revalidatePath('/app/settings');
  revalidatePath('/app');
  return { ok: true, message: 'Workspace settings saved.' };
}

export async function toggleModuleAction(_s: ActionState, fd: FormData): Promise<ActionState> {
  const session = await requireWorkspace();
  if (!allowed(session, 'settings.write')) return { error: 'Your role cannot change modules.' };
  const orgId = session.orgId!;
  const moduleKey = str(fd, 'module');
  const org = one<{ modules: string }>(`SELECT modules FROM organizations WHERE id = ?`, [orgId]);
  if (!org) return { error: 'Workspace not found.' };
  let modules: string[] = [];
  try {
    const parsed = JSON.parse(org.modules || '[]');
    if (Array.isArray(parsed)) modules = parsed.filter((m): m is string => typeof m === 'string');
  } catch {
    modules = [];
  }
  const active = modules.includes(moduleKey);
  const next = active ? modules.filter((m) => m !== moduleKey) : [...modules, moduleKey];
  if (next.length === 0) return { error: 'Keep at least one module enabled.' };
  run(`UPDATE organizations SET modules = ? WHERE id = ?`, [JSON.stringify(next), orgId]);
  revalidatePath('/app/settings');
  revalidatePath('/app');
  return { ok: true, message: active ? 'Module disabled.' : 'Module enabled.' };
}

export async function updateSubscriptionAction(_s: ActionState, fd: FormData): Promise<ActionState> {
  const session = await requireWorkspace();
  if (!allowed(session, 'billing.write')) return { error: 'Your role cannot change the subscription.' };
  const orgId = session.orgId!;
  const plan = str(fd, 'plan', 'free');
  const period = str(fd, 'period', 'monthly');
  const planRow = one<{ code: string; price_monthly: number; price_yearly: number }>(
    `SELECT code, price_monthly, price_yearly FROM plans WHERE code = ? AND active = 1`,
    [plan],
  );
  if (!planRow) return { error: 'Unknown plan.' };

  const seats = Math.max(1, Number(str(fd, 'seats', '1')) || 1);
  const end = new Date();
  if (period === 'yearly') end.setUTCFullYear(end.getUTCFullYear() + 1);
  else end.setUTCMonth(end.getUTCMonth() + 1);

  const existing = one<{ id: string }>(`SELECT id FROM subscriptions WHERE org_id = ?`, [orgId]);
  if (existing) {
    run(`UPDATE subscriptions SET plan = ?, period = ?, status = 'active', seats = ?, current_period_end = ? WHERE org_id = ?`, [
      plan,
      period,
      seats,
      end.toISOString(),
      orgId,
    ]);
  } else {
    run(
      `INSERT INTO subscriptions (id, org_id, plan, period, status, seats, ai_credits, current_period_end, created_at)
       VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?)`,
      [newId('sub_'), orgId, plan, period, seats, planRow.code === 'free' ? 25 : 500, end.toISOString(), new Date().toISOString()],
    );
  }
  run(`UPDATE organizations SET plan = ? WHERE id = ?`, [plan, orgId]);
  audit({
    orgId,
    userId: session.userId,
    actor: session.name,
    action: 'subscription.changed',
    entityType: 'subscription',
    entityId: plan,
    meta: { period, seats },
  });
  revalidatePath('/app/billing');
  revalidatePath('/app/settings');
  return { ok: true, message: `Subscription updated to ${plan} (${period}).` };
}

export async function cancelSubscriptionAction(_s: ActionState, _fd: FormData): Promise<ActionState> {
  const session = await requireWorkspace();
  if (!allowed(session, 'billing.write')) return { error: 'Your role cannot cancel the subscription.' };
  const orgId = session.orgId!;
  const sub = one(`SELECT id FROM subscriptions WHERE org_id = ?`, [orgId]);
  if (!sub) return { error: 'No active subscription to cancel.' };
  run(`UPDATE subscriptions SET status = 'cancelled' WHERE org_id = ?`, [orgId]);
  audit({ orgId, userId: session.userId, actor: session.name, action: 'subscription.cancelled', entityType: 'subscription', entityId: orgId });
  revalidatePath('/app/billing');
  return { ok: true, message: 'Subscription cancelled. Access continues until the period ends.' };
}

export async function requestSupportAction(_s: ActionState, fd: FormData): Promise<ActionState> {
  const session = await requireSession();
  const subject = str(fd, 'subject');
  const body = str(fd, 'body');
  if (subject.length < 3) return { error: 'Add a short subject.' };
  if (body.length < 5) return { error: 'Describe what you need help with.' };
  run(`INSERT INTO support_requests (id, org_id, user_id, subject, body, status, created_at) VALUES (?, ?, ?, ?, ?, 'open', ?)`, [
    newId('sup_'),
    session.orgId,
    session.userId,
    subject,
    body,
    new Date().toISOString(),
  ]);
  revalidatePath('/app/settings');
  return { ok: true, message: 'Support request sent to the platform team.' };
}

/* ---------------------------- platform administration ---------------------------- */

async function requirePlatformAdmin() {
  const session = await requireSession();
  if (!session.isPlatformAdmin) return null;
  return session;
}

export async function adminUpdatePlanAction(_s: ActionState, fd: FormData): Promise<ActionState> {
  const session = await requirePlatformAdmin();
  if (!session) return { error: 'Platform administrator access required.' };
  const code = str(fd, 'code');
  const plan = one(`SELECT code FROM plans WHERE code = ?`, [code]);
  if (!plan) return { error: 'Plan not found.' };
  const features = str(fd, 'features')
    .split(',')
    .map((f) => f.trim())
    .filter(Boolean);
  run(
    `UPDATE plans SET name = ?, price_monthly = ?, price_yearly = ?, property_limit = ?, seat_limit = ?, ai_credits = ?, features = ?, active = ? WHERE code = ?`,
    [
      str(fd, 'name', code),
      Math.max(0, Math.round(Number(str(fd, 'price_monthly', '0')) * 100)),
      Math.max(0, Math.round(Number(str(fd, 'price_yearly', '0')) * 100)),
      Number(str(fd, 'property_limit', '1')) || 1,
      Number(str(fd, 'seat_limit', '1')) || 1,
      Number(str(fd, 'ai_credits', '0')) || 0,
      JSON.stringify(features),
      str(fd, 'active') === 'on' ? 1 : 0,
      code,
    ],
  );
  revalidatePath('/admin/plans');
  return { ok: true, message: `${code} plan updated.` };
}

export async function adminSetOrgPlanAction(_s: ActionState, fd: FormData): Promise<ActionState> {
  const session = await requirePlatformAdmin();
  if (!session) return { error: 'Platform administrator access required.' };
  const orgId = str(fd, 'org_id');
  const plan = str(fd, 'plan', 'free');
  const org = one(`SELECT id FROM organizations WHERE id = ?`, [orgId]);
  if (!org) return { error: 'Organization not found.' };
  run(`UPDATE organizations SET plan = ? WHERE id = ?`, [plan, orgId]);
  const sub = one(`SELECT id FROM subscriptions WHERE org_id = ?`, [orgId]);
  if (sub) run(`UPDATE subscriptions SET plan = ? WHERE org_id = ?`, [plan, orgId]);
  else
    run(
      `INSERT INTO subscriptions (id, org_id, plan, period, status, seats, ai_credits, current_period_end, created_at)
       VALUES (?, ?, ?, 'monthly', 'active', 1, 100, ?, ?)`,
      [newId('sub_'), orgId, plan, new Date(Date.now() + 30 * 86400000).toISOString(), new Date().toISOString()],
    );
  audit({ orgId, userId: session.userId, actor: session.name, action: 'admin.plan_set', entityType: 'organization', entityId: orgId, meta: { plan } });
  revalidatePath('/admin');
  return { ok: true, message: 'Organization plan updated.' };
}

export async function adminResolveSupportAction(_s: ActionState, fd: FormData): Promise<ActionState> {
  const session = await requirePlatformAdmin();
  if (!session) return { error: 'Platform administrator access required.' };
  const id = str(fd, 'id');
  const status = str(fd, 'status', 'resolved');
  if (!one(`SELECT id FROM support_requests WHERE id = ?`, [id])) return { error: 'Request not found.' };
  run(`UPDATE support_requests SET status = ? WHERE id = ?`, [status, id]);
  revalidatePath('/admin');
  return { ok: true, message: `Request marked ${status}.` };
}

export async function adminTogglePlatformSettingAction(_s: ActionState, fd: FormData): Promise<ActionState> {
  const session = await requirePlatformAdmin();
  if (!session) return { error: 'Platform administrator access required.' };
  const key = str(fd, 'key');
  const value = str(fd, 'value');
  if (!key) return { error: 'Missing setting key.' };
  const existing = one(`SELECT key FROM platform_settings WHERE key = ?`, [key]);
  if (existing) run(`UPDATE platform_settings SET value = ? WHERE key = ?`, [value, key]);
  else run(`INSERT INTO platform_settings (key, value) VALUES (?, ?)`, [key, value]);
  revalidatePath('/admin/settings');
  return { ok: true, message: 'Platform setting saved.' };
}

export async function listOrgUsage(orgId: string) {
  const properties = one<{ c: number }>(`SELECT COUNT(*) AS c FROM properties WHERE org_id = ?`, [orgId]);
  const members = one<{ c: number }>(`SELECT COUNT(*) AS c FROM org_members WHERE org_id = ?`, [orgId]);
  const subscription = one<Record<string, any>>(`SELECT * FROM subscriptions WHERE org_id = ?`, [orgId]);
  const plan = one<Record<string, any>>(`SELECT * FROM plans WHERE code = ?`, [String(subscription?.plan ?? 'free')]);
  const aiUsed = one<{ c: number }>(`SELECT COUNT(*) AS c FROM ai_messages WHERE org_id = ? AND role = 'user'`, [orgId]);
  return {
    properties: Number(properties?.c ?? 0),
    members: Number(members?.c ?? 0),
    seats: Number(members?.c ?? 0),
    subscription,
    propertyLimit: Number(plan?.property_limit ?? 0),
    seatLimit: Number(plan?.seat_limit ?? 0),
    aiCredits: Number(plan?.ai_credits ?? 0),
    aiCreditsUsed: Number(aiUsed?.c ?? 0),
  };
}

export async function allPlans() {
  return all<{ code: string; name: string; price_monthly: number; price_yearly: number; property_limit: number; seat_limit: number; ai_credits: number; features: string; active: number }>(
    `SELECT code, name, price_monthly, price_yearly, property_limit, seat_limit, ai_credits, features, active FROM plans ORDER BY sort`,
  );
}
