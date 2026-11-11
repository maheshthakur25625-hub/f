'use server';

import { revalidatePath } from 'next/cache';
import { all, audit, one, run, transaction } from '../db';
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
function num(fd: FormData, k: string, fallback = 0): number {
  const n = Number(str(fd, k));
  return Number.isFinite(n) ? n : fallback;
}

function notifyUser(orgId: string, userId: string, title: string, body: string, link: string) {
  run(
    `INSERT INTO notifications (id, org_id, user_id, title, body, kind, link, created_at) VALUES (?, ?, ?, ?, ?, 'booking', ?, ?)`,
    [newId('ntf_'), orgId, userId, title, body, link, new Date().toISOString()],
  );
}

/** Server-side availability check used by both the UI and the write path. */
export async function checkAvailability(orgId: string, resourceId: string, startAt: string, endAt: string) {
  return !one(
    `SELECT id FROM bookings WHERE org_id = ? AND resource_id = ?
       AND status IN ('confirmed','checked_in') AND start_at < ? AND end_at > ?`,
    [orgId, resourceId, endAt, startAt],
  );
}

export async function createBookingAction(_s: ActionState, fd: FormData): Promise<ActionState> {
  const session = await requireWorkspace();
  if (!allowed(session, 'bookings.write')) return { error: 'Your role cannot create bookings.' };
  const orgId = session.orgId!;

  const propertyId = str(fd, 'property_id');
  const [resourceType, resourceId] = str(fd, 'resource').split(':');
  const memberId = str(fd, 'member_id') || session.userId;
  const date = str(fd, 'date');
  const start = str(fd, 'start');
  const end = str(fd, 'end');
  const notes = str(fd, 'notes');

  if (!propertyId) return { error: 'Select a property.' };
  if (!['desk', 'room'].includes(resourceType) || !resourceId) return { error: 'Select a desk or meeting room.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: 'Choose a valid date.' };
  if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) return { error: 'Choose a start and end time.' };

  const startAt = new Date(`${date}T${start}:00.000Z`);
  const endAt = new Date(`${date}T${end}:00.000Z`);
  if (!(startAt < endAt)) return { error: 'The end time must be after the start time.' };
  if (endAt.getTime() - startAt.getTime() > 14 * 3600 * 1000) return { error: 'Bookings cannot exceed 14 hours.' };

  const property = one(`SELECT id FROM properties WHERE id = ? AND org_id = ?`, [propertyId, orgId]);
  if (!property) return { error: 'Property not found in this workspace.' };
  const member = one<{ id: string; name: string; email: string }>(
    `SELECT u.id, u.name, u.email FROM users u JOIN org_members m ON m.user_id = u.id
      WHERE u.id = ? AND m.org_id = ? AND m.status = 'active'`,
    [memberId, orgId],
  );
  if (!member) return { error: 'Choose an active member of this workspace.' };

  try {
    const result = transaction(() => {
      const table = resourceType === 'desk' ? 'desks' : 'rooms';
      const resource = one<{ id: string; name: string; hourly_rate: number; daily_rate?: number; status: string }>(
        `SELECT * FROM ${table} WHERE id = ? AND org_id = ? AND property_id = ?`,
        [resourceId, orgId, propertyId],
      );
      if (!resource) throw new Error('That space does not exist in this property.');
      if (resource.status === 'maintenance') throw new Error('That space is under maintenance and cannot be booked.');

      const clash = one(
        `SELECT id FROM bookings WHERE org_id = ? AND resource_id = ?
           AND status IN ('confirmed','checked_in') AND start_at < ? AND end_at > ?`,
        [orgId, resourceId, endAt.toISOString(), startAt.toISOString()],
      );
      if (clash) throw new Error('That space is already booked for the selected time. Pick another slot.');

      const hours = Math.max((endAt.getTime() - startAt.getTime()) / 3600000, 0.5);
      const daily = Number(resource.daily_rate ?? 0);
      const hourly = Number(resource.hourly_rate ?? 0);
      const total = daily > 0 && hours >= 6 ? daily : Math.round(hourly * hours);

      const bookingId = newId('bkg_');
      run(
        `INSERT INTO bookings (id, org_id, property_id, resource_type, resource_id, resource_name, member_id, start_at, end_at, status, total_amount, notes, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, ?, ?, ?)`,
        [
          bookingId,
          orgId,
          propertyId,
          resourceType,
          resourceId,
          resource.name,
          memberId,
          startAt.toISOString(),
          endAt.toISOString(),
          total,
          notes || null,
          session.userId,
          new Date().toISOString(),
        ],
      );
      audit({
        orgId,
        userId: session.userId,
        actor: session.name,
        action: 'booking.created',
        entityType: 'booking',
        entityId: bookingId,
      });
      return { bookingId, name: resource.name, total };
    });

    notifyUser(
      orgId,
      memberId,
      'Booking confirmed',
      `${result.name} is reserved for you on ${date} from ${start} to ${end}.`,
      '/portal/bookings',
    );
    revalidatePath('/app/bookings');
    revalidatePath('/portal/bookings');
    return { ok: true, message: `Confirmed ${result.name}. Availability locked for that slot.` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Booking could not be created.' };
  }
}

export async function setBookingStatusAction(_s: ActionState, fd: FormData): Promise<ActionState> {
  const session = await requireWorkspace();
  if (!allowed(session, 'bookings.write')) return { error: 'Your role cannot update bookings.' };
  const id = str(fd, 'id');
  const status = str(fd, 'status');
  if (!['confirmed', 'checked_in', 'completed', 'cancelled', 'no_show'].includes(status)) {
    return { error: 'Unsupported booking status.' };
  }
  const booking = one<{ member_id: string; resource_name: string; start_at: string }>(
    `SELECT member_id, resource_name, start_at FROM bookings WHERE id = ? AND org_id = ?`,
    [id, session.orgId],
  );
  if (!booking) return { error: 'Booking not found.' };
  run(`UPDATE bookings SET status = ? WHERE id = ? AND org_id = ?`, [status, id, session.orgId]);
  audit({
    orgId: session.orgId!,
    userId: session.userId,
    actor: session.name,
    action: `booking.${status}`,
    entityType: 'booking',
    entityId: id,
  });
  revalidatePath('/app/bookings');
  revalidatePath('/portal/bookings');
  const label = status === 'checked_in' ? 'Checked in' : status === 'completed' ? 'Checked out' : 'Booking updated';
  return { ok: true, message: `${label}.` };
}

export async function cancelBookingAction(_s: ActionState, fd: FormData): Promise<ActionState> {
  const session = await requireWorkspace();
  const id = str(fd, 'id');
  const booking = one<{ member_id: string; resource_name: string; start_at: string }>(
    `SELECT member_id, resource_name, start_at FROM bookings WHERE id = ? AND org_id = ?`,
    [id, session.orgId],
  );
  if (!booking) return { error: 'Booking not found.' };
  const isOwn = booking.member_id === session.userId;
  if (!allowed(session, 'bookings.write') && !isOwn) return { error: 'You can only cancel your own bookings.' };
  run(`UPDATE bookings SET status = 'cancelled' WHERE id = ? AND org_id = ?`, [id, session.orgId]);
  audit({
    orgId: session.orgId!,
    userId: session.userId,
    actor: session.name,
    action: 'booking.cancelled',
    entityType: 'booking',
    entityId: id,
  });
  notifyUser(session.orgId!, booking.member_id, 'Booking cancelled', `${booking.resource_name} was released.`, '/portal/bookings');
  revalidatePath('/app/bookings');
  revalidatePath('/portal/bookings');
  return { ok: true, message: 'Booking cancelled and the space released.' };
}

/* ------------------------------ memberships ------------------------------ */

export async function createMembershipPlanAction(_s: ActionState, fd: FormData): Promise<ActionState> {
  const session = await requireWorkspace();
  if (!allowed(session, 'memberships.write')) return { error: 'Your role cannot manage membership plans.' };
  const name = str(fd, 'name');
  if (!name) return { error: 'Enter a plan name.' };
  run(
    `INSERT INTO membership_plans (id, org_id, name, price, period, description, room_hours, day_passes, active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    [
      newId('mpl_'),
      session.orgId,
      name,
      cents(fd, 'price'),
      str(fd, 'period', 'monthly'),
      str(fd, 'description') || null,
      num(fd, 'room_hours', 0),
      num(fd, 'day_passes', 0),
      new Date().toISOString(),
    ],
  );
  revalidatePath('/app/members');
  return { ok: true, message: 'Membership plan created.' };
}

export async function assignMembershipAction(_s: ActionState, fd: FormData): Promise<ActionState> {
  const session = await requireWorkspace();
  if (!allowed(session, 'memberships.write')) return { error: 'Your role cannot assign memberships.' };
  const orgId = session.orgId!;
  const userId = str(fd, 'user_id');
  const planId = str(fd, 'plan_id');
  const startsOn = str(fd, 'starts_on');
  if (!userId || !planId) return { error: 'Choose a member and a plan.' };

  const plan = one<{ id: string; name: string; price: number; period: string }>(
    `SELECT id, name, price, period FROM membership_plans WHERE id = ? AND org_id = ? AND active = 1`,
    [planId, orgId],
  );
  if (!plan) return { error: 'Membership plan not found.' };
  const member = one(`SELECT user_id FROM org_members WHERE user_id = ? AND org_id = ?`, [userId, orgId]);
  if (!member) return { error: 'That person is not part of this workspace.' };

  const start = startsOn || new Date().toISOString().slice(0, 10);
  const months = plan.period === 'yearly' ? 12 : plan.period === 'weekly' ? 0 : 1;
  const endDate = new Date(`${start}T00:00:00.000Z`);
  if (plan.period === 'yearly') endDate.setUTCFullYear(endDate.getUTCFullYear() + 1);
  else if (plan.period === 'weekly') endDate.setUTCDate(endDate.getUTCDate() + 7);
  else if (plan.period === 'daily') endDate.setUTCDate(endDate.getUTCDate() + 1);
  else endDate.setUTCMonth(endDate.getUTCMonth() + months);

  run(
    `INSERT INTO memberships (id, org_id, user_id, plan_id, plan_name, price, period, starts_on, ends_on, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
    [
      newId('mem_'),
      orgId,
      userId,
      plan.id,
      plan.name,
      plan.price,
      plan.period,
      start,
      endDate.toISOString().slice(0, 10),
      new Date().toISOString(),
    ],
  );
  audit({ orgId, userId: session.userId, actor: session.name, action: 'membership.assigned', entityType: 'membership', entityId: userId });
  revalidatePath('/app/members');
  return { ok: true, message: `${plan.name} activated.` };
}

export async function setMembershipStatusAction(_s: ActionState, fd: FormData): Promise<ActionState> {
  const session = await requireWorkspace();
  if (!allowed(session, 'memberships.write')) return { error: 'Your role cannot manage memberships.' };
  const id = str(fd, 'id');
  const status = str(fd, 'status', 'active');
  run(`UPDATE memberships SET status = ? WHERE id = ? AND org_id = ?`, [status, id, session.orgId]);
  revalidatePath('/app/members');
  return { ok: true, message: 'Membership updated.' };
}

export async function createMemberAction(_s: ActionState, fd: FormData): Promise<ActionState> {
  const session = await requireWorkspace();
  if (!allowed(session, 'members.write')) return { error: 'Your role cannot add members.' };
  const orgId = session.orgId!;
  const name = str(fd, 'name');
  const email = str(fd, 'email').toLowerCase();
  if (name.length < 2) return { error: 'Enter the member name.' };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: 'Enter a valid email address.' };

  const existing = one<{ id: string }>(`SELECT id FROM users WHERE email = ?`, [email]);
  if (existing) {
    const inOrg = one(`SELECT id FROM org_members WHERE org_id = ? AND user_id = ?`, [orgId, existing.id]);
    if (inOrg) return { error: 'That person is already in this workspace.' };
    run(`INSERT INTO org_members (id, org_id, user_id, role, title, status, created_at) VALUES (?, ?, ?, 'member', ?, 'active', ?)`, [
      newId('om_'),
      orgId,
      existing.id,
      str(fd, 'title') || 'Member',
      new Date().toISOString(),
    ]);
    revalidatePath('/app/members');
    return { ok: true, message: 'Existing user added to the workspace.' };
  }

  const { hashPassword } = await import('../password');
  const temp = `SP-${Math.random().toString(36).slice(2, 10)}`;
  const userId = newId('usr_');
  run(
    `INSERT INTO users (id, email, name, password_hash, email_verified_at, is_platform_admin, created_at)
     VALUES (?, ?, ?, ?, ?, 0, ?)`,
    [userId, email, name, hashPassword(temp), new Date().toISOString(), new Date().toISOString()],
  );
  run(`INSERT INTO org_members (id, org_id, user_id, role, title, status, created_at) VALUES (?, ?, ?, 'member', ?, 'active', ?)`, [
    newId('om_'),
    orgId,
    userId,
    str(fd, 'title') || 'Member',
    new Date().toISOString(),
  ]);
  revalidatePath('/app/members');
  return { ok: true, message: `Member created. Temporary password: ${temp}` };
}

export async function availabilityForDay(orgId: string, propertyId: string, date: string) {
  const startAt = new Date(`${date}T00:00:00.000Z`).toISOString();
  const endAt = new Date(`${date}T23:59:59.000Z`).toISOString();
  const desks = all<{ id: string; name: string; category: string; daily_rate: number; busy: number }>(
    `SELECT d.id, d.name, d.category, d.daily_rate,
            (SELECT COUNT(*) FROM bookings b WHERE b.resource_id = d.id AND b.org_id = d.org_id
              AND b.status IN ('confirmed','checked_in') AND b.start_at < ? AND b.end_at > ?) AS busy
       FROM desks d WHERE d.org_id = ? AND d.property_id = ? ORDER BY d.name`,
    [endAt, startAt, orgId, propertyId],
  );
  const rooms = all<{ id: string; name: string; capacity: number; hourly_rate: number; busy: number }>(
    `SELECT r.id, r.name, r.capacity, r.hourly_rate,
            (SELECT COUNT(*) FROM bookings b WHERE b.resource_id = r.id AND b.org_id = r.org_id
              AND b.status IN ('confirmed','checked_in') AND b.start_at < ? AND b.end_at > ?) AS busy
       FROM rooms r WHERE r.org_id = ? AND r.property_id = ? ORDER BY r.name`,
    [endAt, startAt, orgId, propertyId],
  );
  return { desks, rooms };
}
