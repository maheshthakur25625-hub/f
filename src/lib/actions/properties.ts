'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { all, audit, one, run } from '../db';
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

async function ctx(permission: 'properties.write' | 'workspaces.write' | 'properties.view') {
  const session = await requireWorkspace();
  if (!allowed(session, permission)) return { error: 'Your role does not allow this action.' as string, session: null };
  return { error: null as string | null, session };
}

export async function createPropertyAction(_s: ActionState, fd: FormData): Promise<ActionState> {
  const { error, session } = await ctx('properties.write');
  if (error || !session) return { error: error ?? 'Not permitted.' };
  const name = str(fd, 'name');
  if (name.length < 2) return { error: 'Enter a property name.' };

  const id = newId('prp_');
  run(
    `INSERT INTO properties (id, org_id, name, type, description, address, city, country, manager_id, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
    [
      id,
      session.orgId,
      name,
      str(fd, 'type', 'coworking'),
      str(fd, 'description') || null,
      str(fd, 'address') || null,
      str(fd, 'city') || null,
      str(fd, 'country', session.country),
      str(fd, 'manager_id') || session.userId,
      new Date().toISOString(),
    ],
  );
  const buildingId = newId('bld_');
  run(`INSERT INTO buildings (id, org_id, property_id, name, floors_count, created_at) VALUES (?, ?, ?, ?, 1, ?)`, [
    buildingId,
    session.orgId,
    id,
    `${name} — Main building`,
    new Date().toISOString(),
  ]);
  run(`INSERT INTO floors (id, org_id, building_id, name, level, created_at) VALUES (?, ?, ?, 'Level 1', 1, ?)`, [
    newId('flr_'),
    session.orgId,
    buildingId,
    new Date().toISOString(),
  ]);
  audit({ orgId: session.orgId!, userId: session.userId, actor: session.name, action: 'property.created', entityType: 'property', entityId: id });
  revalidatePath('/app/properties');
  redirect(`/app/properties/${id}`);
}

export async function updatePropertyAction(_s: ActionState, fd: FormData): Promise<ActionState> {
  const { error, session } = await ctx('properties.write');
  if (error || !session) return { error: error ?? 'Not permitted.' };
  const id = str(fd, 'id');
  const owned = one(`SELECT id FROM properties WHERE id = ? AND org_id = ?`, [id, session.orgId]);
  if (!owned) return { error: 'Property not found in this workspace.' };
  run(
    `UPDATE properties SET name = ?, type = ?, description = ?, address = ?, city = ?, country = ?, manager_id = ? WHERE id = ? AND org_id = ?`,
    [
      str(fd, 'name'),
      str(fd, 'type', 'coworking'),
      str(fd, 'description') || null,
      str(fd, 'address') || null,
      str(fd, 'city') || null,
      str(fd, 'country', session.country),
      str(fd, 'manager_id') || null,
      id,
      session.orgId,
    ],
  );
  audit({ orgId: session.orgId!, userId: session.userId, actor: session.name, action: 'property.updated', entityType: 'property', entityId: id });
  revalidatePath(`/app/properties/${id}`);
  return { ok: true, message: 'Property saved.' };
}

export async function setPropertyStatusAction(_s: ActionState, fd: FormData): Promise<ActionState> {
  const { error, session } = await ctx('properties.write');
  if (error || !session) return { error: error ?? 'Not permitted.' };
  const id = str(fd, 'id');
  const status = str(fd, 'status', 'active');
  run(`UPDATE properties SET status = ? WHERE id = ? AND org_id = ?`, [status, id, session.orgId]);
  audit({ orgId: session.orgId!, userId: session.userId, actor: session.name, action: `property.${status}`, entityType: 'property', entityId: id });
  revalidatePath('/app/properties');
  revalidatePath(`/app/properties/${id}`);
  return { ok: true, message: status === 'archived' ? 'Property archived.' : 'Property restored.' };
}

export async function deletePropertyAction(_s: ActionState, fd: FormData): Promise<ActionState> {
  const { error, session } = await ctx('properties.write');
  if (error || !session) return { error: error ?? 'Not permitted.' };
  const id = str(fd, 'id');
  const activeLeases = one<{ c: number }>(
    `SELECT COUNT(*) AS c FROM leases l JOIN units u ON u.id = l.unit_id WHERE u.property_id = ? AND l.org_id = ? AND l.status = 'active'`,
    [id, session.orgId],
  );
  if (Number(activeLeases?.c ?? 0) > 0) {
    return { error: 'This property has active leases. Archive it instead of deleting.' };
  }
  const orgId = session.orgId!;
  run(`DELETE FROM desks WHERE property_id = ? AND org_id = ?`, [id, orgId]);
  run(`DELETE FROM rooms WHERE property_id = ? AND org_id = ?`, [id, orgId]);
  run(`DELETE FROM units WHERE property_id = ? AND org_id = ?`, [id, orgId]);
  run(`DELETE FROM floors WHERE org_id = ? AND building_id IN (SELECT id FROM buildings WHERE property_id = ? AND org_id = ?)`, [orgId, id, orgId]);
  run(`DELETE FROM buildings WHERE property_id = ? AND org_id = ?`, [id, orgId]);
  run(`DELETE FROM properties WHERE id = ? AND org_id = ?`, [id, orgId]);
  audit({ orgId, userId: session.userId, actor: session.name, action: 'property.deleted', entityType: 'property', entityId: id });
  revalidatePath('/app/properties');
  redirect('/app/properties');
}

export async function uploadPropertyImageAction(_s: ActionState, fd: FormData): Promise<ActionState> {
  const { error, session } = await ctx('properties.write');
  if (error || !session) return { error: error ?? 'Not permitted.' };
  const id = str(fd, 'property_id');
  const owned = one(`SELECT id FROM properties WHERE id = ? AND org_id = ?`, [id, session.orgId]);
  if (!owned) return { error: 'Property not found.' };
  const file = fd.get('image');
  if (!(file instanceof File) || file.size === 0) return { error: 'Choose an image file.' };
  if (file.size > 3_000_000) return { error: 'Images must be smaller than 3 MB.' };
  if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) return { error: 'Only PNG, JPEG, WEBP or GIF images are supported.' };
  const data = Buffer.from(await file.arrayBuffer());
  const docId = newId('doc_');
  run(
    `INSERT INTO documents (id, org_id, name, mime, size, data, entity_type, entity_id, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'property', ?, ?, ?)`,
    [docId, session.orgId, file.name, file.type, file.size, data, id, session.userId, new Date().toISOString()],
  );
  run(`UPDATE properties SET image_id = ? WHERE id = ? AND org_id = ?`, [docId, id, session.orgId]);
  revalidatePath(`/app/properties/${id}`);
  return { ok: true, message: 'Photo uploaded.' };
}

export async function createBuildingAction(_s: ActionState, fd: FormData): Promise<ActionState> {
  const { error, session } = await ctx('properties.write');
  if (error || !session) return { error: error ?? 'Not permitted.' };
  const propertyId = str(fd, 'property_id');
  if (!one(`SELECT id FROM properties WHERE id = ? AND org_id = ?`, [propertyId, session.orgId])) {
    return { error: 'Property not found.' };
  }
  const name = str(fd, 'name');
  if (!name) return { error: 'Enter a building name.' };
  run(`INSERT INTO buildings (id, org_id, property_id, name, floors_count, created_at) VALUES (?, ?, ?, ?, ?, ?)`, [
    newId('bld_'),
    session.orgId,
    propertyId,
    name,
    num(fd, 'floors_count', 1),
    new Date().toISOString(),
  ]);
  revalidatePath(`/app/properties/${propertyId}`);
  return { ok: true, message: 'Building added.' };
}

export async function createFloorAction(_s: ActionState, fd: FormData): Promise<ActionState> {
  const { error, session } = await ctx('properties.write');
  if (error || !session) return { error: error ?? 'Not permitted.' };
  const buildingId = str(fd, 'building_id');
  const building = one<{ property_id: string }>(`SELECT property_id FROM buildings WHERE id = ? AND org_id = ?`, [
    buildingId,
    session.orgId,
  ]);
  if (!building) return { error: 'Building not found.' };
  const name = str(fd, 'name');
  if (!name) return { error: 'Enter a floor name.' };
  run(`INSERT INTO floors (id, org_id, building_id, name, level, created_at) VALUES (?, ?, ?, ?, ?, ?)`, [
    newId('flr_'),
    session.orgId,
    buildingId,
    name,
    num(fd, 'level', 1),
    new Date().toISOString(),
  ]);
  revalidatePath(`/app/properties/${building.property_id}`);
  return { ok: true, message: 'Floor added.' };
}

export async function createUnitAction(_s: ActionState, fd: FormData): Promise<ActionState> {
  const { error, session } = await ctx('properties.write');
  if (error || !session) return { error: error ?? 'Not permitted.' };
  const propertyId = str(fd, 'property_id');
  if (!one(`SELECT id FROM properties WHERE id = ? AND org_id = ?`, [propertyId, session.orgId])) {
    return { error: 'Property not found.' };
  }
  const name = str(fd, 'name');
  if (!name) return { error: 'Enter a unit name.' };
  run(
    `INSERT INTO units (id, org_id, property_id, building_id, floor_id, name, kind, area_sqm, bedrooms, rent_amount, rent_period, status, description, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      newId('unt_'),
      session.orgId,
      propertyId,
      str(fd, 'building_id') || null,
      str(fd, 'floor_id') || null,
      name,
      str(fd, 'kind', 'office'),
      num(fd, 'area_sqm'),
      num(fd, 'bedrooms'),
      cents(fd, 'rent'),
      str(fd, 'rent_period', 'monthly'),
      str(fd, 'status', 'available'),
      str(fd, 'description') || null,
      new Date().toISOString(),
    ],
  );
  audit({ orgId: session.orgId!, userId: session.userId, actor: session.name, action: 'unit.created', entityType: 'unit', entityId: propertyId });
  revalidatePath(`/app/properties/${propertyId}`);
  return { ok: true, message: 'Unit added.' };
}

