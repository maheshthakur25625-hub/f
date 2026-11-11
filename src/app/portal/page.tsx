import Link from 'next/link';
import { requirePortal } from '@/lib/auth';
import { all, one } from '@/lib/db';
import { money, fmtDate, fmtDateTime, titleCase } from '@/lib/format';
import { Card, PageHeader, Stat, Badge, EmptyState, StatusBadge } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function PortalOverview() {
  const session = await requirePortal();
  const orgId = session.orgId!;

  const membership = one<Record<string, any>>(
    `SELECT * FROM memberships WHERE org_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 1`,
    [orgId, session.userId],
  );
  const bookings = all<Record<string, any>>(
    `SELECT * FROM bookings WHERE org_id = ? AND member_id = ? AND start_at >= ? AND status = 'confirmed' ORDER BY start_at LIMIT 5`,
    [orgId, session.userId, new Date().toISOString()],
  );
  const invoices = all<Record<string, any>>(
    `SELECT * FROM invoices WHERE org_id = ? AND counterparty_id = ? ORDER BY issue_date DESC LIMIT 6`,
    [orgId, session.userId],
  );
  const outstanding = invoices
    .filter((i) => i.status !== 'paid' && i.status !== 'void')
    .reduce((sum, i) => sum + Number(i.total ?? 0), 0);
  const tickets = all<Record<string, any>>(
    `SELECT * FROM maintenance_tickets WHERE org_id = ? AND created_by = ? ORDER BY created_at DESC LIMIT 4`,
    [orgId, session.userId],
  );

  return (
    <div className="space-y-6">
      <PageHeader title={`Welcome back`} eyebrow={session.orgName ?? 'Workspace'} subtitle="Your membership, upcoming bookings and open balances." />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Membership" value={membership ? membership.plan_name : 'Pay as you go'} hint={membership ? `${titleCase(membership.status)} · until ${fmtDate(membership.ends_on, session.locale, session.timezone)}` : 'Book spaces on demand'} />
        <Stat label="Upcoming bookings" value={String(bookings.length)} />
        <Stat label="Outstanding balance" value={money(outstanding, session.currency, session.locale)} tone={outstanding > 0 ? 'warn' : 'ok'} />
        <Stat label="Open requests" value={String(tickets.filter((t) => t.status !== 'resolved' && t.status !== 'closed').length)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Next bookings" action={<Link href="/portal/bookings" className="btn btn-sm btn-ghost">Book a space</Link>} pad={false}>
          {bookings.length === 0 ? (
            <div className="px-5 pb-5"><EmptyState title="No upcoming bookings" body="Reserve a desk or meeting room in seconds." action={<Link href="/portal/bookings" className="btn btn-sm">Book now</Link>} /></div>
          ) : (
            <ul className="divide-y divide-[var(--line)]">
              {bookings.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div>
                    <p className="text-[13px] font-medium">{b.resource_name}</p>
                    <p className="text-[11.5px] muted">{fmtDateTime(b.start_at, session.locale, session.timezone)}</p>
                  </div>
                  <Badge tone="ok">{titleCase(b.resource_type)}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Invoices" action={<Link href="/portal/invoices" className="btn btn-sm btn-ghost">All invoices</Link>} pad={false}>
          {invoices.length === 0 ? (
            <div className="px-5 pb-5"><EmptyState title="No invoices yet" /></div>
          ) : (
            <ul className="divide-y divide-[var(--line)]">
              {invoices.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div>
                    <p className="text-[13px] font-medium">{i.number}</p>
                    <p className="text-[11.5px] muted">Due {fmtDate(i.due_date, session.locale, session.timezone)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[12.5px] tabular-nums">{money(i.total, session.currency, session.locale)}</span>
                    <StatusBadge status={i.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title="Your requests" action={<Link href="/portal/requests" className="btn btn-sm btn-ghost">New request</Link>} pad={false}>
        {tickets.length === 0 ? (
          <div className="px-5 pb-5"><EmptyState title="No maintenance requests" body="Report an issue and track progress here." /></div>
        ) : (
          <ul className="divide-y divide-[var(--line)]">
            {tickets.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div>
                  <p className="text-[13px] font-medium">{t.title}</p>
                  <p className="text-[11.5px] muted">Opened {fmtDate(t.created_at, session.locale, session.timezone)}</p>
                </div>
                <StatusBadge status={t.status} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
