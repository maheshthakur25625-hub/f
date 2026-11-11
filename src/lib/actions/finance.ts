'use server';

import { revalidatePath } from 'next/cache';
import { all, audit, one, run, total, transaction } from '../db';
import { allowed, requireWorkspace } from '../auth';
import { id as newId } from '../ids';
import { addDays, todayISO } from '../format';
import type { ActionState } from '@/components/form';

function str(fd: FormData, k: string, fallback = ''): string {
  const v = fd.get(k);
  return v === null ? fallback : String(v).trim();
}
function cents(fd: FormData, k: string): number {
  return Math.max(0, Math.round(Number(str(fd, k) || 0) * 100));
}
function taxRate(orgId: string): number {
  const row = one<{ value: string }>(`SELECT value FROM platform_settings WHERE key = ?`, [`tax_rate:${orgId}`]);
  const n = Number(row?.value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function nextInvoiceNumber(orgId: string): string {
  const row = one<{ c: number }>(`SELECT COUNT(*) AS c FROM invoices WHERE org_id = ?`, [orgId]);
  const seq = Number(row?.c ?? 0) + 1;
  return `INV-${new Date().getUTCFullYear()}-${String(seq).padStart(4, '0')}`;
}

function refreshInvoiceStatus(orgId: string, invoiceId: string) {
  const invoice = one<{ total: number; status: string }>(`SELECT total, status FROM invoices WHERE id = ? AND org_id = ?`, [
    invoiceId,
    orgId,
  ]);
  if (!invoice) return;
  const paid = total(
    `SELECT COALESCE(SUM(amount),0) AS s FROM payments WHERE invoice_id = ? AND org_id = ? AND status = 'succeeded' AND verified = 1`,
    [invoiceId, orgId],
  );
  let status = invoice.status;
  if (paid >= invoice.total && invoice.total > 0) status = 'paid';
  else if (paid > 0) status = 'partial';
  else if (invoice.status === 'paid') status = 'sent';
  if (status !== invoice.status) {
    run(`UPDATE invoices SET status = ? WHERE id = ? AND org_id = ?`, [status, invoiceId, orgId]);
  }
}

export async function createInvoiceAction(_s: ActionState, fd: FormData): Promise<ActionState> {
  const session = await requireWorkspace();
  if (!allowed(session, 'finance.write')) return { error: 'Your role cannot issue invoices.' };
  const orgId = session.orgId!;

  const counterpartyType = str(fd, 'counterparty_type', 'tenant');
  const counterpartyId = str(fd, 'counterparty_id');
  const subtotal = cents(fd, 'subtotal');
  if (!counterpartyId) return { error: 'Choose who this invoice is for.' };
  if (subtotal <= 0) return { error: 'Enter an amount greater than zero.' };

  let name = '';
  let propertyId: string | null = null;
  if (counterpartyType === 'tenant') {
    const tenant = one<{ name: string; unit_id: string | null }>(`SELECT name, unit_id FROM tenants WHERE id = ? AND org_id = ?`, [
      counterpartyId,
      orgId,
    ]);
    if (!tenant) return { error: 'Tenant not found.' };
    name = tenant.name;
    if (tenant.unit_id) {
      const unit = one<{ property_id: string }>(`SELECT property_id FROM units WHERE id = ? AND org_id = ?`, [tenant.unit_id, orgId]);
      propertyId = unit?.property_id ?? null;
    }
  } else {
    const member = one<{ name: string }>(`SELECT name FROM users WHERE id = ?`, [counterpartyId]);
    const inOrg = one(`SELECT id FROM org_members WHERE user_id = ? AND org_id = ?`, [counterpartyId, orgId]);
    if (!member || !inOrg) return { error: 'Member not found in this workspace.' };
    name = member.name;
  }

  const rate = str(fd, 'tax_rate') !== '' ? Number(str(fd, 'tax_rate')) : taxRate(orgId);
  const safeRate = Number.isFinite(rate) && rate >= 0 ? rate : 0;
  const tax = Math.round(subtotal * (safeRate / 100));
  const invoiceId = newId('inv_');
  const issue = str(fd, 'issue_date') || todayISO();
  const due = str(fd, 'due_date') || addDays(issue, 14);

  run(
    `INSERT INTO invoices (id, org_id, number, counterparty_type, counterparty_id, counterparty_name, property_id, issue_date, due_date, subtotal, tax_rate, tax_amount, total, status, notes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'sent', ?, ?)`,
    [
      invoiceId,
      orgId,
      nextInvoiceNumber(orgId),
      counterpartyType,
      counterpartyId,
      name,
      propertyId,
      issue,
      due,
      subtotal,
      safeRate,
      tax,
      subtotal + tax,
      str(fd, 'notes') || null,
      new Date().toISOString(),
    ],
  );
  audit({ orgId, userId: session.userId, actor: session.name, action: 'invoice.created', entityType: 'invoice', entityId: invoiceId });
  revalidatePath('/app/finance');
  revalidatePath('/portal/invoices');
  return { ok: true, message: 'Invoice issued.' };
}

export async function recordPaymentAction(_s: ActionState, fd: FormData): Promise<ActionState> {
  const session = await requireWorkspace();
  if (!allowed(session, 'finance.write')) return { error: 'Your role cannot record payments.' };
  const orgId = session.orgId!;
  const invoiceId = str(fd, 'invoice_id');
  const amount = cents(fd, 'amount');
  if (!invoiceId) return { error: 'Choose an invoice.' };
  if (amount <= 0) return { error: 'Enter the amount received.' };

  const invoice = one<{ total: number; counterparty_id: string; counterparty_name: string; number: string }>(
    `SELECT total, counterparty_id, counterparty_name, number FROM invoices WHERE id = ? AND org_id = ?`,
    [invoiceId, orgId],
  );
  if (!invoice) return { error: 'Invoice not found.' };

  const method = str(fd, 'method', 'bank_transfer');
  const reference = str(fd, 'reference');
  // Only staff with payment-confirmation rights can mark money as received.
  const canConfirm = allowed(session, 'finance.confirm');
  const verified = canConfirm && str(fd, 'verified') === 'on' ? 1 : 0;
  const status = verified ? 'succeeded' : 'pending';

  const paymentId = newId('pay_');
  transaction(() => {
    run(
      `INSERT INTO payments (id, org_id, invoice_id, amount, method, status, verified, reference, paid_at, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        paymentId,
        orgId,
        invoiceId,
        amount,
        method,
        status,
        verified,
        reference || null,
        verified ? new Date().toISOString() : null,
        session.userId,
        new Date().toISOString(),
      ],
    );
    if (verified) refreshInvoiceStatus(orgId, invoiceId);
    audit({
      orgId,
      userId: session.userId,
      actor: session.name,
      action: verified ? 'payment.recorded' : 'payment.pending',
      entityType: 'payment',
      entityId: paymentId,
    });
  });
  revalidatePath('/app/finance');
  revalidatePath('/portal/invoices');
  return {
    ok: true,
    message: verified
      ? `Payment verified against ${invoice.number}.`
      : `Payment logged as pending verification. Revenue is not counted until verified.`,
  };
}

export async function verifyPaymentAction(_s: ActionState, fd: FormData): Promise<ActionState> {
  const session = await requireWorkspace();
  if (!allowed(session, 'finance.confirm')) return { error: 'Only finance managers can verify payments.' };
  const orgId = session.orgId!;
  const id = str(fd, 'id');
  const payment = one<{ invoice_id: string; amount: number }>(`SELECT invoice_id, amount FROM payments WHERE id = ? AND org_id = ?`, [
    id,
    orgId,
  ]);
  if (!payment) return { error: 'Payment not found.' };
  transaction(() => {
    run(`UPDATE payments SET status = 'succeeded', verified = 1, paid_at = ? WHERE id = ? AND org_id = ?`, [
      new Date().toISOString(),
      id,
      orgId,
    ]);
    refreshInvoiceStatus(orgId, payment.invoice_id);
    audit({ orgId, userId: session.userId, actor: session.name, action: 'payment.verified', entityType: 'payment', entityId: id });
  });
  revalidatePath('/app/finance');
  revalidatePath('/portal/invoices');
  return { ok: true, message: 'Payment verified and invoice updated.' };
}

export async function refundPaymentAction(_s: ActionState, fd: FormData): Promise<ActionState> {
  const session = await requireWorkspace();
  if (!allowed(session, 'finance.confirm')) return { error: 'Only finance managers can refund payments.' };
  const orgId = session.orgId!;
  const id = str(fd, 'id');
  const payment = one<{ invoice_id: string }>(`SELECT invoice_id FROM payments WHERE id = ? AND org_id = ?`, [id, orgId]);
  if (!payment) return { error: 'Payment not found.' };
  transaction(() => {
    run(`UPDATE payments SET status = 'refunded' WHERE id = ? AND org_id = ?`, [id, orgId]);
    refreshInvoiceStatus(orgId, payment.invoice_id);
    audit({ orgId, userId: session.userId, actor: session.name, action: 'payment.refunded', entityType: 'payment', entityId: id });
  });
  revalidatePath('/app/finance');
  return { ok: true, message: 'Payment refunded and balances recalculated.' };
}

export async function createExpenseAction(_s: ActionState, fd: FormData): Promise<ActionState> {
  const session = await requireWorkspace();
  if (!allowed(session, 'finance.write')) return { error: 'Your role cannot record expenses.' };
  const orgId = session.orgId!;
  const amount = cents(fd, 'amount');
  if (amount <= 0) return { error: 'Enter the expense amount.' };
  const id = newId('exp_');
  run(
    `INSERT INTO expenses (id, org_id, property_id, category, vendor_id, amount, spent_on, notes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      orgId,
      str(fd, 'property_id') || null,
      str(fd, 'category', 'operations'),
      str(fd, 'vendor_id') || null,
      amount,
      str(fd, 'spent_on') || todayISO(),
      str(fd, 'notes') || null,
      new Date().toISOString(),
    ],
  );
  audit({ orgId, userId: session.userId, actor: session.name, action: 'expense.created', entityType: 'expense', entityId: id });
  revalidatePath('/app/finance');
  return { ok: true, message: 'Expense recorded.' };
}

export async function createVendorAction(_s: ActionState, fd: FormData): Promise<ActionState> {
  const session = await requireWorkspace();
  if (!allowed(session, 'finance.write')) return { error: 'Your role cannot manage vendors.' };
  const name = str(fd, 'name');
  if (!name) return { error: 'Enter the vendor name.' };
  run(`INSERT INTO vendors (id, org_id, name, trade, email, phone, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`, [
    newId('vnd_'),
    session.orgId,
    name,
    str(fd, 'trade') || null,
    str(fd, 'email') || null,
    str(fd, 'phone') || null,
    new Date().toISOString(),
  ]);
  revalidatePath('/app/finance');
  revalidatePath('/app/maintenance');
  return { ok: true, message: 'Vendor saved.' };
}

export async function saveTaxRateAction(_s: ActionState, fd: FormData): Promise<ActionState> {
  const session = await requireWorkspace();
  if (!allowed(session, 'settings.write')) return { error: 'Your role cannot change tax settings.' };
  const rate = Number(str(fd, 'tax_rate', '0'));
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) return { error: 'Enter a tax rate between 0 and 100.' };
  const key = `tax_rate:${session.orgId}`;
  const existing = one(`SELECT key FROM platform_settings WHERE key = ?`, [key]);
  if (existing) run(`UPDATE platform_settings SET value = ? WHERE key = ?`, [String(rate), key]);
  else run(`INSERT INTO platform_settings (key, value) VALUES (?, ?)`, [key, String(rate)]);
  revalidatePath('/app/settings');
  return { ok: true, message: `Default tax rate set to ${rate}%.` };
}

/** Generates rent invoices for every active lease that has none for this month. */
export async function generateRentInvoicesAction(_s: ActionState, _fd: FormData): Promise<ActionState> {
  const session = await requireWorkspace();
  if (!allowed(session, 'finance.write')) return { error: 'Your role cannot issue invoices.' };
  const orgId = session.orgId!;
  const month = todayISO().slice(0, 7);

  const leases = all<{ id: string; tenant_id: string; rent_amount: number; billing_period: string; property_id: string }>(
    `SELECT l.id, l.tenant_id, l.rent_amount, l.billing_period, u.property_id
       FROM leases l JOIN units u ON u.id = l.unit_id
      WHERE l.org_id = ? AND l.status = 'active'`,
    [orgId],
  );

  let created = 0;
  for (const lease of leases) {
    const exists = one(
      `SELECT id FROM invoices WHERE org_id = ? AND counterparty_id = ? AND notes LIKE ?`,
      [orgId, lease.tenant_id, `%rent ${month}%`],
    );
    if (exists) continue;
    const tenant = one<{ name: string }>(`SELECT name FROM tenants WHERE id = ? AND org_id = ?`, [lease.tenant_id, orgId]);
    if (!tenant) continue;
    const rate = taxRate(orgId);
    const tax = Math.round(lease.rent_amount * (rate / 100));
    const invoiceId = newId('inv_');
    run(
      `INSERT INTO invoices (id, org_id, number, counterparty_type, counterparty_id, counterparty_name, property_id, issue_date, due_date, subtotal, tax_rate, tax_amount, total, status, notes, created_at)
       VALUES (?, ?, ?, 'tenant', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'sent', ?, ?)`,
      [
        invoiceId,
        orgId,
        nextInvoiceNumber(orgId),
        lease.tenant_id,
        tenant.name,
        lease.property_id,
        todayISO(),
        addDays(todayISO(), 7),
        lease.rent_amount,
        rate,
        tax,
        lease.rent_amount + tax,
        `Rent ${month}`,
        new Date().toISOString(),
      ],
    );
    created += 1;
  }
  audit({ orgId, userId: session.userId, actor: session.name, action: 'invoice.rent_run', entityType: 'invoice', entityId: month });
  revalidatePath('/app/finance');
  return {
    ok: true,
    message: created ? `${created} rent invoice${created === 1 ? '' : 's'} issued for ${month}.` : `All active leases already invoiced for ${month}.`,
  };
}
