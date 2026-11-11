import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireWorkspace, allowed } from '@/lib/auth';
import { all, one } from '@/lib/db';
import {
  createBuildingAction,
  createDeskAction,
  createFloorAction,
  createRoomAction,
  createUnitAction,
  deletePropertyAction,
  deleteResourceAction,
  deleteUnitAction,
  setPropertyStatusAction,
  updatePropertyAction,
  updateUnitStatusAction,
  uploadPropertyImageAction,
} from '@/lib/actions/properties';
import { money, percent, titleCase, fmtDate, BUSINESS_TYPES } from '@/lib/format';
import { ActionForm, DangerSubmit, GhostSubmit } from '@/components/form';
import { Card, PageHeader, Field, EmptyState, StatusBadge, Badge, Progress, DataRow } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function PropertyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireWorkspace();
  const orgId = session.orgId!;
  const { id } = await params;

  const property = one<{
    id: string;
    name: string;
    type: string;
    description: string | null;
    address: string | null;
    city: string | null;
    country: string | null;
    status: string;
    image_id: string | null;
    manager_id: string | null;
    created_at: string;
  }>(`SELECT * FROM properties WHERE id = ? AND org_id = ?`, [id, orgId]);
  if (!property) notFound();

  const canWrite = allowed(session, 'properties.write');
  const canSpaces = allowed(session, 'workspaces.write');

  const buildings = all<{ id: string; name: string; floors_count: number }>(
    `SELECT id, name, floors_count FROM buildings WHERE property_id = ? AND org_id = ? ORDER BY created_at`,
    [id, orgId],
  );
  const floors = all<{ id: string; building_id: string; name: string; level: number }>(
    `SELECT f.id, f.building_id, f.name, f.level FROM floors f
       JOIN buildings b ON b.id = f.building_id
      WHERE b.property_id = ? AND f.org_id = ? ORDER BY f.level`,
    [id, orgId],
  );
  const units = all<{
    id: string;
    name: string;
    kind: string;
    area_sqm: number;
    bedrooms: number;
    rent_amount: number;
    rent_period: string;
    status: string;
    building_id: string | null;
    floor_id: string | null;
  }>(`SELECT * FROM units WHERE property_id = ? AND org_id = ? ORDER BY name`, [id, orgId]);
  const desks = all<{ id: string; name: string; category: string; daily_rate: number; monthly_rate: number; status: string }>(
    `SELECT id, name, category, daily_rate, monthly_rate, status FROM desks WHERE property_id = ? AND org_id = ? ORDER BY name`,
    [id, orgId],
  );
  const rooms = all<{ id: string; name: string; capacity: number; hourly_rate: number; amenities: string | null; status: string }>(
    `SELECT id, name, capacity, hourly_rate, amenities, status FROM rooms WHERE property_id = ? AND org_id = ? ORDER BY name`,
    [id, orgId],
  );
  const managers = all<{ id: string; name: string }>(
    `SELECT u.id, u.name FROM org_members m JOIN users u ON u.id = m.user_id
      WHERE m.org_id = ? AND m.status = 'active' ORDER BY u.name`,
    [orgId],
  );
  const revenue = one<{ s: number }>(
    `SELECT COALESCE(SUM(pay.amount),0) AS s FROM payments pay JOIN invoices i ON i.id = pay.invoice_id
      WHERE i.property_id = ? AND pay.org_id = ? AND pay.status IN ('succeeded','paid') AND pay.verified = 1`,
    [id, orgId],
  );
  const activeLeases = one<{ c: number }>(
    `SELECT COUNT(*) AS c FROM leases l JOIN units u ON u.id = l.unit_id
      WHERE u.property_id = ? AND l.org_id = ? AND l.status = 'active'`,
    [id, orgId],
  );

  const occupied = units.filter((u) => u.status === 'occupied').length;
  const occupancy = units.length ? (occupied / units.length) * 100 : 0;
  const cur = session.currency;
  const loc = session.locale;

  return (
    <div className="mx-auto max-w-[1320px]">
      <Link href="/app/properties" className="mb-4 inline-block text-[12.5px] font-medium muted hover:text-brand">
        ← All properties
      </Link>

      <div className="card mb-4 overflow-hidden p-0">
        <div className="relative h-40 w-full bg-gradient-to-br from-brand/30 via-brand/10 to-transparent sm:h-52">
          {property.image_id && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/files/${property.image_id}`} alt={property.name} className="h-full w-full object-cover" />
          )}
          <div className="absolute bottom-3 left-3 flex flex-wrap items-center gap-2">
            <Badge tone="brand">{titleCase(property.type)}</Badge>
            <StatusBadge status={property.status} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-4">
          <DataRow label="Units" value={String(units.length)} />
          <DataRow label="Occupancy" value={percent(occupancy)} />
          <DataRow label="Revenue" value={money(Number(revenue?.s ?? 0), cur, loc)} />
          <DataRow label="Active leases" value={String(activeLeases?.c ?? 0)} />
        </div>
      </div>

      <PageHeader eyebrow="Property" title={property.name} subtitle={property.description ?? 'No description yet.'}>
        <div className="flex flex-wrap gap-2">
          {canSpaces && <Link href={`/app/bookings?property=${property.id}`} className="btn btn-sm">Book a space</Link>}
          {canWrite && (
            <ActionForm action={setPropertyStatusAction} className="flex items-center gap-2" compact submit={property.status === 'archived' ? 'Restore' : 'Archive'}>
              <input type="hidden" name="id" value={property.id} />
              <input type="hidden" name="status" value={property.status === 'archived' ? 'active' : 'archived'} />
            </ActionForm>
          )}
        </div>
      </PageHeader>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1fr_360px]">
        <div className="space-y-3">
          <Card title="Units & spaces" subtitle="Inventory across every floor">
            {units.length ? (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Unit</th>
                      <th>Kind</th>
                      <th>Area</th>
                      <th>Rent</th>
                      <th>Status</th>
                      {canWrite && <th />}
                    </tr>
                  </thead>
                  <tbody>
                    {units.map((u) => (
                      <tr key={u.id}>
                        <td className="font-semibold">{u.name}</td>
                        <td>{titleCase(u.kind)}</td>
                        <td>{u.area_sqm ? `${u.area_sqm} m²` : '—'}{u.bedrooms ? ` · ${u.bedrooms} bed` : ''}</td>
                        <td className="whitespace-nowrap">{money(u.rent_amount, cur, loc)}<span className="text-[11px] muted">/{u.rent_period}</span></td>
                        <td><StatusBadge status={u.status} /></td>
                        {canWrite && (
                          <td>
                            <div className="flex items-center justify-end gap-1">
                              <ActionForm action={updateUnitStatusAction} className="flex items-center gap-1" compact submit="Set">
                                <input type="hidden" name="id" value={u.id} />
                                <select name="status" defaultValue={u.status} className="select !py-1 !text-[11.5px]">
                                  {['available', 'occupied', 'maintenance', 'reserved'].map((s) => (
                                    <option key={s} value={s}>{titleCase(s)}</option>
                                  ))}
                                </select>
                              </ActionForm>
                              <ActionForm action={deleteUnitAction} compact submit="" className="inline">
                                <input type="hidden" name="id" value={u.id} />
                                <DangerSubmit label="✕" confirmText={`Remove ${u.name}?`} />
                              </ActionForm>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState title="No units yet" body="Add offices, apartments or rooms below." />
            )}
          </Card>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Card title="Desks" subtitle={`${desks.length} bookable desks`}>
              {desks.length ? (
                <ul className="space-y-2">
                  {desks.map((d) => (
                    <li key={d.id} className="flex items-center justify-between gap-2 text-[12.5px]">
                      <span className="min-w-0 truncate">
                        <span className="font-semibold">{d.name}</span>{' '}
                        <span className="muted">{titleCase(d.category)}</span>
                      </span>
                      <span className="flex flex-none items-center gap-2">
                        <span className="muted">{money(d.daily_rate, cur, loc)}/day</span>
                        <StatusBadge status={d.status} />
                        {canSpaces && (
                          <ActionForm action={deleteResourceAction} compact submit="" className="inline">
                            <input type="hidden" name="resource" value="desks" />
                            <input type="hidden" name="id" value={d.id} />
                            <input type="hidden" name="property_id" value={property.id} />
                            <DangerSubmit label="✕" confirmText={`Remove ${d.name}?`} />
                          </ActionForm>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState title="No desks" body="Add hot desks or dedicated desks for booking." />
              )}
            </Card>

            <Card title="Meeting rooms" subtitle={`${rooms.length} rooms`}>
              {rooms.length ? (
                <ul className="space-y-2">
                  {rooms.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-2 text-[12.5px]">
                      <span className="min-w-0 truncate">
                        <span className="font-semibold">{r.name}</span> <span className="muted">{r.capacity} seats</span>
                      </span>
                      <span className="flex flex-none items-center gap-2">
                        <span className="muted">{money(r.hourly_rate, cur, loc)}/h</span>
                        <StatusBadge status={r.status} />
                        {canSpaces && (
                          <ActionForm action={deleteResourceAction} compact submit="" className="inline">
                            <input type="hidden" name="resource" value="rooms" />
                            <input type="hidden" name="id" value={r.id} />
                            <input type="hidden" name="property_id" value={property.id} />
                            <DangerSubmit label="✕" confirmText={`Remove ${r.name}?`} />
                          </ActionForm>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState title="No rooms" body="Add meeting rooms with hourly pricing." />
              )}
            </Card>
          </div>

          <Card title="Structure" subtitle="Buildings and floors">
            <div className="space-y-3">
              {buildings.map((b) => (
                <div key={b.id} className="rounded-lg border border-[var(--line)] p-3">
                  <p className="text-[13px] font-semibold">{b.name}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {floors.filter((f) => f.building_id === b.id).map((f) => (
                      <Badge key={f.id}>{f.name}</Badge>
                    ))}
                    {!floors.some((f) => f.building_id === b.id) && <span className="text-[11.5px] muted">No floors yet</span>}
                  </div>
                </div>
              ))}
              {!buildings.length && <EmptyState title="No buildings" body="Add a building to organise floors and units." />}
            </div>
          </Card>
        </div>

        <div className="space-y-3">
          {canWrite && (
            <Card title="Property details" subtitle="Visible across the workspace">
              <ActionForm action={updatePropertyAction} submit="Save changes">
                <input type="hidden" name="id" value={property.id} />
                <Field label="Name" name="name" defaultValue={property.name} required />
                <Field
                  label="Type"
                  name="type"
                  defaultValue={property.type}
                  options={[
                    { value: 'coworking', label: 'Coworking space' },
                    { value: 'commercial', label: 'Commercial offices' },
                    { value: 'residential', label: 'Residential' },
                    { value: 'serviced_office', label: 'Serviced offices' },
                    { value: 'mixed', label: 'Mixed use' },
                  ]}
                />
                <Field label="Address" name="address" defaultValue={property.address} />
                <Field label="City" name="city" defaultValue={property.city} />
                <Field label="Country" name="country" defaultValue={property.country} />
                <Field
                  label="Manager"
                  name="manager_id"
                  defaultValue={property.manager_id}
                  options={managers.map((m) => ({ value: m.id, label: m.name }))}
                />
                <Field label="Description" name="description" rows={3} defaultValue={property.description} />
              </ActionForm>
              <div className="mt-4 border-t border-[var(--line)] pt-4">
                <p className="label">Cover photo</p>
                <ActionForm action={uploadPropertyImageAction} submit="Upload photo" compact>
                  <input type="hidden" name="property_id" value={property.id} />
                  <input type="file" name="image" accept="image/png,image/jpeg,image/webp,image/gif" className="input !py-1.5" required />
                </ActionForm>
              </div>
            </Card>
          )}

          {canWrite && (
            <Card title="Add a unit" subtitle="Office, apartment, room or desk cluster">
              <ActionForm action={createUnitAction} submit="Add unit">
                <input type="hidden" name="property_id" value={property.id} />
                <Field label="Unit name" name="name" placeholder="Office 2.04" required />
                <Field
                  label="Kind"
                  name="kind"
                  options={[
                    { value: 'office', label: 'Private office' },
                    { value: 'apartment', label: 'Apartment' },
                    { value: 'room', label: 'Room' },
                    { value: 'desk_cluster', label: 'Desk cluster' },
                    { value: 'retail', label: 'Retail unit' },
                  ]}
                />
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Area (m²)" name="area_sqm" type="number" min={0} step="0.1" />
                  <Field label="Bedrooms" name="bedrooms" type="number" min={0} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Rent" name="rent" type="number" min={0} step="0.01" placeholder="1450" />
                  <Field
                    label="Period"
                    name="rent_period"
                    options={[
                      { value: 'monthly', label: 'Monthly' },
                      { value: 'yearly', label: 'Yearly' },
                      { value: 'weekly', label: 'Weekly' },
                      { value: 'daily', label: 'Daily' },
                    ]}
                  />
                </div>
                <Field
                  label="Status"
                  name="status"
                  options={[
                    { value: 'available', label: 'Available' },
                    { value: 'occupied', label: 'Occupied' },
                    { value: 'maintenance', label: 'Maintenance' },
                    { value: 'reserved', label: 'Reserved' },
                  ]}
                />
                {buildings.length > 0 && (
                  <Field
                    label="Building"
                    name="building_id"
                    options={buildings.map((b) => ({ value: b.id, label: b.name }))}
                  />
                )}
                <Field label="Description" name="description" rows={2} />
              </ActionForm>
            </Card>
          )}

          {canSpaces && (
            <Card title="Add bookable space" subtitle="Desks and meeting rooms">
              <div className="space-y-5">
                <ActionForm action={createDeskAction} submit="Add desk" compact pendingLabel="Adding…">
                  <input type="hidden" name="property_id" value={property.id} />
                  <Field label="Desk name" name="name" placeholder="Desk A-12" required />
                  <Field
                    label="Category"
                    name="category"
                    options={[
                      { value: 'hot_desk', label: 'Hot desk' },
                      { value: 'dedicated', label: 'Dedicated desk' },
                      { value: 'flex', label: 'Flex desk' },
                    ]}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Hourly rate" name="hourly_rate" type="number" min={0} step="0.01" />
                    <Field label="Daily rate" name="daily_rate" type="number" min={0} step="0.01" />
                  </div>
                  <Field label="Monthly rate" name="monthly_rate" type="number" min={0} step="0.01" />
                </ActionForm>
                <div className="border-t border-[var(--line)] pt-4">
                  <ActionForm action={createRoomAction} submit="Add room" compact pendingLabel="Adding…">
                    <input type="hidden" name="property_id" value={property.id} />
                    <Field label="Room name" name="name" placeholder="Boardroom" required />
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Capacity" name="capacity" type="number" min={1} defaultValue={6} />
                      <Field label="Hourly rate" name="hourly_rate" type="number" min={0} step="0.01" />
                    </div>
                    <Field label="Amenities" name="amenities" placeholder="TV, whiteboard, video" />
                  </ActionForm>
                </div>
              </div>
            </Card>
          )}

          {canWrite && (
            <Card title="Building & floors" subtitle="Extend the property structure">
              <div className="space-y-5">
                <ActionForm action={createBuildingAction} submit="Add building" compact>
                  <input type="hidden" name="property_id" value={property.id} />
                  <Field label="Building name" name="name" placeholder="Tower B" required />
                  <Field label="Floors" name="floors_count" type="number" min={1} defaultValue={1} />
                </ActionForm>
                <div className="border-t border-[var(--line)] pt-4">
                  <ActionForm action={createFloorAction} submit="Add floor" compact>
                    <Field
                      label="Building"
                      name="building_id"
                      options={buildings.map((b) => ({ value: b.id, label: b.name }))}
                    />
                    <Field label="Floor name" name="name" placeholder="Level 3" required />
                    <Field label="Level" name="level" type="number" defaultValue={2} />
                  </ActionForm>
                </div>
              </div>
            </Card>
          )}

          <Card title="Occupancy" subtitle="Current unit utilisation">
            <div className="mb-2 flex items-center justify-between text-[12.5px]">
              <span className="muted">{occupied} of {units.length} units occupied</span>
              <span className="font-semibold">{percent(occupancy)}</span>
            </div>
            <Progress value={occupancy} />
            <div className="mt-4 space-y-1.5 text-[12px] muted">
              <p>Created {fmtDate(property.created_at, loc, session.timezone)}</p>
              <p>{property.address ?? 'No address'}{property.city ? `, ${property.city}` : ''}</p>
              <p>Business type support: {BUSINESS_TYPES.length} configurations</p>
            </div>
          </Card>

          {canWrite && (
            <Card title="Danger zone" subtitle="Deletion requires no active leases">
              <ActionForm action={deletePropertyAction} submit="Delete property">
                <input type="hidden" name="id" value={property.id} />
                <p className="text-[12px] muted">This removes buildings, floors, units, desks and rooms.</p>
              </ActionForm>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
