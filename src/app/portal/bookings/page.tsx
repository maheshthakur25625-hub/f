import { requirePortal } from '@/lib/auth';
import { all } from '@/lib/db';
import { portalBookAction, portalCancelBookingAction } from '@/lib/actions/portal';
import { fmtDate, fmtDateTime, money, titleCase, todayISO } from '@/lib/format';
import { ActionForm, DangerSubmit } from '@/components/form';
import { Card, PageHeader, Field, EmptyState, StatusBadge, Badge } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function PortalBookingsPage() {
  const session = await requirePortal();
  const orgId = session.orgId!;

  const desks = all<Record<string, any>>(
    `SELECT d.id, d.name, d.kind, d.daily_rate, d.status, p.name AS property_name
       FROM desks d JOIN properties p ON p.id = d.property_id
      WHERE d.org_id = ? AND d.status != 'maintenance' ORDER BY p.name, d.name`,
    [orgId],
  );
  const rooms = all<Record<string, any>>(
    `SELECT r.id, r.name, r.capacity, r.hourly_rate, r.status, p.name AS property_name
       FROM rooms r JOIN properties p ON p.id = r.property_id
      WHERE r.org_id = ? AND r.status != 'maintenance' ORDER BY p.name, r.name`,
    [orgId],
  );
  const mine = all<Record<string, any>>(
    `SELECT * FROM bookings WHERE org_id = ? AND member_id = ? ORDER BY start_at DESC LIMIT 50`,
    [orgId, session.userId],
  );
  const now = new Date().toISOString();

  return (
    <div className="space-y-6">
      <PageHeader title="Book a space" eyebrow="On demand" subtitle="Availability is validated on the server — confirmed bookings never overlap." />

      <div className="grid gap-4 lg:grid-cols-5">
        <Card title="New booking" className="lg:col-span-2">
          <ActionForm action={portalBookAction} submit="Confirm booking">
            <Field label="Space type" name="resource_type" options={[{ value: 'desk', label: 'Desk' }, { value: 'room', label: 'Meeting room' }]} />
            <Field
              label="Space"
              name="resource_id"
              options={[
                ...desks.map((d) => ({ value: d.id, label: `${d.property_name} · ${d.name} (${titleCase(d.kind ?? 'desk')})` })),
                ...rooms.map((r) => ({ value: r.id, label: `${r.property_name} · ${r.name} (room, ${r.capacity ?? 4} seats)` })),
              ]}
            />
            <Field label="Date" name="date" type="date" defaultValue={todayISO()} required />
            <div className="grid grid-cols-2 gap-2">
              <Field label="From" name="from" type="time" defaultValue="09:00" />
              <Field label="To" name="to" type="time" defaultValue="18:00" />
            </div>
            <Field label="Notes" name="notes" placeholder="Optional" />
          </ActionForm>
        </Card>

        <Card title="Your bookings" className="lg:col-span-3" pad={false}>
          {mine.length === 0 ? (
            <div className="px-5 pb-5"><EmptyState title="No bookings yet" body="Your confirmed reservations will appear here." /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="table">
                <thead><tr><th>Space</th><th>When</th><th>Total</th><th>Status</th><th /></tr></thead>
                <tbody>
                  {mine.map((b) => {
                    const cancellable = b.status === 'confirmed' && b.start_at > now;
                    return (
                      <tr key={b.id}>
                        <td>
                          <div className="font-medium">{b.resource_name}</div>
                          <div className="text-[11px] muted">{titleCase(b.resource_type)}</div>
                        </td>
                        <td className="muted">
                          {fmtDate(b.start_at, session.locale, session.timezone)}
                          <div className="text-[11px]">{fmtDateTime(b.start_at, session.locale, session.timezone).split(', ').slice(-1)}</div>
                        </td>
                        <td className="tabular-nums">{money(b.total_amount, session.currency, session.locale)}</td>
                        <td><StatusBadge status={b.status} /></td>
                        <td className="text-right">
                          {cancellable && (
                            <form action={portalCancelBookingAction}>
                              <input type="hidden" name="id" value={b.id} />
                              <DangerSubmit label="Cancel" confirmText="Cancel this booking?" />
                            </form>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <Card title="Available now" subtitle="Live inventory across your workspace" pad={false}>
        <div className="grid gap-0 sm:grid-cols-2 lg:grid-cols-3">
          {desks.slice(0, 6).map((d) => (
            <div key={d.id} className="border-b border-[var(--line)] px-5 py-3">
              <div className="flex items-center justify-between">
                <p className="text-[13px] font-medium">{d.name}</p>
                <Badge tone={d.status === 'available' ? 'ok' : 'neutral'}>{d.status}</Badge>
              </div>
              <p className="text-[11.5px] muted">{d.property_name} · {titleCase(d.kind ?? 'desk')}</p>
              <p className="mt-1 text-[12px]">{money(d.daily_rate, session.currency, session.locale)} / day</p>
            </div>
          ))}
          {rooms.slice(0, 3).map((r) => (
            <div key={r.id} className="border-b border-[var(--line)] px-5 py-3">
              <div className="flex items-center justify-between">
                <p className="text-[13px] font-medium">{r.name}</p>
                <Badge tone={r.status === 'available' ? 'ok' : 'neutral'}>{r.status}</Badge>
              </div>
              <p className="text-[11.5px] muted">{r.property_name} · {r.capacity ?? 4} seats</p>
              <p className="mt-1 text-[12px]">{money(r.hourly_rate, session.currency, session.locale)} / hour</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
