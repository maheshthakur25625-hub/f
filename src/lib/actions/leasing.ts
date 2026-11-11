'use server';

import { revalidatePath } from 'next/cache';
import { audit, one, run, transaction } from '../db';
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

export async function createTenantAction(_s: ActionState, fd: FormData): Promise<ActionState> {
  const session = await requireWorkspace();
  if (!allowed(session, 'tenants.write')) return { error: 'Your role cannot manage tenants.' };
  const orgId = session.orgId!;
  const name = str(fd, 'name');
  const email = str(fd, 'email').toLowerCase();
  if (name.length < 2) return { error: 'Enter the tenant name.' };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: 'Enter a valid email address.' };
  const unitId = str(fd, 'unit_id') || null;
  if (unitId && !one(`SELECT id FROM units WHERE id = ? AND org_id = ?`, [unitId, orgId])) {
    return { error: 'Unit not found in this workspace.' };
  }

  const tenantId = newId('tnt_');
  run(
    `INSERT INTO tenants (id, org_id, name, email, phone, company, kind, unit_id, status, notes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
    [
      tenantId,
      orgId,
      name,
      email,
      str(fd, 'phone') || null,
      str(fd, 'company') || null,
      str(fd, 'kind', 'residential'),
      unitId,
      str(fd, 'notes') || null,
      new Date().toISOString(),
    ],
  );
  audit({ orgId, userId: session.userId, actor: session.name, action: 'tenant.created', entityType: 'tenant', entityId: tenantId });
  revalidatePath('/app/tenants');
  return { ok: true, message: 'Tenant created.' };
}

export async function updateTenantAction(_s: ActionState, fd: FormData): Promise<ActionState> {
  const session = await requireWorkspace();
  if (!allowed(session, 'tenants.write')) return { error: 'Your role cannot manage tenants.' };
  const id = str(fd, 'id');
  if (!one(`SELECT id FROM tenants WHERE id = ? AND org_id = ?`, [id, session.orgId])) {
    return { error: 'Tenant not found.' };
  }
  run(`UPDATE tenants SET name = ?, email = ?, phone = ?, company = ?, status = ?, notes = ? WHERE id = ? AND org_id = ?`, [
    str(fd, 'name'),
    str(fd, 'email').toLowerCase(),
    str(fd, 'phone') || null,
    str(fd, 'company') || null,
    str(fd, 'status', 'active'),
    str(fd, 'notes') || null,
    id,
    session.orgId,
  ]);
  revalidatePath('/app/tenants');
  return { ok: true, message: 'Tenant updated.' };
}

export async function createLeaseAction(_s: ActionState, fd: FormData): Promise<ActionState> {
  const session = await requireWorkspace();
  if (!allowed(session, 'leases.write')) return { error: 'Your role cannot manage leases.' };
  const orgId = session.orgId!;
  const unitId = str(fd, 'unit_id');
  const tenantId = str(fd, 'tenant_id');
  const startDate = str(fd, 'start_date');
  const endDate = str(fd, 'end_date');
  const rent = cents(fd, 'rent');

  if (!unitId || !tenantId) return { error: 'Choose a unit and a tenant.' };
  if (!startDate || !endDate) return { error: 'Set the lease start and end dates.' };
  if (new Date(endDate) <= new Date(startDate)) return { error: 'The end date must be after the start date.' };

  const unit = one<{ id: string; name: string; property_id: string; status: string }>(
    `SELECT id, name, property_id, status FROM units WHERE id = ? AND org_id = ?`,
    [unitId, orgId],
  );
  if (!unit) return { error: 'Unit not found.' };
  if (!one(`SELECT id FROM tenants WHERE id = ? AND org_id = ?`, [tenantId, orgId])) {
    return { error: 'Tenant not found.' };
  }
  const clash = one(`SELECT id FROM leases WHERE unit_id = ? AND org_id = ? AND status = 'active'`, [unitId, orgId]);
  if (clash) return { error: 'That unit already has an active lease. End it before creating a new one.' };

  const leaseId = newId('lse_');
  transaction(() => {
    run(
      `INSERT INTO leases (id, org_id, unit_id, tenant_id, start_date, end_date, rent_amount, billing_period, deposit, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
      [
        leaseId,
        orgId,
        unitId,
        tenantId,
        startDate,
        endDate,
        rent,
        str(fd, 'billing_period', 'monthly'),
        cents(fd, 'deposit'),
        new Date().toISOString(),
      ],
    );
    run(`UPDATE units SET status = 'occupied' WHERE id = ? AND org_id = ?`, [unitId, orgId]);
    audit({ orgId, userId: session.userId, actor: session.name, action: 'lease.created', entityType: 'lease', entityId: leaseId });
  });
  revalidatePath('/app/tenants');
  revalidatePath(`/app/properties/${unit.property_id}`);
  return { ok: true, message: `Lease started on ${unit.name}.` };
}

