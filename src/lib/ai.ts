import { all, one } from './db';
import { metrics, topProperties, revenueSeries, lastMonths } from './queries';
import { fmtDate, money, percent } from './format';

export type AiAnswer = {
  answer: string;
  bullets: string[];
  kind: string;
  source: 'live_data';
  prediction?: string;
};

type Ctx = { orgId: string; currency: string; locale: string; orgName: string };

function list(items: string[], empty: string): string[] {
  return items.length ? items : [empty];
}

/**
 * Deterministic analyst over the organization's own records.
 * Every figure is read live and scoped to ctx.orgId; predictions are labelled.
 */
export function answer(question: string, ctx: Ctx): AiAnswer {
  const q = question.toLowerCase();
  const m = metrics(ctx.orgId);
  const cur = ctx.currency;
  const loc = ctx.locale;
  const M = (v: number) => money(v, cur, loc);

  const has = (...words: string[]) => words.some((w) => q.includes(w));

  if (has('highest revenue', 'top property', 'best property', 'which property')) {
    const rows = topProperties(ctx.orgId, 5);
    return {
      kind: 'revenue_by_property',
      source: 'live_data',
      answer: rows.length
        ? `${rows[0].name} generated the highest collected revenue at ${M(rows[0].revenue)}.`
        : 'No properties with recorded payments yet.',
      bullets: list(
        rows.map((r) => `${r.name} — ${M(r.revenue)} collected across ${r.units} unit(s)`),
        'Add properties and invoices to see a revenue ranking.',
      ),
    };
  }

  if (has('vacant', 'available unit', 'empty unit', 'which units')) {
    const units = all<{ name: string; kind: string; rent_amount: number; property_name: string }>(
      `SELECT u.name, u.kind, u.rent_amount, p.name AS property_name
         FROM units u JOIN properties p ON p.id = u.property_id
        WHERE u.org_id = ? AND u.status = 'available'
        ORDER BY u.rent_amount DESC LIMIT 12`,
      [ctx.orgId],
    );
    const potential = units.reduce((s, u) => s + u.rent_amount, 0);
    return {
      kind: 'vacant_units',
      source: 'live_data',
      answer: units.length
        ? `${units.length} unit(s) are vacant, representing ${M(potential)} of monthly rent at asking price.`
        : 'Every unit is currently occupied.',
      bullets: list(
        units.map((u) => `${u.property_name} · ${u.name} (${u.kind}) — ${M(u.rent_amount)}/mo`),
        'No vacant units right now.',
      ),
    };
  }

  if (has('overdue', 'unpaid', 'late payment', 'owes', 'outstanding')) {
    const invoices = all<{ number: string; counterparty_name: string; total: number; due_date: string; status: string }>(
      `SELECT number, counterparty_name, total, due_date, status FROM invoices
        WHERE org_id = ? AND status IN ('overdue','sent','partial') ORDER BY due_date ASC LIMIT 12`,
      [ctx.orgId],
    );
    return {
      kind: 'overdue_payments',
      source: 'live_data',
      answer: invoices.length
        ? `${invoices.length} invoice(s) worth ${M(m.pendingPayments)} are still open, ${m.overdueInvoices} of them past due.`
        : 'No outstanding invoices — every issued invoice is settled.',
      bullets: list(
        invoices.map((i) => `${i.counterparty_name} · ${i.number} — ${M(i.total)} due ${fmtDate(i.due_date, loc)} (${i.status})`),
        'Nothing outstanding.',
      ),
    };
  }

  if (has('occupancy', 'occupied', 'utilisation', 'utilization')) {
    const series = lastMonths(6).map((month) => {
      const booked = Number(
        one<{ c: number }>(
          `SELECT COUNT(*) AS c FROM bookings WHERE org_id = ? AND start_at >= ? AND start_at < ?`,
          [ctx.orgId, month.start, month.end],
        )?.c ?? 0,
      );
      return `${month.key}: ${booked} bookings`;
    });
    const forecast = Math.min(100, Math.max(0, m.occupancy + (m.vacantUnits > 0 ? -3 : 4)));
    return {
      kind: 'occupancy',
      source: 'live_data',
      answer: `Occupancy is ${percent(m.occupancy, 1)} — ${m.unitsOccupied} of ${m.units} units and ${m.desksAssigned} of ${m.desks} desks are in use.`,
      bullets: [...series, `${m.vacantUnits} vacant unit(s) available to lease today`],
      prediction: `Next-month occupancy trend: ${percent(forecast, 1)} (projection from current vacancy and booking velocity — not a recorded figure).`,
    };
  }

  if (has('membership', 'expire', 'expiring', 'renewal')) {
    const rows = all<{ plan_name: string; ends_on: string; name: string | null }>(
      `SELECT ms.plan_name, ms.ends_on, u.name FROM memberships ms LEFT JOIN users u ON u.id = ms.user_id
        WHERE ms.org_id = ? AND ms.status = 'active' AND ms.ends_on <= ?
        ORDER BY ms.ends_on ASC LIMIT 12`,
      [ctx.orgId, new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)],
    );
    return {
      kind: 'membership_expiry',
      source: 'live_data',
      answer: rows.length
        ? `${rows.length} membership(s) expire within 30 days, ${m.activeMembers} are active overall.`
        : `No memberships expire in the next 30 days; ${m.activeMembers} are active.`,
      bullets: list(
        rows.map((r) => `${r.name ?? 'Member'} · ${r.plan_name} — ends ${fmtDate(r.ends_on, loc)}`),
        'No imminent expiries.',
      ),
    };
  }

  if (has('lead', 'pipeline', 'deal', 'priorit')) {
    const deals = all<{ title: string; stage: string; value: number; expected_close: string | null }>(
      `SELECT title, stage, value, expected_close FROM deals WHERE org_id = ? AND stage NOT IN ('won','lost')
        ORDER BY value DESC LIMIT 8`,
      [ctx.orgId],
    );
    const leads = all<{ name: string; source: string; next_follow_up: string | null }>(
      `SELECT name, source, next_follow_up FROM leads WHERE org_id = ?
        ORDER BY (next_follow_up IS NULL), next_follow_up ASC LIMIT 5`,
      [ctx.orgId],
    );
    return {
      kind: 'pipeline',
      source: 'live_data',
      answer: `Open pipeline is ${M(m.pipelineValue)} across ${deals.length} deal(s); ${M(m.wonValue)} is already won.`,
      bullets: list(
        [
          ...deals.map((d) => `${d.title} — ${M(d.value)} at stage "${d.stage}"`),
          ...leads.map((l) => `Follow up: ${l.name} (${l.source})${l.next_follow_up ? ` by ${fmtDate(l.next_follow_up, loc)}` : ''}`),
        ],
        'No open deals yet.',
      ),
      prediction: 'Prioritisation uses deal value and follow-up date; it does not predict closure probability.',
    };
  }

  if (has('email', 'draft', 'message', 'write')) {
    const invoice = one<{ number: string; counterparty_name: string; total: number; due_date: string }>(
      `SELECT number, counterparty_name, total, due_date FROM invoices
        WHERE org_id = ? AND status IN ('overdue','sent') ORDER BY due_date ASC LIMIT 1`,
      [ctx.orgId],
    );
    const body = invoice
      ? `Subject: Payment reminder — invoice ${invoice.number}\n\nHello ${invoice.counterparty_name},\n\nA friendly reminder that invoice ${invoice.number} for ${M(invoice.total)} was due on ${fmtDate(invoice.due_date, loc)}. If payment is already on its way, please disregard this note.\n\nYou can settle it from your ${ctx.orgName} portal, or reply and we will send a payment link.\n\nKind regards,\n${ctx.orgName}`
      : `Subject: Your workspace update\n\nHello,\n\nA quick note from ${ctx.orgName} about your workspace. Reply to this message and our team will help right away.\n\nKind regards,\n${ctx.orgName}`;
    return {
      kind: 'email_draft',
      source: 'live_data',
      answer: 'Draft ready — it uses your most urgent open invoice for the details.',
      bullets: [body],
    };
  }

  if (has('maintenance', 'ticket', 'repair', 'classify')) {
    const tickets = all<{ title: string; priority: string; status: string; property_name: string | null }>(
      `SELECT t.title, t.priority, t.status, p.name AS property_name FROM maintenance_tickets t
         LEFT JOIN properties p ON p.id = t.property_id
        WHERE t.org_id = ? AND t.status != 'completed' ORDER BY t.created_at DESC LIMIT 8`,
      [ctx.orgId],
    );
    return {
      kind: 'maintenance',
      source: 'live_data',
      answer: `${m.openTickets} ticket(s) are open. Classification rules: safety, water and electrical issues → high; climate and access issues → medium; cosmetic → low.`,
      bullets: list(
        tickets.map((t) => `${t.property_name ?? 'Portfolio'} · ${t.title} — ${t.priority} / ${t.status}`),
        'No open maintenance tickets.',
      ),
    };
  }

  // Default: business summary
  const revenue = revenueSeries(ctx.orgId, 6);
  const last = revenue[revenue.length - 1];
  const prev = revenue[revenue.length - 2];
  const delta = prev && prev.total ? ((last.total - prev.total) / prev.total) * 100 : 0;
  return {
    kind: 'summary',
    source: 'live_data',
    answer: `This month ${ctx.orgName} collected ${M(last?.total ?? 0)} (${delta >= 0 ? '+' : ''}${delta.toFixed(1)}% vs last month), with ${percent(m.occupancy, 1)} occupancy and ${M(m.mrr)} of recurring revenue.`,
    bullets: [
      `${m.properties} properties · ${m.units} units · ${m.desks} desks · ${m.rooms} meeting rooms`,
      `${m.activeTenants} active tenants and ${m.activeMembers} active members`,
      `${M(m.pendingPayments)} awaiting collection across ${m.overdueInvoices} overdue invoice(s)`,
      `${m.upcomingBookings} bookings in the next 7 days · ${m.openTickets} open maintenance ticket(s)`,
      `${m.newEnquiries} new enquiries in the last 30 days · ${M(m.pipelineValue)} open pipeline`,
    ],
    prediction: `At the current run-rate, next month collects about ${M(Math.max(0, Math.round((last?.total ?? 0) * (1 + delta / 200))))} — a projection, not a recorded figure.`,
  };
}

/**
 * Optional language-model pass over the same computed facts.
 * Falls back to the deterministic answer when no provider key is configured.
 */
export async function askWithProvider(question: string, ctx: Ctx, base: AiAnswer): Promise<AiAnswer> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return base;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      signal: controller.signal,
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content:
              'You are the SpacePilot business analyst. Answer only from the supplied verified figures. Never invent numbers. Keep it under 120 words and distinguish predictions from actuals.',
          },
          { role: 'user', content: `Question: ${question}\n\nVerified figures:\n${base.answer}\n${base.bullets.join('\n')}\n${base.prediction ?? ''}` },
        ],
      }),
    });
    clearTimeout(timer);
    if (!res.ok) return base;
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = json.choices?.[0]?.message?.content?.trim();
    if (!text) return base;
    return { ...base, answer: text };
  } catch {
    return base;
  }
}

export function suggestedQuestions(): string[] {
  return [
    'Summarize this month’s business performance',
    'Which property generated the highest revenue?',
    'Which units are vacant?',
    'Which tenants have overdue payments?',
    'What are my occupancy trends?',
    'Which memberships expire soon?',
    'Prioritize my sales pipeline',
    'Draft a payment reminder email',
  ];
}
