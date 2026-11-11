'use server';

import { revalidatePath } from 'next/cache';
import { audit, one, run } from '../db';
import { allowed, requireWorkspace } from '../auth';
import { id as newId } from '../ids';
import { notify } from '../notify';
import type { ActionState } from '@/components/form';

function str(fd: FormData, k: string, fallback = ''): string {
  const v = fd.get(k);
  return v === null ? fallback : String(v).trim();
}
function cents(fd: FormData, k: string): number {
  return Math.max(0, Math.round(Number(str(fd, k) || 0) * 100));
}

/** Lightweight classifier so tickets arrive with a sensible priority. */
function classify(title: string, description: string, chosen: string): string {
  if (chosen && chosen !== 'auto') return chosen;
  const text = `${title} ${description}`.toLowerCase();
  if (/(leak|flood|fire|smoke|electrical|security|gas|broken glass|no water)/.test(text)) return 'urgent';
  if (/(heat|heating|ac|air con|wifi|internet|door|lift|elevator|plumb)/.test(text)) return 'high';
  if (/(clean|light|paint|furniture|noise)/.test(text)) return 'low';
  return 'normal';
}

export async function createTicketAction(_s: ActionState, fd: FormData): Promise<ActionState> {
  const session = await requireWorkspace();
  if (!allowed(session, 'maintenance.write') && !allowed(session, 'maintenance.view')) {
    return { error: 'Your role cannot raise maintenance requests.' };
  }
  const orgId = session.orgId!;
  const title = str(fd, 'title');
  if (title.length < 3) return { error: 'Describe the issue in the title.' };
  const propertyId = str(fd, 'property_id');
  if (!one(`SELECT id FROM properties WHERE id = ? AND org_id = ?`, [propertyId, orgId])) {
    return { error: 'Choose a property.' };
  }
  const unitId = str(fd, 'unit_id') || null;
  if (unitId && !one(`SELECT id FROM units WHERE id = ? AND org_id = ? AND property_id = ?`, [unitId, orgId, propertyId])) {
    return { error: 'That unit does not belong to the selected property.' };
  }

  const description = str(fd, 'description');
  const priority = classify(title, description, str(fd, 'priority', 'auto'));
  const ticketId = newId('tkt_');
  run(
    `INSERT INTO maintenance_tickets (id, org_id, property_id, unit_id, title, description, priority, status, assignee_id, vendor_id, cost, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?)`,
    [
      ticketId,
      orgId,
      propertyId,
      unitId,
      title,
      description || null,
      priority,
      str(fd, 'assignee_id') || null,
      str(fd, 'vendor_id') || null,
      cents(fd, 'cost'),
      session.userId,
      new Date().toISOString(),
    ],
  );
  audit({ orgId, userId: session.userId, actor: session.name, action: 'maintenance.created', entityType: 'ticket', entityId: ticketId });
  notify({
    orgId,
    title: `New ${priority} maintenance ticket`,
    body: `${title} — raised by ${session.name}.`,
    kind: priority === 'urgent' ? 'error' : 'warning',
    link: '/app/maintenance',
  });
  revalidatePath('/app/maintenance');
  return { ok: true, message: `Ticket created with ${priority} priority.` };
}

export async function updateTicketAction(_s: ActionState, fd: FormData): Promise<ActionState> {
  const session = await requireWorkspace();
  if (!allowed(session, 'maintenance.write')) return { error: 'Your role cannot update tickets.' };
  const orgId = session.orgId!;
  const id = str(fd, 'id');
  const ticket = one<{ status: string; title: string; created_by: string }>(
    `SELECT status, title, created_by FROM maintenance_tickets WHERE id = ? AND org_id = ?`,
    [id, orgId],
  );
  if (!ticket) return { error: 'Ticket not found.' };

  const status = str(fd, 'status', ticket.status);
  const assignee = str(fd, 'assignee_id');
  const vendor = str(fd, 'vendor_id');
  const cost = cents(fd, 'cost');
  run(
    `UPDATE maintenance_tickets
        SET status = ?, assignee_id = COALESCE(NULLIF(?, ''), assignee_id), vendor_id = COALESCE(NULLIF(?, ''), vendor_id),
            cost = CASE WHEN ? > 0 THEN ? ELSE cost END,
            completed_at = CASE WHEN ? = 'completed' THEN ? ELSE completed_at END
      WHERE id = ? AND org_id = ?`,
    [status, assignee, vendor, cost, cost, status, new Date().toISOString(), id, orgId],
  );
  if (status !== ticket.status) {
    notify({
      orgId,
      userId: ticket.created_by,
      title: `Ticket ${status.replace('_', ' ')}`,
      body: `${ticket.title} is now ${status.replace('_', ' ')}.`,
      kind: status === 'completed' ? 'success' : 'info',
      link: '/app/maintenance',
    });
  }
  audit({ orgId, userId: session.userId, actor: session.name, action: `maintenance.${status}`, entityType: 'ticket', entityId: id });
  revalidatePath('/app/maintenance');
  return { ok: true, message: 'Ticket updated.' };
}

export async function addTicketNoteAction(_s: ActionState, fd: FormData): Promise<ActionState> {
  const session = await requireWorkspace();
  if (!allowed(session, 'maintenance.write')) return { error: 'Your role cannot update tickets.' };
  const id = str(fd, 'id');
  const body = str(fd, 'body');
  if (!body) return { error: 'Write a note first.' };
  const ticket = one(`SELECT id FROM maintenance_tickets WHERE id = ? AND org_id = ?`, [id, session.orgId]);
  if (!ticket) return { error: 'Ticket not found.' };
  run(
    `INSERT INTO activities (id, org_id, entity_type, entity_id, kind, body, user_id, created_at)
     VALUES (?, ?, 'ticket', ?, 'note', ?, ?, ?)`,
    [newId('act_'), session.orgId, id, body, session.userId, new Date().toISOString()],
  );
  revalidatePath('/app/maintenance');
  return { ok: true, message: 'Note added.' };
}
