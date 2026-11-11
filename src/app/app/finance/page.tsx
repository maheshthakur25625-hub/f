import Link from 'next/link';
import { requireWorkspace, allowed } from '@/lib/auth';
import { all, total } from '@/lib/db';
import {
  createExpenseAction,
  createInvoiceAction,
  createVendorAction,
  generateRentInvoicesAction,
  recordPaymentAction,
  refundPaymentAction,
  saveTaxRateAction,
  verifyPaymentAction,
} from '@/lib/actions/finance';
import { money, fmtDate, todayISO, titleCase, percent } from '@/lib/format';
import { ActionForm, GhostSubmit } from '@/components/form';
import { Card, PageHeader, Stat, Field, StatusBadge, EmptyState, Badge } from '@/components/ui';

export const dynamic = 'force-dynamic';

const PAID = `status IN ('succeeded','paid') AND verified = 1`;

export default async function FinancePage() {
  const session = await requireWorkspace();
  const orgId = session.orgId!;
  const cur = session.currency;
  const loc = session.locale;

  if (!allowed(session, 'finance.view')) {
    return (
      <div className="space-y-6">
        <PageHeader title="Finance" subtitle="Invoicing, payments and expenses." />
        <EmptyState title="No access" body="Your role does not include finance visibility." />
      </div>
    );
  }

  const canWrite = allowed(session, 'finance.write');
  const canConfirm = allowed(session, 'finance.confirm');
  const monthStart = `${todayISO().slice(0, 7)}-01`;

  const collected = total(`SELECT COALESCE(SUM(amount),0) AS s FROM payments WHERE org_id = ? AND ${PAID} AND paid_at >= ?`, [orgId, monthStart]);
  const outstanding = total(`SELECT COALESCE(SUM(total),0) AS s FROM invoices WHERE org_id = ? AND status IN ('sent','partial','draft')`, [orgId]);
  const overdue = total(`SELECT COALESCE(SUM(total),0) AS s FROM invoices WHERE org_id = ? AND status IN ('sent','partial') AND due_date < ?`, [orgId, todayISO()]);
  const expensesMtd = total(`SELECT COALESCE(SUM(amount),0) AS s FROM expenses WHERE org_id = ? AND spent_on >= ?`, [orgId, monthStart]);
  const unverified = total(`SELECT COALESCE(SUM(amount),0) AS s FROM payments WHERE org_id = ? AND status IN ('pending','processing')`, [orgId]);

  const invoices = all<Record<string, any>>(
    `SELECT i.*, (SELECT COALESCE(SUM(p.amount),0) FROM payments p WHERE p.invoice_id = i.id AND p.${PAID}) AS paid
       FROM invoices i WHERE i.org_id = ? ORDER BY i.issue_date DESC, i.created_at DESC LIMIT 40`,
    [orgId],
  );
  const payments = all<Record<string, any>>(
    `SELECT p.*, i.number AS invoice_number FROM payments p LEFT JOIN invoices i ON i.id = p.invoice_id
      WHERE p.org_id = ? ORDER BY p.created_at DESC LIMIT 25`,
    [orgId],
  );
  const expenses = all<Record<string, any>>(
    `SELECT e.*, v.name AS vendor_name FROM expenses e LEFT JOIN vendors v ON v.id = e.vendor_id
      WHERE e.org_id = ? ORDER BY e.spent_on DESC LIMIT 25`,
    [orgId],
  );
  const vendors = all<Record<string, any>>(`SELECT * FROM vendors WHERE org_id = ? ORDER BY name`, [orgId]);
  const tenants = all<Record<string, any>>(`SELECT id, name FROM tenants WHERE org_id = ? ORDER BY name`, [orgId]);
  const properties = all<Record<string, any>>(`SELECT id, name FROM properties WHERE org_id = ? AND status != 'archived' ORDER BY name`, [orgId]);
  const taxSetting = all<Record<string, any>>(`SELECT value FROM platform_settings WHERE key = ?`, [`tax_${orgId}`])[0];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Finance"
        eyebrow="Central ledger"
        subtitle="Invoices, verified payments, expenses and tax — all scoped to this organization."
      >
        <Badge tone="neutral">{session.currency}</Badge>
        {canWrite && (
          <ActionForm action={generateRentInvoicesAction} submit="Generate rent invoices" className="flex items-center gap-2" compact>
            <span className="hidden text-[12px] muted sm:inline">Bill every active lease for this month</span>
          </ActionForm>
        )}
      </PageHeader>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Stat label="Collected this month" value={money(collected, cur, loc)} tone="ok" href="/app/finance" />
        <Stat label="Outstanding" value={money(outstanding, cur, loc)} tone="warn" />
        <Stat label="Overdue" value={money(overdue, cur, loc)} tone={overdue > 0 ? 'bad' : 'neutral'} />
        <Stat label="Expenses this month" value={money(expensesMtd, cur, loc)} />
        <Stat label="Awaiting verification" value={money(unverified, cur, loc)} hint="Not counted as revenue" />
      </div>

      {canWrite && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="New invoice" subtitle="Tax is applied to the subtotal at the configured rate.">
            <ActionForm action={createInvoiceAction} submit="Create invoice">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Bill to" name="counterparty_type" options={[
                  { value: 'tenant', label: 'Tenant' },
                  { value: 'member', label: 'Member' },
                  { value: 'buyer', label: 'Buyer' },
                ]} />
                <Field label="Tenant" name="counterparty_id" options={[{ value: '', label: '— select —' }, ...tenants.map((t) => ({ value: t.id, label: t.name }))]} />
                <Field label="Property" name="property_id" options={[{ value: '', label: '— none —' }, ...properties.map((p) => ({ value: p.id, label: p.name }))]} />
                <Field label="Subtotal (cents)" name="subtotal" type="number" min={0} required placeholder="250000" />
                <Field label="Tax rate %" name="tax_rate" type="number" step="0.01" min={0} defaultValue={taxSetting?.value ?? '0'} />
                <Field label="Issue date" name="issue_date" type="date" defaultValue={todayISO()} required />
                <Field label="Due date" name="due_date" type="date" required />
                <Field label="Notes" name="notes" placeholder="Monthly rent + service charge" />
              </div>
            </ActionForm>
          </Card>

          <Card title="Record a payment" subtitle="Payments stay pending until verified — only verified amounts count as revenue.">
            <ActionForm action={recordPaymentAction} submit="Record payment">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Invoice" name="invoice_id" options={[{ value: '', label: '— select invoice —' }, ...invoices.filter((i) => i.status !== 'paid').map((i) => ({ value: i.id, label: `${i.number} · ${money(i.total, cur, loc)}` }))]} />
                <Field label="Amount (cents)" name="amount" type="number" min={0} required />
                <Field label="Method" name="method" options={[
                  { value: 'bank_transfer', label: 'Bank transfer' },
                  { value: 'card', label: 'Card' },
                  { value: 'cash', label: 'Cash' },
                  { value: 'stripe', label: 'Stripe' },
                ]} />
                <Field label="Reference" name="reference" placeholder="Gateway or bank reference" />
                <Field label="Verified by gateway" name="verified" options={[{ value: '', label: 'No — pending review' }, { value: '1', label: 'Yes — confirmed' }]} />
              </div>
            </ActionForm>
          </Card>
        </div>
      )}

      <Card
        title="Invoices"
        subtitle={`${invoices.length} most recent invoices`}
        pad={false}
        action={<Link href="/app/tenants" className="btn btn-ghost btn-sm">Tenants</Link>}
      >
        {invoices.length === 0 ? (
          <div className="px-5 pb-5">
            <EmptyState title="No invoices yet" body="Create an invoice or generate rent invoices for active leases." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Number</th>
                  <th>Counterparty</th>
                  <th>Issued</th>
                  <th>Due</th>
                  <th className="text-right">Total</th>
                  <th className="text-right">Paid</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {invoices.map((i) => (
                  <tr key={i.id}>
                    <td className="font-medium">{i.number}</td>
                    <td>
                      <div>{i.counterparty_name ?? '—'}</div>
                      <div className="text-[11.5px] muted">{titleCase(i.counterparty_type ?? '')}</div>
                    </td>
                    <td>{fmtDate(i.issue_date, loc, session.timezone)}</td>
                    <td>{fmtDate(i.due_date, loc, session.timezone)}</td>
                    <td className="text-right tabular-nums">{money(i.total, cur, loc)}</td>
                    <td className="text-right tabular-nums">{money(Number(i.paid ?? 0), cur, loc)}</td>
                    <td><StatusBadge status={i.status} /></td>
                    <td className="text-right">
                      {canConfirm && i.status !== 'paid' && (
                        <ActionForm action={recordPaymentAction} submit="Settle" className="flex justify-end" compact>
                          <input type="hidden" name="invoice_id" value={i.id} />
                          <input type="hidden" name="amount" value={Number(i.total) - Number(i.paid ?? 0)} />
                          <input type="hidden" name="method" value="bank_transfer" />
                          <input type="hidden" name="verified" value="1" />
                        </ActionForm>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Payments" subtitle="Gateway-verified and manually recorded receipts" pad={false}>
          {payments.length === 0 ? (
            <div className="px-5 pb-5"><EmptyState title="No payments recorded" /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr><th>Invoice</th><th>Method</th><th className="text-right">Amount</th><th>Status</th><th /></tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id}>
                      <td className="font-medium">{p.invoice_number ?? '—'}</td>
                      <td>{titleCase(p.method ?? '')}</td>
                      <td className="text-right tabular-nums">{money(p.amount, cur, loc)}</td>
                      <td>
                        <div className="flex items-center gap-1.5">
                          <StatusBadge status={p.status} />
                          {Number(p.verified) === 1 && <Badge tone="ok">verified</Badge>}
                        </div>
                      </td>
                      <td className="text-right">
                        {canConfirm && Number(p.verified) !== 1 && (
                          <form action={undefined} className="inline">
                            <ActionForm action={verifyPaymentAction} submit="Verify" className="flex justify-end" compact>
                              <input type="hidden" name="id" value={p.id} />
                            </ActionForm>
                          </form>
                        )}
                        {canConfirm && Number(p.verified) === 1 && Number(p.refunded ?? 0) === 0 && (
                          <ActionForm action={refundPaymentAction} submit="Refund" className="flex justify-end" compact>
                            <input type="hidden" name="id" value={p.id} />
                          </ActionForm>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div className="space-y-4">
          <Card title="Expenses" subtitle="Operating costs reduce net position" pad={false}>
            {expenses.length === 0 ? (
              <div className="px-5 pb-5"><EmptyState title="No expenses recorded" /></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="table">
                  <thead><tr><th>Date</th><th>Category</th><th>Vendor</th><th className="text-right">Amount</th></tr></thead>
                  <tbody>
                    {expenses.map((e) => (
                      <tr key={e.id}>
                        <td>{fmtDate(e.spent_on, loc, session.timezone)}</td>
                        <td>{titleCase(e.category ?? '')}</td>
                        <td className="muted">{e.vendor_name ?? '—'}</td>
                        <td className="text-right tabular-nums">{money(e.amount, cur, loc)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {canWrite && (
            <Card title="Add expense" subtitle="Track vendor spend against a property">
              <ActionForm action={createExpenseAction} submit="Save expense">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Property" name="property_id" options={[{ value: '', label: '— none —' }, ...properties.map((p) => ({ value: p.id, label: p.name }))]} />
                  <Field label="Category" name="category" options={[
                    { value: 'maintenance', label: 'Maintenance' },
                    { value: 'utilities', label: 'Utilities' },
                    { value: 'cleaning', label: 'Cleaning' },
                    { value: 'marketing', label: 'Marketing' },
                    { value: 'payroll', label: 'Payroll' },
                    { value: 'other', label: 'Other' },
                  ]} />
                  <Field label="Vendor" name="vendor_id" options={[{ value: '', label: '— none —' }, ...vendors.map((v) => ({ value: v.id, label: v.name }))]} />
                  <Field label="Amount (cents)" name="amount" type="number" min={0} required />
                  <Field label="Date" name="spent_on" type="date" defaultValue={todayISO()} required />
                  <Field label="Notes" name="notes" />
                </div>
              </ActionForm>
            </Card>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Vendors" subtitle="Suppliers used by maintenance and operations" pad={false}>
          {vendors.length === 0 ? (
            <div className="px-5 pb-5"><EmptyState title="No vendors yet" body="Add vendors to assign maintenance work." /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="table">
                <thead><tr><th>Name</th><th>Trade</th><th>Contact</th></tr></thead>
                <tbody>
                  {vendors.map((v) => (
                    <tr key={v.id}>
                      <td className="font-medium">{v.name}</td>
                      <td>{titleCase(v.trade ?? '')}</td>
                      <td className="muted">{v.email ?? v.phone ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div className="space-y-4">
          {canWrite && (
            <Card title="Add vendor">
              <ActionForm action={createVendorAction} submit="Add vendor">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Name" name="name" required />
                  <Field label="Trade" name="trade" placeholder="Plumbing, electrical…" />
                  <Field label="Email" name="email" type="email" />
                  <Field label="Phone" name="phone" />
                </div>
              </ActionForm>
            </Card>
          )}
          {allowed(session, 'settings.write') && (
            <Card title="Tax configuration" subtitle="Default rate applied to new invoices for this organization">
              <ActionForm action={saveTaxRateAction} submit="Save tax rate">
                <Field label="Default tax rate %" name="tax_rate" type="number" step="0.01" min={0} defaultValue={taxSetting?.value ?? '0'} />
              </ActionForm>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
