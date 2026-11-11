'use server';

import { redirect } from 'next/navigation';
import { audit, one, run } from '../db';
import { getSession, setSessionOrg } from '../auth';
import { id as newId, token as newToken } from '../ids';
import { ensureDefaultAutomations } from '../notify';
import { BUSINESS_TYPES } from '../format';
import type { ActionState } from '@/components/form';

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? '').trim();
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'workspace'
  );
}

function uniqueSlug(base: string): string {
  let slug = base;
  let n = 1;
  while (one(`SELECT id FROM organizations WHERE slug = ?`, [slug])) {
    n += 1;
    slug = `${base}-${n}`;
  }
  return slug;
}

function setStep(orgId: string, step: number) {
  run(`UPDATE organizations SET onboarding_step = ? WHERE id = ?`, [step, orgId]);
}

export async function saveBusinessProfileAction(_state: ActionState, fd: FormData): Promise<ActionState> {
  const session = await getSession();
  if (!session) redirect('/login');

  const name = str(fd, 'name');
  const country = str(fd, 'country') || 'US';
  const currency = str(fd, 'currency') || 'USD';
  const timezone = str(fd, 'timezone') || 'UTC';
  const locale = str(fd, 'locale') || 'en-US';
  const website = str(fd, 'website');
  const address = str(fd, 'address');

  if (name.length < 2) return { error: 'Enter your business name.' };

  if (session.orgId) {
    run(
      `UPDATE organizations SET name = ?, country = ?, currency = ?, timezone = ?, locale = ?, website = ?, address = ? WHERE id = ?`,
      [name, country, currency, timezone, locale, website || null, address || null, session.orgId],
    );
    setStep(session.orgId, 3);
    redirect('/onboarding?step=3');
  }

  const orgId = newId('org_');
  run(
    `INSERT INTO organizations (id, name, slug, business_type, country, currency, timezone, locale, website, address, modules, plan, onboarding_step, onboarding_complete, created_at)
     VALUES (?, ?, ?, 'coworking', ?, ?, ?, ?, ?, ?, '[]', 'starter', 3, 0, ?)`,
    [orgId, name, uniqueSlug(slugify(name)), country, currency, timezone, locale, website || null, address || null, new Date().toISOString()],
  );
  run(`INSERT INTO org_members (id, org_id, user_id, role, title, status, created_at) VALUES (?, ?, ?, 'owner', 'Founder', 'active', ?)`, [
    newId('mem_'),
    orgId,
    session.userId,
    new Date().toISOString(),
  ]);
  run(
    `INSERT INTO subscriptions (id, org_id, plan, period, status, seats, ai_credits, current_period_end, created_at)
     VALUES (?, ?, 'starter', 'monthly', 'trialing', 5, 100, ?, ?)`,
    [newId('sub_'), orgId, new Date(Date.now() + 14 * 86400000).toISOString(), new Date().toISOString()],
  );
  ensureDefaultAutomations(orgId);
  await setSessionOrg(orgId);
  audit({ orgId, userId: session.userId, actor: session.name, action: 'organization.created', entityType: 'organization', entityId: orgId });
  redirect('/onboarding?step=3');
}

export async function saveBusinessTypeAction(_state: ActionState, fd: FormData): Promise<ActionState> {
  const session = await getSession();
  if (!session?.orgId) redirect('/onboarding?step=2');
  const businessType = str(fd, 'business_type');
  const type = BUSINESS_TYPES.find((t) => t.value === businessType);
  if (!type) return { error: 'Select a business type to continue.' };
  run(`UPDATE organizations SET business_type = ?, modules = ? WHERE id = ?`, [
    type.value,
    JSON.stringify(type.modules),
    session.orgId,
  ]);
  setStep(session.orgId, 4);
  redirect('/onboarding?step=4');
}

