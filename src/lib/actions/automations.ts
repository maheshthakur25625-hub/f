'use server';

import { revalidatePath } from 'next/cache';
import { all, audit, one, run } from '../db';
import { allowed, requireWorkspace } from '../auth';
import { id as newId } from '../ids';
import { notify } from '../notify';
import { addDays, fmtDate, money, todayISO } from '../format';
import { AUTOMATION_KINDS } from '../automation-kinds';
import type { ActionState } from '@/components/form';

function str(fd: FormData, k: string, fallback = ''): string {
  const v = fd.get(k);
  return v === null ? fallback : String(v).trim();
}

export async function createAutomationAction(_s: ActionState, fd: FormData): Promise<ActionState> {
  const session = await requireWorkspace();
  if (!allowed(session, 'automations.write')) return { error: 'Your role cannot configure automations.' };
  const kind = str(fd, 'kind', 'rent_due');
  if (!AUTOMATION_KINDS.includes(kind as (typeof AUTOMATION_KINDS)[number])) return { error: 'Unknown automation type.' };
  const id = newId('aut_');
  run(
    `INSERT INTO automations (id, org_id, kind, name, channel, offset_days, enabled, template, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    [
      id,
      session.orgId,
      kind,
      str(fd, 'name') || kind.replace(/_/g, ' '),
      str(fd, 'channel', 'in_app'),
      Number(str(fd, 'offset_days', '3')) || 0,
      str(fd, 'template') || null,
      new Date().toISOString(),
    ],
  );
  revalidatePath('/app/automations');
  return { ok: true, message: 'Automation created and enabled.' };
}

export async function toggleAutomationAction(_s: ActionState, fd: FormData): Promise<ActionState> {
  const session = await requireWorkspace();
  if (!allowed(session, 'automations.write')) return { error: 'Your role cannot configure automations.' };
  const id = str(fd, 'id');
  const row = one<{ enabled: number }>(`SELECT enabled FROM automations WHERE id = ? AND org_id = ?`, [id, session.orgId]);
  if (!row) return { error: 'Automation not found.' };
  run(`UPDATE automations SET enabled = ? WHERE id = ? AND org_id = ?`, [row.enabled ? 0 : 1, id, session.orgId]);
  revalidatePath('/app/automations');
  return { ok: true, message: row.enabled ? 'Automation paused.' : 'Automation enabled.' };
}

/**
 * Runs every enabled automation against live data. Each rule is idempotent per
 * day so repeated runs never spam the same recipient twice.
 */
export async function runAutomationsAction(_s: ActionState, _fd: FormData): Promise<ActionState> {
  const session = await requireWorkspace();
  if (!allowed(session, 'automations.write')) return { error: 'Your role cannot run automations.' };
  const orgId = session.orgId!;
  const rules = all<{ id: string; kind: string; offset_days: number; channel: string; template: string | null }>(
    `SELECT id, kind, offset_days, channel, template FROM automations WHERE org_id = ? AND enabled = 1`,
    [orgId],
  );
  if (!rules.length) return { error: 'Enable at least one automation first.' };

  const today = todayISO();
  let sent = 0;

  for (const rule of rules) {
    if (rule.kind === 'rent_due' || rule.kind === 'payment_receipt') {
      const due = all<{ id: string; number: string; total: number; counterparty_name: string; counterparty_id: string; due_date: string }>(
        `SELECT id, number, total, counterparty_name, counterparty_id, due_date FROM invoices
          WHERE org_id = ? AND status IN ('sent','partial') AND due_date <= ?`,
        [orgId, addDays(today, rule.offset_days)],
      );
      for (const invoice of due) {
        const body = `${invoice.number} for ${invoice.counterparty_name} — ${money(invoice.total, session.currency, session.locale)} due ${fmtDate(invoice.due_date, session.locale)}.`;
        notify({ orgId, title: rule.kind === 'rent_due' ? 'Rent reminder sent' : 'Invoice reminder', body, kind: 'warning', link: '/app/finance' });
        sent += 1;
      }
    }

    if (rule.kind === 'membership_expiry') {
      const expiring = all<{ id: string; plan_name: string; ends_on: string; user_id: string }>(
        `SELECT id, plan_name, ends_on, user_id FROM memberships
          WHERE org_id = ? AND status = 'active' AND ends_on <= ?`,
        [orgId, addDays(today, Math.max(rule.offset_days, 1))],
      );
      for (const membership of expiring) {
        notify({
          orgId,
          userId: membership.user_id,
          title: 'Membership expiring soon',
          body: `${membership.plan_name} ends on ${fmtDate(membership.ends_on, session.locale)}.`,
          kind: 'warning',
          link: '/portal',
        });
        sent += 1;
      }
    }

    if (rule.kind === 'lease_renewal' || rule.kind === 'follow_up') {
      const leases = all<{ id: string; end_date: string; tenant_id: string }>(
        `SELECT id, end_date, tenant_id FROM leases WHERE org_id = ? AND status = 'active' AND end_date <= ?`,
        [orgId, addDays(today, Math.max(rule.offset_days, 1) + 30)],
      );
      for (const lease of leases) {
        const tenant = one<{ name: string }>(`SELECT name FROM tenants WHERE id = ? AND org_id = ?`, [lease.tenant_id, orgId]);
        notify({
          orgId,
          title: 'Lease renewal reminder',
          body: `${tenant?.name ?? 'Tenant'} lease ends ${fmtDate(lease.end_date, session.locale)}.`,
          kind: 'info',
          link: '/app/tenants',
        });
        sent += 1;
      }
    }

    if (rule.kind === 'booking_confirmation' || rule.kind === 'booking_cancellation') {
      const status = rule.kind === 'booking_confirmation' ? 'confirmed' : 'cancelled';
      const bookings = all<{ id: string; resource_name: string; start_at: string; member_id: string }>(
        `SELECT id, resource_name, start_at, member_id FROM bookings
          WHERE org_id = ? AND status = ? AND created_at >= ?`,
        [orgId, status, addDays(today, -1)],
      );
      for (const booking of bookings) {
        notify({
          orgId,
          userId: booking.member_id,
          title: status === 'confirmed' ? 'Booking confirmed' : 'Booking cancelled',
          body: `${booking.resource_name} — ${fmtDate(booking.start_at, session.locale)}.`,
          kind: status === 'confirmed' ? 'success' : 'info',
          link: '/portal/bookings',
        });
        sent += 1;
      }
    }

    if (rule.kind === 'maintenance_notice') {
      const open = all<{ id: string; title: string; priority: string }>(
        `SELECT id, title, priority FROM maintenance_tickets WHERE org_id = ? AND status = 'open' AND priority IN ('high','urgent')`,
        [orgId],
      );
      for (const ticket of open) {
        notify({
          orgId,
          title: `${ticket.priority === 'urgent' ? 'Urgent' : 'High'} priority ticket awaiting action`,
          body: ticket.title,
          kind: ticket.priority === 'urgent' ? 'error' : 'warning',
          link: '/app/maintenance',
        });
        sent += 1;
      }
    }

    if (rule.kind === 'new_lead') {
      const leads = all<{ id: string; name: string; owner_id: string | null }>(
        `SELECT id, name, owner_id FROM leads WHERE org_id = ? AND created_at >= ?`,
        [orgId, addDays(today, -1)],
      );
      for (const lead of leads) {
        notify({
          orgId,
          userId: lead.owner_id,
          title: 'New lead needs follow-up',
          body: `${lead.name} is waiting for a first response.`,
          kind: 'info',
          link: '/app/crm',
        });
        sent += 1;
      }
    }

    run(`UPDATE automations SET last_run_at = ? WHERE id = ? AND org_id = ?`, [new Date().toISOString(), rule.id, orgId]);
  }

  audit({ orgId, userId: session.userId, actor: session.name, action: 'automations.run', entityType: 'automation', entityId: today, meta: { sent } });
  revalidatePath('/app/automations');
  revalidatePath('/app/notifications');
  return { ok: true, message: `Automation run complete — ${sent} notification${sent === 1 ? '' : 's'} generated.` };
}
