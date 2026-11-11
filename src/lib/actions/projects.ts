'use server';

import { revalidatePath } from 'next/cache';
import { audit, one, run, transaction } from '../db';
import { allowed, requireWorkspace } from '../auth';
import { id as newId } from '../ids';
import type { ActionState } from '@/components/form';

function str(fd: FormData, k: string, fallback = ''): string {
  const v = fd.get(k);
  return v === null ? fallback : String(v).trim();
}
function cents(fd: FormData, k: string): number {
  return Math.max(0, Math.round(Number(str(fd, k) || 0) * 100));
}

export async function createProjectAction(_s: ActionState, fd: FormData): Promise<ActionState> {
  const session = await requireWorkspace();
  if (!allowed(session, 'projects.write')) return { error: 'Your role cannot manage development projects.' };
  const name = str(fd, 'name');
  if (name.length < 2) return { error: 'Enter the project name.' };
  const id = newId('prj_');
  run(
    `INSERT INTO projects (id, org_id, name, location, description, status, start_date, target_date, budget, progress, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      session.orgId,
      name,
      str(fd, 'location') || null,
      str(fd, 'description') || null,
      str(fd, 'status', 'planning'),
      str(fd, 'start_date') || null,
      str(fd, 'target_date') || null,
      cents(fd, 'budget'),
      Math.min(100, Math.max(0, Number(str(fd, 'progress', '0')) || 0)),
      new Date().toISOString(),
    ],
  );
  audit({ orgId: session.orgId, userId: session.userId, actor: session.name, action: 'project.created', entityType: 'project', entityId: id });
  revalidatePath('/app/projects');
  return { ok: true, message: 'Project created.' };
}

export async function updateProjectAction(_s: ActionState, fd: FormData): Promise<ActionState> {
  const session = await requireWorkspace();
  if (!allowed(session, 'projects.write')) return { error: 'Your role cannot manage development projects.' };
  const id = str(fd, 'id');
  const project = one(`SELECT id FROM projects WHERE id = ? AND org_id = ?`, [id, session.orgId]);
  if (!project) return { error: 'Project not found.' };
  const progress = Math.min(100, Math.max(0, Number(str(fd, 'progress', '0')) || 0));
  run(`UPDATE projects SET status = ?, progress = ?, target_date = COALESCE(NULLIF(?, ''), target_date) WHERE id = ? AND org_id = ?`, [
    str(fd, 'status', 'planning'),
    progress,
    str(fd, 'target_date'),
    id,
    session.orgId,
  ]);
  audit({
    orgId: session.orgId,
    userId: session.userId,
    actor: session.name,
    action: 'project.progress',
    entityType: 'project',
    entityId: id,
    meta: { progress },
  });
  revalidatePath('/app/projects');
  return { ok: true, message: `Construction progress set to ${progress}%.` };
}

export async function createProjectUnitAction(_s: ActionState, fd: FormData): Promise<ActionState> {
  const session = await requireWorkspace();
  if (!allowed(session, 'projects.write')) return { error: 'Your role cannot manage unit inventory.' };
  const projectId = str(fd, 'project_id');
  if (!one(`SELECT id FROM projects WHERE id = ? AND org_id = ?`, [projectId, session.orgId])) {
    return { error: 'Project not found.' };
  }
  const name = str(fd, 'name');
  if (!name) return { error: 'Give the unit a name or number.' };
  run(
    `INSERT INTO project_units (id, org_id, project_id, name, kind, area_sqm, price, status, milestone_paid, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'available', 0, ?)`,
    [
      newId('pu_'),
      session.orgId,
      projectId,
      name,
      str(fd, 'kind', 'apartment'),
      Number(str(fd, 'area_sqm') || 0) || null,
      cents(fd, 'price'),
      new Date().toISOString(),
    ],
  );
  revalidatePath('/app/projects');
  return { ok: true, message: 'Unit added to inventory.' };
}

export async function sellProjectUnitAction(_s: ActionState, fd: FormData): Promise<ActionState> {
  const session = await requireWorkspace();
  if (!allowed(session, 'projects.write')) return { error: 'Your role cannot manage sales.' };
  const orgId = session.orgId!;
  const unitId = str(fd, 'unit_id');
  const buyerName = str(fd, 'buyer_name');
  const buyerEmail = str(fd, 'buyer_email').toLowerCase();
  if (!buyerName) return { error: 'Enter the buyer name.' };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(buyerEmail)) return { error: 'Enter a valid buyer email.' };

  const unit = one<{ project_id: string; status: string; price: number }>(
    `SELECT project_id, status, price FROM project_units WHERE id = ? AND org_id = ?`,
    [unitId, orgId],
  );
  if (!unit) return { error: 'Unit not found.' };
  if (unit.status !== 'available') return { error: 'That unit is no longer available.' };

  const buyerId = newId('buy_');
  transaction(() => {
    run(
      `INSERT INTO buyers (id, org_id, project_id, name, email, phone, unit_id, booking_status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'reserved', ?)`,
      [buyerId, orgId, unit.project_id, buyerName, buyerEmail, str(fd, 'buyer_phone') || null, unitId, new Date().toISOString()],
    );
    run(`UPDATE project_units SET status = 'reserved', buyer_id = ? WHERE id = ? AND org_id = ?`, [buyerId, unitId, orgId]);
    audit({ orgId, userId: session.userId, actor: session.name, action: 'unit.reserved', entityType: 'project_unit', entityId: unitId });
  });
  revalidatePath('/app/projects');
  return { ok: true, message: 'Unit reserved for the buyer.' };
}

export async function recordMilestoneAction(_s: ActionState, fd: FormData): Promise<ActionState> {
  const session = await requireWorkspace();
  if (!allowed(session, 'projects.write')) return { error: 'Your role cannot record milestones.' };
  const orgId = session.orgId!;
  const unitId = str(fd, 'unit_id');
  const amount = cents(fd, 'amount');
  const unit = one<{ price: number; milestone_paid: number }>(
    `SELECT price, milestone_paid FROM project_units WHERE id = ? AND org_id = ?`,
    [unitId, orgId],
  );
  if (!unit) return { error: 'Unit not found.' };
  if (amount <= 0) return { error: 'Enter the milestone amount.' };
  const paid = Math.min(unit.price, unit.milestone_paid + amount);
  run(`UPDATE project_units SET milestone_paid = ?, status = CASE WHEN ? >= price AND price > 0 THEN 'sold' ELSE status END WHERE id = ? AND org_id = ?`, [
    paid,
    paid,
    unitId,
    orgId,
  ]);
  revalidatePath('/app/projects');
  return { ok: true, message: 'Milestone payment recorded.' };
}
