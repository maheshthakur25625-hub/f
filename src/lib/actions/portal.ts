'use server';

import { revalidatePath } from 'next/cache';
import { all, one, run, transaction } from '../db';
import { requirePortal } from '../auth';
import { id as newId } from '../ids';
import { notify } from '../notify';
import { checkAvailability } from './bookings';
import type { ActionState } from '@/components/form';

function str(fd: FormData, k: string, fallback = ''): string {
  const v = fd.get(k);
  return v === null ? fallback : String(v).trim();
}

function cents(fd: FormData, k: string): number {
  const n = Number(str(fd, k).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? Math.round(n) : 0;
}

/** Member self-service booking with server-side availability validation. */
export async function portalBookAction(_s: ActionState, fd: FormData): Promise<ActionState> {
  const session = await requirePortal();
  const orgId = session.orgId!;
  const resourceType = str(fd, 'resource_type', 'desk');
  const resourceId = str(fd, 'resource_id');
  const date = str(fd, 'date');
  const from = str(fd, 'from', '09:00');
  const to = str(fd, 'to', '18:00');
  if (!resourceId || !date) return { error: 'Choose a space and a date.' };
  if (to <= from) return { error: 'End time must be after the start time.' };

  const resource =
    resourceType === 'room'
      ? one<Record<string, any>>(`SELECT r.*, p.name AS property_name FROM rooms r JOIN properties p ON p.id = r.property_id WHERE r.id = ? AND r.org_id = ?`, [resourceId, orgId])
      : one<Record<string, any>>(`SELECT d.*, p.name AS property_name FROM desks d JOIN properties p ON p.id = d.property_id WHERE d.id = ? AND d.org_id = ?`, [resourceId, orgId]);
  if (!resource) return { error: 'That space is not available in your workspace.' };

  const startAt = new Date(`${date}T${from}:00`).toISOString();
  const endAt = new Date(`${date}T${to}:00`).toISOString();
  const amount = resourceType === 'room'
    ? Math.round((Number(resource.hourly_rate ?? 0) * Math.max(1, (new Date(endAt).getTime() - new Date(startAt).getTime()) / 3600000)))
    : Number(resource.daily_rate ?? 0);

  try {
    transaction(() => {
      if (!checkAvailability(orgId, resourceId, startAt, endAt)) {
        throw new Error('That space is already booked for this time.');
      }
      run(
        `INSERT INTO bookings (id, org_id, property_id, resource_type, resource_id, resource_name, member_id, start_at, end_at, status, total_amount, notes, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, ?, ?, ?)`,
        [
          newId('bkg'),
          orgId,
          resource.property_id,
          resourceType,
          resourceId,
          resource.name,
          session.userId,
          startAt,
          endAt,
          amount,
          str(fd, 'notes'),
          session.userId,
          new Date().toISOString(),
        ],
      );
      notify({
        orgId,
        userId: session.userId,
        title: 'Booking confirmed',
        body: `${resource.name} on ${date} ${from}–${to}.`,
        kind: 'success',
        link: '/portal/bookings',
      });
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Could not complete the booking.' };
  }

  revalidatePath('/portal');
  revalidatePath('/portal/bookings');
  return { ok: true, message: 'Booking confirmed.' };
}

export async function portalCancelBookingAction(fd: FormData): Promise<void> {
  const session = await requirePortal();
  const id = str(fd, 'id');
  const booking = one<Record<string, any>>(`SELECT * FROM bookings WHERE id = ? AND org_id = ? AND member_id = ?`, [id, session.orgId!, session.userId]);
  if (!booking) return;
  run(`UPDATE bookings SET status = 'cancelled' WHERE id = ? AND org_id = ? AND member_id = ?`, [id, session.orgId!, session.userId]);
  notify({
    orgId: session.orgId!,
    userId: session.userId,
    title: 'Booking cancelled',
    body: `${booking.resource_name} on ${new Date(booking.start_at).toISOString().slice(0, 10)} was cancelled.`,
    kind: 'warning',
    link: '/portal/bookings',
  });
  revalidatePath('/portal/bookings');
}

export async function portalRequestAction(_s: ActionState, fd: FormData): Promise<ActionState> {
  const session = await requirePortal();
  const title = str(fd, 'title');
  if (!title) return { error: 'Describe the issue in a title.' };
  const description = str(fd, 'description');
  const priority = /urgent|flood|leak|fire|power|security/i.test(`${title} ${description}`) ? 'high' : str(fd, 'priority', 'medium');

  run(
    `INSERT INTO maintenance_tickets (id, org_id, property_id, unit_id, title, description, priority, status, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)`,
    [newId('tkt'), session.orgId!, str(fd, 'property_id') || null, str(fd, 'unit_id') || null, title, description, priority, session.userId, new Date().toISOString()],
  );
  notify({ orgId: session.orgId!, title: 'New maintenance request', body: title, kind: 'warning', link: '/app/maintenance' });
  revalidatePath('/portal/requests');
  revalidatePath('/app/maintenance');
  return { ok: true, message: 'Request submitted — the team has been notified.' };
}

export async function portalProfileAction(_s: ActionState, fd: FormData): Promise<ActionState> {
  const session = await requirePortal();
  const name = str(fd, 'name');
  if (!name) return { error: 'Name is required.' };
  run(`UPDATE users SET name = ? WHERE id = ?`, [name, session.userId]);
  run(`UPDATE organizations SET name = name WHERE id = ?`, [session.orgId!]);
  revalidatePath('/portal/profile');
  return { ok: true, message: 'Profile updated.' };
}

/** Member-visible documents only: their own lease and their org's published files. */
export async function portalDocuments(orgId: string, userId: string) {
  return all<Record<string, any>>(
    `SELECT d.id, d.name, d.mime, d.size, d.created_at FROM documents d
      WHERE d.org_id = ? AND (
        d.entity_type = 'tenant' AND d.entity_id IN (SELECT id FROM tenants WHERE org_id = ? AND email = (SELECT email FROM users WHERE id = ?))
      ) ORDER BY d.created_at DESC`,
    [orgId, orgId, userId],
  );
}
