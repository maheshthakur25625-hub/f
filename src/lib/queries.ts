import { all, one } from './db';

/** Payments only count as revenue once a provider confirmation was verified. */
export const PAID_SQL = "status IN ('succeeded','paid') AND verified = 1";

export function count(sql: string, params: unknown[] = []): number {
  return Number(one<{ c: number }>(sql, params)?.c ?? 0);
}

export function total(sql: string, params: unknown[] = []): number {
  return Number(one<{ s: number | null }>(sql, params)?.s ?? 0);
}

export function lastMonths(n: number): { key: string; start: string; end: string }[] {
  const now = new Date();
  const out: { key: string; start: string; end: string }[] = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
    out.push({
      key: `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, '0')}`,
      start: start.toISOString(),
      end: end.toISOString(),
    });
  }
  return out;
}

export function revenueSeries(orgId: string, months = 6) {
  return lastMonths(months).map((m) => ({
    month: m.key,
    total: total(
      `SELECT COALESCE(SUM(amount),0) AS s FROM payments
        WHERE org_id = ? AND ${PAID_SQL} AND paid_at >= ? AND paid_at < ?`,
      [orgId, m.start, m.end],
    ),
  }));
}

export function bookingsSeries(orgId: string, months = 6) {
  return lastMonths(months).map((m) => ({
    month: m.key,
    total: count(`SELECT COUNT(*) AS c FROM bookings WHERE org_id = ? AND start_at >= ? AND start_at < ?`, [
      orgId,
      m.start,
      m.end,
    ]),
  }));
}

export function topProperties(orgId: string, limit = 5) {
  return all<{ id: string; name: string; revenue: number; units: number }>(
    `SELECT p.id, p.name,
            COALESCE((SELECT SUM(pay.amount) FROM payments pay
                        JOIN invoices i ON i.id = pay.invoice_id
                       WHERE i.property_id = p.id AND pay.org_id = p.org_id AND pay.${PAID_SQL}), 0) AS revenue,
            (SELECT COUNT(*) FROM units u WHERE u.property_id = p.id) AS units
       FROM properties p
      WHERE p.org_id = ? AND p.status != 'archived'
      ORDER BY revenue DESC
      LIMIT ?`,
    [orgId, limit],
  );
}

