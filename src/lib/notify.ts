import { all, one, run } from './db';
import { id as newId } from './ids';
import { fmtDate, money } from './format';

export function notify(entry: {
  orgId: string;
  userId?: string | null;
  title: string;
  body?: string;
  kind?: 'info' | 'success' | 'warning' | 'error';
  link?: string;
}) {
  run(
    `INSERT INTO notifications (id, org_id, user_id, title, body, kind, link, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [newId('ntf_'), entry.orgId, entry.userId ?? null, entry.title, entry.body ?? null, entry.kind ?? 'info', entry.link ?? null, new Date().toISOString()],
  );
}

/** Email/SMS delivery is gated on provider configuration; in-app notifications always work. */
export function deliveryChannels(): { email: boolean; sms: boolean; whatsapp: boolean } {
  return {
    email: Boolean(process.env.RESEND_API_KEY),
    sms: Boolean(process.env.TWILIO_AUTH_TOKEN),
    whatsapp: Boolean(process.env.TWILIO_WHATSAPP_FROM),
  };
}

export type AutomationResult = { automation: string; matched: number; message: string };

/**
 * Executes the org's enabled automations against live data and writes in-app
 * notifications. Email/SMS legs are skipped (and reported) when unconfigured.
 */
export function runAutomations(orgId: string, currency: string, locale: string): AutomationResult[] {
  const rows = all<{ id: string; kind: string; name: string; channel: string; offset_days: number; enabled: number }>(
    `SELECT * FROM automations WHERE org_id = ? AND enabled = 1`,
    [orgId],
  );
  const channels = deliveryChannels();
  const results: AutomationResult[] = [];
  const nowIso = new Date().toISOString();

  for (const auto of rows) {
    let matched = 0;
    let message = '';

    if (auto.kind === 'rent_due') {
      const horizon = new Date(Date.now() + auto.offset_days * 86400000).toISOString().slice(0, 10);
      const due = all<{ id: string; number: string; counterparty_name: string; total: number; due_date: string }>(
        `SELECT id, number, counterparty_name, total, due_date FROM invoices
          WHERE org_id = ? AND status IN ('sent','overdue') AND due_date <= ?`,
        [orgId, horizon],
      );
      matched = due.length;
      for (const inv of due) {
        notify({
          orgId,
          title: `Rent reminder · ${inv.number}`,
          body: `${inv.counterparty_name} has ${money(inv.total, currency, locale)} due by ${fmtDate(inv.due_date, locale)}.`,
          kind: 'warning',
          link: '/app/finance',
        });
      }
      message = `${matched} unpaid invoice(s) within ${auto.offset_days} days`;
    }

    if (auto.kind === 'membership_expiry') {
      const horizon = new Date(Date.now() + auto.offset_days * 86400000).toISOString().slice(0, 10);
      const expiring = all<{ id: string; plan_name: string; ends_on: string; user_name: string | null }>(
        `SELECT ms.id, ms.plan_name, ms.ends_on, u.name AS user_name
           FROM memberships ms LEFT JOIN users u ON u.id = ms.user_id
          WHERE ms.org_id = ? AND ms.status = 'active' AND ms.ends_on <= ?`,
        [orgId, horizon],
      );
      matched = expiring.length;
      for (const m of expiring) {
        notify({
          orgId,
          title: `Membership expiring · ${m.user_name ?? 'Member'}`,
          body: `${m.plan_name} ends ${fmtDate(m.ends_on, locale)}. Send a renewal offer.`,
          kind: 'warning',
          link: '/app/members',
        });
      }
      message = `${matched} membership(s) expiring within ${auto.offset_days} days`;
    }

    if (auto.kind === 'lease_renewal') {
      const horizon = new Date(Date.now() + auto.offset_days * 86400000).toISOString().slice(0, 10);
      const leases = all<{ id: string; end_date: string; tenant_name: string | null; unit_name: string | null }>(
        `SELECT l.id, l.end_date, t.name AS tenant_name, u.name AS unit_name
           FROM leases l LEFT JOIN tenants t ON t.id = l.tenant_id LEFT JOIN units u ON u.id = l.unit_id
          WHERE l.org_id = ? AND l.status = 'active' AND l.end_date <= ?`,
        [orgId, horizon],
      );
      matched = leases.length;
      for (const l of leases) {
        notify({
          orgId,
          title: `Lease renewal · ${l.tenant_name ?? 'Tenant'}`,
          body: `Lease for ${l.unit_name ?? 'unit'} ends ${fmtDate(l.end_date, locale)}.`,
          kind: 'info',
          link: '/app/tenants',
        });
      }
      message = `${matched} lease(s) ending within ${auto.offset_days} days`;
    }

    if (auto.kind === 'maintenance_sla') {
      const open = all<{ id: string; title: string; priority: string }>(
        `SELECT id, title, priority FROM maintenance_tickets WHERE org_id = ? AND status = 'open'`,
        [orgId],
      );
      matched = open.length;
      for (const t of open) {
        notify({ orgId, title: `Open ticket · ${t.title}`, body: `${t.priority} priority ticket still awaiting assignment.`, kind: 'warning', link: '/app/maintenance' });
      }
      message = `${matched} open ticket(s) awaiting triage`;
    }

    if (auto.kind === 'lead_follow_up') {
      const leads = all<{ id: string; name: string; next_follow_up: string }>(
        `SELECT id, name, next_follow_up FROM leads WHERE org_id = ? AND next_follow_up IS NOT NULL AND next_follow_up <= ?`,
        [orgId, new Date(Date.now() + auto.offset_days * 86400000).toISOString().slice(0, 10)],
      );
      matched = leads.length;
      for (const l of leads) {
        notify({ orgId, title: `Follow up with ${l.name}`, body: `Scheduled for ${fmtDate(l.next_follow_up, locale)}.`, kind: 'info', link: '/app/crm' });
      }
      message = `${matched} lead(s) due for follow-up`;
    }

    const delivered = auto.channel === 'email' ? channels.email : auto.channel === 'sms' ? channels.sms : true;
    if (!delivered) {
      message += ` · ${auto.channel} delivery not configured, queued in-app only`;
    }

    run(`INSERT INTO automation_runs (id, org_id, automation_id, matched, created_at) VALUES (?, ?, ?, ?, ?)`, [
      newId('run_'),
      orgId,
      auto.id,
      matched,
      nowIso,
    ]);
    run(`UPDATE automations SET last_run_at = ? WHERE id = ?`, [nowIso, auto.id]);
    results.push({ automation: auto.name, matched, message });
  }

  return results;
}

export function ensureDefaultAutomations(orgId: string) {
  const existing = one<{ c: number }>(`SELECT COUNT(*) AS c FROM automations WHERE org_id = ?`, [orgId]);
  if (Number(existing?.c ?? 0) > 0) return;
  const defaults = [
    ['rent_due', 'Rent due reminder', 'in_app', 5],
    ['membership_expiry', 'Membership expiry reminder', 'in_app', 7],
    ['lease_renewal', 'Lease renewal reminder', 'in_app', 60],
    ['maintenance_sla', 'Maintenance notification', 'in_app', 1],
    ['lead_follow_up', 'Lead follow-up reminder', 'in_app', 2],
  ];
  const now = new Date().toISOString();
  for (const [kind, name, channel, offset] of defaults) {
    run(
      `INSERT INTO automations (id, org_id, kind, name, channel, offset_days, enabled, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
      [newId('aut_'), orgId, kind, name, channel, offset, now],
    );
  }
}