export async function saveModulesAction(_state: ActionState, fd: FormData): Promise<ActionState> {
  const session = await getSession();
  if (!session?.orgId) redirect('/onboarding?step=2');
  const selected = fd.getAll('modules').map(String).filter(Boolean);
  const modules = selected.length ? selected : ['properties', 'finance'];
  run(`UPDATE organizations SET modules = ? WHERE id = ?`, [JSON.stringify(modules), session.orgId]);
  setStep(session.orgId, 5);
  redirect('/onboarding?step=5');
}

export async function saveFirstPropertyAction(_state: ActionState, fd: FormData): Promise<ActionState> {
  const session = await getSession();
  if (!session?.orgId) redirect('/onboarding?step=2');
  const name = str(fd, 'name');
  if (name.length < 2) return { error: 'Give your property a name.' };

  const propertyId = newId('prp_');
  const now = new Date().toISOString();
  run(
    `INSERT INTO properties (id, org_id, name, type, description, address, city, country, manager_id, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
    [
      propertyId,
      session.orgId,
      name,
      str(fd, 'type') || 'coworking',
      str(fd, 'description') || null,
      str(fd, 'address') || null,
      str(fd, 'city') || null,
      str(fd, 'country') || session.country,
      session.userId,
      now,
    ],
  );
  const buildingId = newId('bld_');
  run(`INSERT INTO buildings (id, org_id, property_id, name, floors_count, created_at) VALUES (?, ?, ?, ?, 1, ?)`, [
    buildingId,
    session.orgId,
    propertyId,
    `${name} — Main building`,
    now,
  ]);
  const floorId = newId('flr_');
  run(`INSERT INTO floors (id, org_id, building_id, name, level, created_at) VALUES (?, ?, ?, 'Level 1', 1, ?)`, [
    floorId,
    session.orgId,
    buildingId,
    now,
  ]);

  const units = Number(fd.get('units') ?? 0);
  const unitKind = str(fd, 'unit_kind') || 'office';
  const rent = Math.round(Number(fd.get('rent') ?? 0) * 100);
  for (let i = 1; i <= Math.min(Math.max(units, 0), 50); i += 1) {
    run(
      `INSERT INTO units (id, org_id, property_id, building_id, floor_id, name, kind, area_sqm, rent_amount, rent_period, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, 'monthly', 'available', ?)`,
      [newId('unt_'), session.orgId, propertyId, buildingId, floorId, `Unit ${i}`, unitKind, rent, now],
    );
  }

  audit({ orgId: session.orgId, userId: session.userId, actor: session.name, action: 'property.created', entityType: 'property', entityId: propertyId });
  setStep(session.orgId, 6);
  redirect('/onboarding?step=6');
}

export async function finishOnboardingAction(_state: ActionState, fd: FormData): Promise<ActionState> {
  const session = await getSession();
  if (!session?.orgId) redirect('/onboarding?step=2');

  const invites = [1, 2, 3]
    .map((n) => ({ email: str(fd, `email_${n}`).toLowerCase(), role: str(fd, `role_${n}`) || 'member' }))
    .filter((i) => i.email);

  for (const invite of invites) {
    const token = newToken();
    run(
      `INSERT INTO invites (id, org_id, email, role, token, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      [newId('inv_'), session.orgId, invite.email, invite.role, token, new Date().toISOString()],
    );
    run(
      `INSERT INTO notifications (id, org_id, user_id, title, body, kind, link, created_at) VALUES (?, ?, NULL, ?, ?, 'info', ?, ?)`,
      [
        newId('ntf_'),
        session.orgId,
        `Invite created for ${invite.email}`,
        `Share the invite link from Team settings — email delivery activates with RESEND_API_KEY.`,
        '/app/team',
        new Date().toISOString(),
      ],
    );
  }

  run(`UPDATE organizations SET onboarding_complete = 1, onboarding_step = 6 WHERE id = ?`, [session.orgId]);
  audit({ orgId: session.orgId, userId: session.userId, actor: session.name, action: 'organization.onboarding_completed' });
  redirect('/app');
}