export function metrics(orgId: string) {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const in7 = new Date(now.getTime() + 7 * 86400000).toISOString();
  const in30 = new Date(now.getTime() + 30 * 86400000).toISOString().slice(0, 10);
  const ago30 = new Date(now.getTime() - 30 * 86400000).toISOString();

  const properties = count(`SELECT COUNT(*) AS c FROM properties WHERE org_id = ? AND status != 'archived'`, [orgId]);
  const units = count(`SELECT COUNT(*) AS c FROM units WHERE org_id = ?`, [orgId]);
  const unitsOccupied = count(`SELECT COUNT(*) AS c FROM units WHERE org_id = ? AND status = 'occupied'`, [orgId]);
  const desks = count(`SELECT COUNT(*) AS c FROM desks WHERE org_id = ?`, [orgId]);
  const desksAssigned = count(`SELECT COUNT(*) AS c FROM desks WHERE org_id = ? AND status IN ('assigned','occupied')`, [orgId]);
  const rooms = count(`SELECT COUNT(*) AS c FROM rooms WHERE org_id = ?`, [orgId]);

  const leasable = units + desks;
  const occupied = unitsOccupied + desksAssigned;
  const occupancy = leasable ? (occupied / leasable) * 100 : 0;

  const revenueTotal = total(`SELECT COALESCE(SUM(amount),0) AS s FROM payments WHERE org_id = ? AND ${PAID_SQL}`, [orgId]);
  const revenueMonth = total(
    `SELECT COALESCE(SUM(amount),0) AS s FROM payments WHERE org_id = ? AND ${PAID_SQL} AND paid_at >= ?`,
    [orgId, monthStart],
  );

  const leaseMrr = total(
    `SELECT COALESCE(SUM(CASE WHEN billing_period = 'yearly' THEN rent_amount / 12 ELSE rent_amount END),0) AS s
       FROM leases WHERE org_id = ? AND status = 'active'`,
    [orgId],
  );
  const memberMrr = total(
    `SELECT COALESCE(SUM(CASE WHEN period = 'yearly' THEN price / 12 ELSE price END),0) AS s
       FROM memberships WHERE org_id = ? AND status = 'active'`,
    [orgId],
  );
  const mrr = leaseMrr + memberMrr;

  const pendingPayments = total(
    `SELECT COALESCE(SUM(total),0) AS s FROM invoices WHERE org_id = ? AND status IN ('sent','overdue','partial')`,
    [orgId],
  );
  const overdueInvoices = count(`SELECT COUNT(*) AS c FROM invoices WHERE org_id = ? AND status = 'overdue'`, [orgId]);
  const activeTenants = count(`SELECT COUNT(*) AS c FROM tenants WHERE org_id = ? AND status = 'active'`, [orgId]);
  const activeMembers = count(`SELECT COUNT(*) AS c FROM memberships WHERE org_id = ? AND status = 'active'`, [orgId]);
  const newEnquiries = count(`SELECT COUNT(*) AS c FROM leads WHERE org_id = ? AND created_at >= ?`, [orgId, ago30]);
  const upcomingBookings = count(
    `SELECT COUNT(*) AS c FROM bookings WHERE org_id = ? AND status = 'confirmed' AND start_at >= ? AND start_at <= ?`,
    [orgId, now.toISOString(), in7],
  );
  const openTickets = count(
    `SELECT COUNT(*) AS c FROM maintenance_tickets WHERE org_id = ? AND status IN ('open','in_progress')`,
    [orgId],
  );
  const expiringMemberships = count(
    `SELECT COUNT(*) AS c FROM memberships WHERE org_id = ? AND status = 'active' AND ends_on <= ?`,
    [orgId, in30],
  );
  const vacantUnits = count(`SELECT COUNT(*) AS c FROM units WHERE org_id = ? AND status = 'available'`, [orgId]);
  const pipelineValue = total(`SELECT COALESCE(SUM(value),0) AS s FROM deals WHERE org_id = ? AND stage NOT IN ('won','lost')`, [orgId]);
  const wonValue = total(`SELECT COALESCE(SUM(value),0) AS s FROM deals WHERE org_id = ? AND stage = 'won'`, [orgId]);
  const expensesMonth = total(`SELECT COALESCE(SUM(amount),0) AS s FROM expenses WHERE org_id = ? AND spent_on >= ?`, [
    orgId,
    monthStart.slice(0, 10),
  ]);

  return {
    properties,
    units,
    unitsOccupied,
    desks,
    desksAssigned,
    rooms,
    occupancy,
    revenueTotal,
    revenueMonth,
    mrr,
    pendingPayments,
    overdueInvoices,
    activeTenants,
    activeMembers,
    newEnquiries,
    upcomingBookings,
    openTickets,
    expiringMemberships,
    vacantUnits,
    pipelineValue,
    wonValue,
    expensesMonth,
  };
}

export function activityFeed(orgId: string, limit = 8) {
  return all<{ id: string; action: string; entity_type: string | null; actor: string | null; created_at: string }>(
    `SELECT id, action, entity_type, actor, created_at FROM audit_logs WHERE org_id = ? ORDER BY created_at DESC LIMIT ?`,
    [orgId, limit],
  );
}

export function upcomingBookings(orgId: string, limit = 6) {
  return all(
    `SELECT b.*, u.name AS member_name FROM bookings b
       LEFT JOIN users u ON u.id = b.member_id
      WHERE b.org_id = ? AND b.status = 'confirmed' AND b.start_at >= ?
      ORDER BY b.start_at ASC LIMIT ?`,
    [orgId, new Date().toISOString(), limit],
  );
}

export function propertyOptions(orgId: string) {
  return all<{ id: string; name: string }>(
    `SELECT id, name FROM properties WHERE org_id = ? AND status != 'archived' ORDER BY name`,
    [orgId],
  );
}

export function unitOptions(orgId: string) {
  return all<{ id: string; name: string; property_id: string; rent_amount: number; status: string }>(
    `SELECT id, name, property_id, rent_amount, status FROM units WHERE org_id = ? ORDER BY name`,
    [orgId],
  );
}

export function staffOptions(orgId: string) {
  return all<{ id: string; name: string; role: string }>(
    `SELECT u.id, u.name, m.role FROM org_members m JOIN users u ON u.id = m.user_id
      WHERE m.org_id = ? AND m.status = 'active' ORDER BY u.name`,
    [orgId],
  );
}

export function memberOptions(orgId: string) {
  return all<{ id: string; name: string; email: string; role: string }>(
    `SELECT u.id, u.name, u.email, m.role FROM org_members m JOIN users u ON u.id = m.user_id
      WHERE m.org_id = ? AND m.status = 'active' ORDER BY u.name`,
    [orgId],
  );
}

export function unreadNotifications(userId: string, orgId: string) {
  return all(
    `SELECT * FROM notifications WHERE user_id = ? AND org_id = ? AND read_at IS NULL ORDER BY created_at DESC LIMIT 20`,
    [userId, orgId],
  );
}
