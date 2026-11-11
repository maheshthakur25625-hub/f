import Link from 'next/link';
import { requireWorkspace, allowed } from '@/lib/auth';
import { all } from '@/lib/db';
import {
  activityFeed,
  bookingsSeries,
  metrics,
  revenueSeries,
  topProperties,
  upcomingBookings,
} from '@/lib/queries';
import { money, compactMoney, percent, fmtDateTime, fmtDate, timeAgo, titleCase } from '@/lib/format';
import { AreaChart, BarChart, Donut, monthPoints } from '@/components/charts';
import { Card, PageHeader, Stat, StatusBadge, EmptyState, Progress, Avatar } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const session = await requireWorkspace();
  const orgId = session.orgId!;
  const cur = session.currency;
  const loc = session.locale;
  const m = metrics(orgId);

  const revenue = revenueSeries(orgId, 6);
  const bookings = bookingsSeries(orgId, 6);
  const top = topProperties(orgId, 5);
  const feed = activityFeed(orgId, 7);
  const upcoming = upcomingBookings(orgId, 5) as {
    id: string;
    resource_name: string;
    resource_type: string;
    member_name: string | null;
    start_at: string;
    end_at: string;
    total_amount: number;
  }[];

  const unitBreakdown = all<{ status: string; c: number }>(
    `SELECT status, COUNT(*) AS c FROM units WHERE org_id = ? GROUP BY status`,
    [orgId],
  );
  const statusColor: Record<string, string> = {
    occupied: '#10b981',
    available: '#6366f1',
    maintenance: '#f59e0b',
    reserved: '#8b5cf6',
  };
  const segments = unitBreakdown.map((u) => ({
    label: titleCase(u.status),
    value: Number(u.c),
    color: statusColor[u.status] ?? '#94a3b8',
  }));

  const overdue = all<{ id: string; number: string; counterparty_name: string; total: number; due_date: string }>(
    `SELECT id, number, counterparty_name, total, due_date FROM invoices
      WHERE org_id = ? AND status IN ('sent','overdue','partial') ORDER BY due_date ASC LIMIT 5`,
    [orgId],
  );

  const netMonth = m.revenueMonth - m.expensesMonth;

  return (
    <div className="mx-auto max-w-[1320px]">
      <PageHeader
        eyebrow={`${titleCase(session.businessType ?? 'coworking')} · ${fmtDate(new Date(), loc, session.timezone)}`}
        title={`Welcome back, ${session.name.split(' ')[0]}`}
        subtitle="Live operating picture across every property, membership and invoice in this workspace."
      >
        <div className="flex flex-wrap gap-2">
          {allowed(session, 'bookings.write') && (
            <Link href="/app/bookings" className="btn btn-primary btn-sm">
              New booking
            </Link>
          )}
          {allowed(session, 'properties.write') && (
            <Link href="/app/properties" className="btn btn-sm">
              Add property
            </Link>
          )}
        </div>
      </PageHeader>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Monthly recurring revenue"
          value={money(m.mrr, cur, loc)}
          hint={`${money(m.revenueMonth, cur, loc)} collected this month`}
          tone="brand"
        />
        <Stat
          label="Occupancy"
          value={percent(m.occupancy, 1)}
          hint={`${m.unitsOccupied + m.desksAssigned} of ${m.units + m.desks} spaces in use`}
          tone={m.occupancy >= 75 ? 'ok' : m.occupancy >= 45 ? 'warn' : 'bad'}
        />
        <Stat
          label="Outstanding"
          value={money(m.pendingPayments, cur, loc)}
          hint={`${m.overdueInvoices} overdue invoice${m.overdueInvoices === 1 ? '' : 's'}`}
          tone={m.pendingPayments > 0 ? 'warn' : 'ok'}
        />
        <Stat
          label="Net this month"
          value={money(netMonth, cur, loc)}
          hint={`${money(m.expensesMonth, cur, loc)} in expenses`}
          tone={netMonth >= 0 ? 'ok' : 'bad'}
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Properties" value={String(m.properties)} hint={`${m.units} units · ${m.desks} desks · ${m.rooms} rooms`} />
        <Stat label="Active members" value={String(m.activeMembers)} hint={`${m.expiringMemberships} expiring in 30 days`} />
        <Stat label="Active tenants" value={String(m.activeTenants)} hint={`${m.vacantUnits} vacant units`} />
        <Stat label="Open tickets" value={String(m.openTickets)} hint={`${m.upcomingBookings} bookings this week`} />
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-3">
        <Card
          className="xl:col-span-2"
          title="Revenue trend"
          subtitle="Verified payments, last 6 months"
          action={<span className="text-[12px] font-semibold text-brand">{money(m.revenueTotal, cur, loc)} lifetime</span>}
        >
          <AreaChart data={monthPoints(revenue)} height={190} currency={cur} locale={loc} />
        </Card>

        <Card title="Space mix" subtitle="Units by availability">
          {segments.length ? (
            <Donut
              segments={segments}
              centerValue={String(m.units)}
              centerLabel="units"
            />
          ) : (
            <EmptyState title="No units yet" body="Add units to a property to see availability here." />
          )}
        </Card>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-3">
        <Card title="Bookings volume" subtitle="Confirmed and completed reservations">
          <BarChart data={monthPoints(bookings)} height={150} currency={cur} locale={loc} />
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between text-[12.5px]">
              <span className="muted">Next 7 days</span>
              <span className="font-semibold">{m.upcomingBookings} bookings</span>
            </div>
            <div className="flex items-center justify-between text-[12.5px]">
              <span className="muted">Sales pipeline</span>
              <span className="font-semibold">{money(m.pipelineValue, cur, loc)}</span>
            </div>
            <div className="flex items-center justify-between text-[12.5px]">
              <span className="muted">Closed won</span>
              <span className="font-semibold text-ok">{money(m.wonValue, cur, loc)}</span>
            </div>
          </div>
        </Card>

        <Card
          title="Top performing properties"
          subtitle="Ranked by verified revenue"
          action={<Link href="/app/properties" className="text-[12px] font-semibold text-brand">View all</Link>}
        >
          {top.length ? (
            <div className="space-y-3">
              {top.map((p) => (
                <Link key={p.id} href={`/app/properties/${p.id}`} className="block rounded-lg px-1 py-1 transition hover:bg-[var(--surface-2)]">
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate text-[13px] font-semibold">{p.name}</span>
                    <span className="flex-none text-[12.5px] font-semibold">{compactMoney(p.revenue, cur, loc)}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <Progress value={top[0].revenue ? (p.revenue / top[0].revenue) * 100 : 0} />
                    <span className="flex-none text-[11px] muted">{p.units} units</span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState title="No properties yet" body="Create your first property to unlock portfolio analytics." />
          )}
        </Card>

        <Card
          title="Upcoming bookings"
          subtitle="Live availability engine"
          action={<Link href="/app/bookings" className="text-[12px] font-semibold text-brand">Calendar</Link>}
        >
          {upcoming.length ? (
            <div className="space-y-2.5">
              {upcoming.map((b) => (
                <div key={b.id} className="flex items-start justify-between gap-3 border-b border-[var(--line)] pb-2.5 last:border-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold">{b.resource_name}</p>
                    <p className="text-[11.5px] muted">
                      {titleCase(b.resource_type)} · {b.member_name ?? 'Member'}
                    </p>
                  </div>
                  <div className="flex-none text-right">
                    <p className="text-[12px] font-semibold">{fmtDateTime(b.start_at, loc, session.timezone)}</p>
                    <p className="text-[11px] muted">{money(b.total_amount, cur, loc)}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="Nothing booked yet" body="Reservations created in the booking engine appear here." />
          )}
        </Card>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card
          title="Needs attention"
          subtitle="Invoices awaiting payment"
          action={<Link href="/app/finance" className="text-[12px] font-semibold text-brand">Finance</Link>}
        >
          {overdue.length ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Customer</th>
                    <th>Due</th>
                    <th className="text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {overdue.map((inv) => (
                    <tr key={inv.id}>
                      <td className="font-semibold">{inv.number}</td>
                      <td className="truncate">{inv.counterparty_name}</td>
                      <td className="whitespace-nowrap">{fmtDate(inv.due_date, loc, session.timezone)}</td>
                      <td className="text-right font-semibold">{money(inv.total, cur, loc)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="All settled" body="No outstanding invoices right now." />
          )}
        </Card>

        <Card title="Recent activity" subtitle="Audited actions in this workspace">
          {feed.length ? (
            <ol className="space-y-3">
              {feed.map((a) => (
                <li key={a.id} className="flex items-start gap-3">
                  <Avatar name={a.actor ?? 'System'} size={26} />
                  <div className="min-w-0">
                    <p className="text-[12.5px]">
                      <span className="font-semibold">{a.actor ?? 'System'}</span>{' '}
                      <span className="muted">{a.action.replace(/\./g, ' ')}</span>
                      {a.entity_type ? <span className="muted"> · {a.entity_type}</span> : null}
                    </p>
                    <p className="text-[11px] muted">{timeAgo(a.created_at)}</p>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <EmptyState title="No activity recorded" body="Actions performed by your team will be listed here." />
          )}
        </Card>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
        {[
          { href: '/app/bookings', title: 'Run the booking engine', body: 'Check availability and confirm a desk or room in seconds.' },
          { href: '/app/finance', title: 'Issue an invoice', body: 'Bill members and tenants, then verify payments.' },
          { href: '/app/ai', title: 'Ask the AI analyst', body: 'Query your occupancy, revenue and overdue balances.' },
        ].map((q) => (
          <Link key={q.href} href={q.href} className="card p-4 transition hover:-translate-y-0.5 hover:shadow-md">
            <p className="text-[13px] font-semibold">{q.title}</p>
            <p className="mt-1 text-[12px] muted">{q.body}</p>
            <span className="mt-2 inline-block text-[12px] font-semibold text-brand">Open →</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