export async function updateUnitStatusAction(_s: ActionState, fd: FormData): Promise<ActionState> {
  const { error, session } = await ctx('properties.write');
  if (error || !session) return { error: error ?? 'Not permitted.' };
  const id = str(fd, 'id');
  const status = str(fd, 'status', 'available');
  const unit = one<{ property_id: string }>(`SELECT property_id FROM units WHERE id = ? AND org_id = ?`, [id, session.orgId]);
  if (!unit) return { error: 'Unit not found.' };
  run(`UPDATE units SET status = ? WHERE id = ? AND org_id = ?`, [status, id, session.orgId]);
  revalidatePath(`/app/properties/${unit.property_id}`);
  return { ok: true, message: 'Unit status updated.' };
}

export async function deleteUnitAction(_s: ActionState, fd: FormData): Promise<ActionState> {
  const { error, session } = await ctx('properties.write');
  if (error || !session) return { error: error ?? 'Not permitted.' };
  const id = str(fd, 'id');
  const unit = one<{ property_id: string }>(`SELECT property_id FROM units WHERE id = ? AND org_id = ?`, [id, session.orgId]);
  if (!unit) return { error: 'Unit not found.' };
  const leases = one<{ c: number }>(`SELECT COUNT(*) AS c FROM leases WHERE unit_id = ? AND org_id = ? AND status = 'active'`, [id, session.orgId]);
  if (Number(leases?.c ?? 0) > 0) return { error: 'This unit has an active lease.' };
  run(`DELETE FROM units WHERE id = ? AND org_id = ?`, [id, session.orgId]);
  revalidatePath(`/app/properties/${unit.property_id}`);
  return { ok: true, message: 'Unit removed.' };
}

