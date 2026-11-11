import { requirePortal } from '@/lib/auth';
import { all } from '@/lib/db';
import { fmtDate, money, titleCase } from '@/lib/format';
import { Card, PageHeader, Stat, EmptyState, StatusBadge } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function PortalInvoicesPage() {
  const session = await requirePortal();
  const invoices = all<Record<string, any>>(
    `SELECT * FROM invoices WHERE org_id = ? AND counterparty_id = ? ORDER BY issue_date DESC`,
    [session.orgId!, session.userId],
  );
  const paid = invoices.filter((i) => i.status === 'paid').reduce((s, i) => s + Number(i.total ?? 0), 0);
  const due = invoices.filter((i) => i.status !== 'paid' && i.status !== 'void').reduce((s, i) => s + Number(i.total ?? 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader title="Invoices & payments" eyebrow="Billing" subtitle="Every invoice is generated from your workspace records." />

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Invoices" value={String(invoices.length)} />
        <Stat label="Paid to date" value={money(paid, session.currency, session.locale)} tone="ok" />
        <Stat label="Outstanding" value={money(due, session.currency, session.locale)} tone={due > 0 ? 'warn' : 'neutral'} />
      </div>

      <Card pad={false}>
        {invoices.length === 0 ? (
          <div className="px-5 pb-5"><EmptyState title="No invoices" body="Invoices raised for your membership or bookings will appear here." /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Invoice</th><th>Issued</th><th>Due</th><th>Subtotal</th><th>Tax</th><th>Total</th><th>Status</th></tr></thead>
              <tbody>
                {invoices.map((i) => (
                  <tr key={i.id}>
                    <td>
                      <div className="font-medium">{i.number}</div>
                      {i.notes && <div className="text-[11px] muted">{i.notes}</div>}
                    </td>
                    <td className="muted">{fmtDate(i.issue_date, session.locale, session.timezone)}</td>
                    <td className="muted">{fmtDate(i.due_date, session.locale, session.timezone)}</td>
                    <td className="tabular-nums">{money(i.subtotal, session.currency, session.locale)}</td>
                    <td className="tabular-nums muted">{i.tax_rate ? `${i.tax_rate}%` : '—'}</td>
                    <td className="tabular-nums font-medium">{money(i.total, session.currency, session.locale)}</td>
                    <td><StatusBadge status={i.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
