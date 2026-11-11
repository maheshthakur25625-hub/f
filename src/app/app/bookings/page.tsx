import Link from 'next/link';
import { requireWorkspace, allowed } from '@/lib/auth';
import { all, one } from '@/lib/db';
import { availabilityForDay, cancelBookingAction, createBookingAction, setBookingStatusAction } from '@/lib/actions/bookings';
import { money, fmtTime, fmtDate, titleCase, todayISO, addDays } from '@/lib/format';
import { ActionForm, DangerSubmit, GhostSubmit } from '@/components/form';
import { Card, PageHeader, Field, EmptyState, StatusBadge, Badge, Stat } from '@/components/ui';

export const dynamic = 'force-dynamic';

type BookingRow = {
  id: string;
  resource_type: string;
  resource_name: string;
  member_id: string;
  member_name: string | null;
  start_at: string;
  end_at: string;
  status: string;
  total_amount: number;
  notes: string | null;
};

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ property?: string; date?: string }>;
}) {
  const session = await requireWorkspace();
  const orgId = session.orgId!;
  const sp = await searchParams;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? '') ? sp.date! : todayISO();

  const properties = all<{ id: string; name: string }>(
    `SELECT id, name FROM properties WHERE org_id = ? AND status = 'active' ORDER BY name`,
    [orgId],
  );
  const propertyId = sp.property && properties.some((p) => p.id === sp.property) ? sp.property : properties[0]?.id;

  const canWrite = allowed(session, 'bookings.write');
  const dayStart = new Date(`${date}T00:00:00.000Z`).toISOString();
  const dayEnd = new Date(`${addDays(date, 1)}T00:00:00.000Z`).toISOString();

  const bookings = propertyId
    ? (all<BookingRow>(
        `SELECT b.*, u.name AS member_name FROM bookings b LEFT JOIN users u ON u.id = b.member_id
          WHERE b.org_id = ? AND b.property_id = ? AND b.start_at >= ? AND b.start_at < ?
          ORDER BY b.start_at`,
        [orgId, propertyId, dayStart, dayEnd],
      ) as BookingRow[])
    : [];

  const availability = propertyId ? await availabilityForDay(orgId, propertyId, date) : { desks: [], rooms: [] };
  const members = all<{ id: string; name: string; email: string }>(
    `SELECT u.id, u.name, u.email FROM org_members m JOIN users u ON u.id = m.user_id
      WHERE m.org_id = ? AND m.status = 'active' ORDER BY u.name`,
    [orgId],
  );

  const resourceOptions = [
    ...availability.desks.map((d) => ({
      value: `desk:${d.id}`,
      label: `Desk · ${d.name} (${titleCase(d.category)})${Number(d.busy) ? ' — busy' : ''}`,
    })),
    ...availability.rooms.map((r) => ({
      value: `room:${r.id}`,
      label: `Room · ${r.name} (${r.capacity} seats)${Number(r.busy) ? ' — busy' : ''}`,
    })),
  ];

  const confirmed = bookings.filter((b) => b.status === 'confirmed' || b.status === 'checked_in');
  const revenue = confirmed.reduce((s, b) => s + Number(b.total_amount), 0);
  const freeDesks = availability.desks.filter((d) => !Number(d.busy)).length;
  const freeRooms = availability.rooms.filter((r) => !Number(r.busy)).length;

  const weekAhead = one<{ c: number }>(
    `SELECT COUNT(*) AS c FROM bookings WHERE org_id = ? AND status IN ('confirmed','checked_in') AND start_at >= ? AND start_at < ?`,
    [orgId, new Date().toISOString(), addDays(todayISO(), 7) + 'T00:00:00.000Z'],
  );

  return (
    <div className="mx-auto max-w-[1320px]">
      <PageHeader
        eyebrow="Coworking operations"
        title="Bookings & availability"
        subtitle="Every reservation is validated against live availability inside a database transaction."
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {properties.map((p) => (
          <Link
            key={p.id}
            href={`/app/bookings?property=${p.id}&date=${date}`}
            className={`btn btn-sm ${propertyId === p.id ? 'btn-primary' : ''}`}
          >
            {p.name}
          </Link>
        ))}
        {!properties.length && <span className="text-[12.5px] muted">Create a property first.</span>}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Bookings today" value={String(confirmed.length)} hint={fmtDate(date, session.locale, session.timezone)} />
        <Stat label="Free desks" value={String(freeDesks)} hint={`${availability.desks.length} desks total`} tone={freeDesks > 0 ? 'ok' : 'warn'} />
        <Stat label="Free rooms" value={String(freeRooms)} hint={`${availability.rooms.length} rooms total`} tone={freeRooms > 0 ? 'ok' : 'warn'} />
        <Stat label="Booked value" value={money(revenue, session.currency, session.locale)} hint={`${weekAhead?.c ?? 0} upcoming this week`} tone="brand" />
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1fr_360px]">
        <div className="space-y-3">
          <Card
            title={`Schedule · ${fmtDate(date, session.locale, session.timezone)}`}
            subtitle="Check in, check out or release a space"
            action={
              <div className="flex gap-1">
                <Link href={`/app/bookings?property=${propertyId ?? ''}&date=${addDays(date, -1)}`} className="btn btn-sm">←</Link>
                <Link href={`/app/bookings?property=${propertyId ?? ''}&date=${todayISO()}`} className="btn btn-sm">Today</Link>
                <Link href={`/app/bookings?property=${propertyId ?? ''}&date=${addDays(date, 1)}`} className="btn btn-sm">→</Link>
              </div>
            }
          >
            {bookings.length ? (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Space</th>
                      <th>Member</th>
                      <th>Value</th>
                      <th>Status</th>
                      {canWrite && <th />}
                    </tr>
                  </thead>
                  <tbody>
                    {bookings.map((b) => (
                      <tr key={b.id}>
                        <td className="whitespace-nowrap font-medium">
                          {fmtTime(b.start_at, session.locale, session.timezone)} – {fmtTime(b.end_at, session.locale, session.timezone)}
                        </td>
                        <td>
                          <span className="font-semibold">{b.resource_name}</span>
                          <span className="ml-1.5 text-[11px] muted">{titleCase(b.resource_type)}</span>
                        </td>
                        <td className="truncate">{b.member_name ?? 'Member'}</td>
                        <td className="whitespace-nowrap">{money(b.total_amount, session.currency, session.locale)}</td>
                        <td><StatusBadge status={b.status} /></td>
                        {canWrite && (
                          <td>
                            <div className="flex items-center justify-end gap-1">
                              {b.status === 'confirmed' && (
                                <ActionForm action={setBookingStatusAction} compact submit="" className="inline">
                                  <input type="hidden" name="id" value={b.id} />
                                  <input type="hidden" name="status" value="checked_in" />
                                  <GhostSubmit label="Check in" />
                                </ActionForm>
                              )}
                              {b.status === 'checked_in' && (
                                <ActionForm action={setBookingStatusAction} compact submit="" className="inline">
                                  <input type="hidden" name="id" value={b.id} />
                                  <input type="hidden" name="status" value="completed" />
                                  <GhostSubmit label="Check out" />
                                </ActionForm>
                              )}
                              {(b.status === 'confirmed' || b.status === 'checked_in') && (
                                <ActionForm action={cancelBookingAction} compact submit="" className="inline">
                                  <input type="hidden" name="id" value={b.id} />
                                  <DangerSubmit label="Cancel" confirmText="Cancel this booking and release the space?" />
                                </ActionForm>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                title="No bookings for this day"
                body="Use the availability panel to reserve a desk or meeting room."
              />
            )}
          </Card>

          <Card title="Availability snapshot" subtitle="Live desk and room occupancy for the selected day">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <p className="label">Desks</p>
                <ul className="space-y-1.5">
                  {availability.desks.map((d) => (
                    <li key={d.id} className="flex items-center justify-between text-[12.5px]">
                      <span className="truncate">{d.name}</span>
                      <Badge tone={Number(d.busy) ? 'warn' : 'ok'}>{Number(d.busy) ? 'Booked' : 'Free'}</Badge>
                    </li>
                  ))}
                  {!availability.desks.length && <li className="text-[12px] muted">No desks configured.</li>}
                </ul>
              </div>
              <div>
                <p className="label">Meeting rooms</p>
                <ul className="space-y-1.5">
                  {availability.rooms.map((r) => (
                    <li key={r.id} className="flex items-center justify-between text-[12.5px]">
                      <span className="truncate">{r.name}</span>
                      <Badge tone={Number(r.busy) ? 'warn' : 'ok'}>{Number(r.busy) ? 'Booked' : 'Free'}</Badge>
                    </li>
                  ))}
                  {!availability.rooms.length && <li className="text-[12px] muted">No rooms configured.</li>}
                </ul>
              </div>
            </div>
          </Card>
        </div>

        {canWrite && propertyId && (
          <Card title="Reserve a space" subtitle="Overlaps are rejected server-side" className="h-fit xl:sticky xl:top-6">
            <ActionForm action={createBookingAction} submit="Confirm booking">
              <Field
                label="Property"
                name="property_id"
                defaultValue={propertyId}
                options={properties.map((p) => ({ value: p.id, label: p.name }))}
              />
              <Field
                label="Space"
                name="resource"
                options={resourceOptions.length ? resourceOptions : [{ value: '', label: 'No bookable spaces' }]}
                required
              />
              <Field
                label="Member"
                name="member_id"
                defaultValue={session.userId}
                options={members.map((m) => ({ value: m.id, label: `${m.name} · ${m.email}` }))}
              />
              <Field label="Date" name="date" type="date" defaultValue={date} required />
              <div className="grid grid-cols-2 gap-3">
                <Field label="From" name="start" type="time" defaultValue="09:00" required />
                <Field label="To" name="end" type="time" defaultValue="17:00" required />
              </div>
              <Field label="Notes" name="notes" rows={2} placeholder="Client workshop, needs whiteboard." />
              <p className="text-[11px] muted">
                Rooms bill hourly; desks switch to the daily rate for bookings of six hours or more.
              </p>
            </ActionForm>
          </Card>
        )}
      </div>
    </div>
  );
}