export async function createDeskAction(_s: ActionState, fd: FormData): Promise<ActionState> {
  const { error, session } = await ctx('workspaces.write');
  if (error || !session) return { error: error ?? 'Not permitted.' };
  const propertyId = str(fd, 'property_id');
  if (!one(`SELECT id FROM properties WHERE id = ? AND org_id = ?`, [propertyId, session.orgId])) {
    return { error: 'Property not found.' };
  }
  const name = str(fd, 'name');
  if (!name) return { error: 'Enter a desk name.' };
  run(
    `INSERT INTO desks (id, org_id, property_id, unit_id, name, category, hourly_rate, daily_rate, monthly_rate, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'available', ?)`,
    [
      newId('dsk_'),
      session.orgId,
      propertyId,
      str(fd, 'unit_id') || null,
      name,
      str(fd, 'category', 'hot_desk'),
      cents(fd, 'hourly_rate'),
      cents(fd, 'daily_rate'),
      cents(fd, 'monthly_rate'),
      new Date().toISOString(),
    ],
  );
  revalidatePath(`/app/properties/${propertyId}`);
  return { ok: true, message: 'Desk added.' };
}

export async function createRoomAction(_s: ActionState, fd: FormData): Promise<ActionState> {
  const { error, session } = await ctx('workspaces.write');
  if (error || !session) return { error: error ?? 'Not permitted.' };
  const propertyId = str(fd, 'property_id');
  if (!one(`SELECT id FROM properties WHERE id = ? AND org_id = ?`, [propertyId, session.orgId])) {
    return { error: 'Property not found.' };
  }
  const name = str(fd, 'name');
  if (!name) return { error: 'Enter a room name.' };
  run(
    `INSERT INTO rooms (id, org_id, property_id, name, capacity, hourly_rate, amenities, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'available', ?)`,
    [
      newId('rom_'),
      session.orgId,
      propertyId,
      name,
      num(fd, 'capacity', 4),
      cents(fd, 'hourly_rate'),
      str(fd, 'amenities') || null,
      new Date().toISOString(),
    ],
  );
  revalidatePath(`/app/properties/${propertyId}`);
  return { ok: true, message: 'Meeting room added.' };
}