export async function endLeaseAction(_s: ActionState, fd: FormData): Promise<ActionState> {
  const session = await requireWorkspace();
  if (!allowed(session, 'leases.write')) return { error: 'Your role cannot manage leases.' };
  const orgId = session.orgId!;
  const id = str(fd, 'id');
  const lease = one<{ unit_id: string }>(`SELECT unit_id FROM leases WHERE id = ? AND org_id = ?`, [id, orgId]);
  if (!lease) return { error: 'Lease not found.' };
  transaction(() => {
    run(`UPDATE leases SET status = 'ended', end_date = ? WHERE id = ? AND org_id = ?`, [todayISO(), id, orgId]);
    run(`UPDATE units SET status = 'available' WHERE id = ? AND org_id = ?`, [lease.unit_id, orgId]);
    audit({ orgId, userId: session.userId, actor: session.name, action: 'lease.ended', entityType: 'lease', entityId: id });
  });
  revalidatePath('/app/tenants');
  return { ok: true, message: 'Lease ended and the unit released.' };
}

export async function renewLeaseAction(_s: ActionState, fd: FormData): Promise<ActionState> {
  const session = await requireWorkspace();
  if (!allowed(session, 'leases.write')) return { error: 'Your role cannot manage leases.' };
  const orgId = session.orgId!;
  const id = str(fd, 'id');
  const months = Math.max(1, Number(str(fd, 'months', '12')) || 12);
  const lease = one<{ end_date: string; rent_amount: number }>(
    `SELECT end_date, rent_amount FROM leases WHERE id = ? AND org_id = ? AND status = 'active'`,
    [id, orgId],
  );
  if (!lease) return { error: 'Active lease not found.' };
  const base = new Date(`${lease.end_date}T00:00:00.000Z`);
  base.setUTCMonth(base.getUTCMonth() + months);
  const rent = cents(fd, 'rent') || lease.rent_amount;
  run(`UPDATE leases SET end_date = ?, rent_amount = ? WHERE id = ? AND org_id = ?`, [
    base.toISOString().slice(0, 10),
    rent,
    id,
    orgId,
  ]);
  audit({ orgId, userId: session.userId, actor: session.name, action: 'lease.renewed', entityType: 'lease', entityId: id });
  revalidatePath('/app/tenants');
  return { ok: true, message: `Lease renewed to ${base.toISOString().slice(0, 10)}.` };
}

export async function createDocumentAction(_s: ActionState, fd: FormData): Promise<ActionState> {
  const session = await requireWorkspace();
  if (!allowed(session, 'documents.write')) return { error: 'Your role cannot upload documents.' };
  const orgId = session.orgId!;
  const entityType = str(fd, 'entity_type', 'lease');
  const entityId = str(fd, 'entity_id');
  const file = fd.get('file');
  if (!(file instanceof File) || file.size === 0) return { error: 'Choose a file to upload.' };
  if (file.size > 5_000_000) return { error: 'Documents must be smaller than 5 MB.' };
  const docId = newId('doc_');
  run(
    `INSERT INTO documents (id, org_id, name, mime, size, data, entity_type, entity_id, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      docId,
      orgId,
      file.name,
      file.type || 'application/octet-stream',
      file.size,
      Buffer.from(await file.arrayBuffer()),
      entityType,
      entityId,
      session.userId,
      new Date().toISOString(),
    ],
  );
  if (entityType === 'lease') {
    run(`UPDATE leases SET document_id = ? WHERE id = ? AND org_id = ?`, [docId, entityId, orgId]);
  }
  audit({ orgId, userId: session.userId, actor: session.name, action: 'document.uploaded', entityType, entityId });
  revalidatePath('/app/tenants');
  return { ok: true, message: 'Document attached.' };
}

/** Renewal reminders surfaced in the tenant workspace. */
/** Form-shaped wrappers for inline row actions rendered with plain <form action>. */
export async function renewLeaseFormAction(fd: FormData): Promise<void> {
  await renewLeaseAction({}, fd);
}

export async function endLeaseFormAction(fd: FormData): Promise<void> {
  await endLeaseAction({}, fd);
}

export async function createDocumentFormAction(fd: FormData): Promise<void> {
  await createDocumentAction({}, fd);
}

export async function upcomingRenewals(orgId: string, days = 60) {
  return one<{ c: number }>(
    `SELECT COUNT(*) AS c FROM leases WHERE org_id = ? AND status = 'active' AND end_date <= ?`,
    [orgId, addDays(todayISO(), days)],
  );
}