export async function deleteResourceAction(_s: ActionState, fd: FormData): Promise<ActionState> {
  const session = await requireWorkspace();
  if (!allowed(session, 'workspaces.write')) return { error: 'Your role does not allow this action.' };
  const kind = str(fd, 'resource');
  const id = str(fd, 'id');
  const propertyId = str(fd, 'property_id');
  if (!['desks', 'rooms'].includes(kind)) return { error: 'Unsupported resource.' };
  run(`DELETE FROM ${kind} WHERE id = ? AND org_id = ?`, [id, session.orgId]);
  revalidatePath(`/app/properties/${propertyId}`);
  return { ok: true, message: 'Removed.' };
}

export async function listDeskAvailability(orgId: string, propertyId: string, startAt: string, endAt: string) {
  return all<{ id: string; name: string; category: string; daily_rate: number; hourly_rate: number }>(
    `SELECT d.id, d.name, d.category, d.daily_rate, d.hourly_rate FROM desks d
      WHERE d.org_id = ? AND d.property_id = ? AND d.status != 'maintenance'
        AND NOT EXISTS (
          SELECT 1 FROM bookings b WHERE b.org_id = d.org_id AND b.resource_id = d.id
            AND b.status IN ('confirmed','checked_in') AND b.start_at < ? AND b.end_at > ?)
      ORDER BY d.name`,
    [orgId, propertyId, endAt, startAt],
  );
}
