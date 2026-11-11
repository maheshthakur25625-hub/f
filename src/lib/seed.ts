import type Database from 'better-sqlite3';
import { hashPassword } from './password';

type Val = string | number | null;

const DEMO_PASSWORD = 'SpacePilot123!';

function ensurePlans(db: Database.Database) {
  const plans = [
    ['free', 'Free', 0, 0, 1, 2, 25, ['1 property', '2 team members', 'Coworking bookings', 'Community support'], 0],
    ['starter', 'Starter', 2900, 29000, 3, 5, 100, ['3 properties', '5 team members', 'Bookings & memberships', 'Invoicing'], 1],
    ['growth', 'Growth', 7900, 79000, 10, 15, 500, ['10 properties', '15 team members', 'CRM & automations', 'AI insights', 'Priority support'], 2],
    ['professional', 'Professional', 14900, 149000, 30, 40, 2000, ['30 properties', '40 team members', 'Developer projects', 'Advanced reporting', 'API access'], 3],
    ['enterprise', 'Enterprise', 39900, 399000, 500, 500, 10000, ['Unlimited properties', 'Unlimited team', 'SSO & audit export', 'Dedicated success manager'], 4],
  ] as const;
  const stmt = db.prepare(
    `INSERT INTO plans (code, name, price_monthly, price_yearly, property_limit, seat_limit, ai_credits, features, sort, active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
     ON CONFLICT(code) DO NOTHING`,
  );
  for (const p of plans) stmt.run(p[0], p[1], p[2], p[3], p[4], p[5], p[6], JSON.stringify(p[7]), p[8]);
}

export function seedIfEmpty(db: Database.Database) {
  ensurePlans(db);
  const count = db.prepare('SELECT COUNT(*) AS c FROM organizations').get() as { c: number };
  if (count.c > 0) return;

  const now = new Date();
  const iso = (d: Date) => d.toISOString();
  const day = (offset: number) => {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() + offset);
    return d.toISOString().slice(0, 10);
  };
  const at = (offset: number, hour: number, minute = 0) => {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() + offset);
    d.setUTCHours(hour, minute, 0, 0);
    return d.toISOString();
  };
  const monthStart = (offset: number) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1, 12, 0, 0));
    return d;
  };

  const ins = (table: string, row: Record<string, Val>) => {
    const cols = Object.keys(row);
    db.prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).run(
      ...cols.map((c) => row[c]),
    );
  };

  const pw = hashPassword(DEMO_PASSWORD);
  const orgId = 'org_northwind';

  const seed = db.transaction(() => {
    ins('organizations', {
      id: orgId,
      name: 'Northwind Spaces',
      slug: 'northwind-spaces',
      business_type: 'coworking',
      country: 'US',
      currency: 'USD',
      timezone: 'America/New_York',
      locale: 'en-US',
      website: 'https://northwind.spaces',
      address: '88 Hudson Street, New York, NY 10013',
      modules: JSON.stringify(['properties', 'coworking', 'commercial', 'residential', 'crm', 'development', 'finance', 'maintenance', 'ai']),
      plan: 'growth',
      onboarding_step: 6,
      onboarding_complete: 1,
      created_at: iso(new Date(now.getTime() - 420 * 86400000)),
    });

    const users: [string, string, string, string, number][] = [
      ['u_demo', 'demo@spacepilot.app', 'Avery Sinclair', 'owner', 0],
      ['u_ops', 'ops@spacepilot.app', 'Priya Raman', 'super_admin', 0],
      ['u_cw', 'cw@spacepilot.app', 'Marco Diaz', 'coworking_manager', 0],
      ['u_pm', 'pm@spacepilot.app', 'Lena Fischer', 'property_manager', 0],
      ['u_acc', 'finance@spacepilot.app', 'Tomas Berg', 'accountant', 0],
      ['u_agent', 'agent@spacepilot.app', 'Sofia Marchetti', 'agent', 0],
      ['u_maint', 'maint@spacepilot.app', 'Kofi Mensah', 'maintenance', 0],
      ['u_m1', 'member@spacepilot.app', 'Jordan Lee', 'member', 0],
      ['u_m2', 'hana@spacepilot.app', 'Hana Sato', 'member', 0],
      ['u_m3', 'elena@spacepilot.app', 'Elena Petrova', 'member', 0],
      ['u_m4', 'noah@spacepilot.app', 'Noah Williams', 'member', 0],
      ['u_root', 'root@spacepilot.app', 'Platform Root', '', 1],
    ];
    for (const [uid, email, name, role, isAdmin] of users) {
      ins('users', {
        id: uid,
        email,
        name,
        password_hash: pw,
        email_verified_at: iso(new Date(now.getTime() - 400 * 86400000)),
        is_platform_admin: isAdmin,
        created_at: iso(new Date(now.getTime() - 400 * 86400000)),
      });
      if (role) {
        ins('org_members', {
          id: `om_${uid}`,
          org_id: orgId,
          user_id: uid,
          role,
          status: 'active',
          title: role === 'member' ? 'Member' : 'Team',
          created_at: iso(new Date(now.getTime() - 380 * 86400000)),
        });
      }
    }

    ins('subscriptions', {
      id: 'sub_northwind',
      org_id: orgId,
      plan: 'growth',
      period: 'monthly',
      status: 'active',
      seats: 15,
      ai_credits: 500,
      current_period_end: day(18),
      created_at: iso(new Date(now.getTime() - 380 * 86400000)),
    });

    const properties: [string, string, string, string, string, string, string, string][] = [
      ['p_helix', 'Helix House — Downtown', 'coworking', 'Flagship coworking hub with 3 floors of flex desks, private offices and meeting rooms in SoHo.', '88 Hudson Street', 'New York', 'US', 'u_cw'],
      ['p_marina', 'Marina Business Center', 'commercial', 'Grade A commercial tower with premium office suites overlooking the marina.', 'Marina Plaza, Tower A', 'Dubai', 'AE', 'u_pm'],
      ['p_cedar', 'Cedar Grove Residences', 'residential', 'Boutique residential community of 24 apartments with shared gardens and gym.', '1420 Cedar Grove Lane', 'Austin', 'US', 'u_pm'],
      ['p_atlas', 'Atlas Serviced Offices', 'serviced', 'Serviced office floor with reception, meeting suites and hospitality packages.', 'Friedrichstraße 90', 'Berlin', 'DE', 'u_cw'],
    ];
    for (const [pid, name, type, description, address, city, country, manager] of properties) {
      ins('properties', {
        id: pid,
        org_id: orgId,
        name,
        type,
        description,
        address,
        city,
        country,
        manager_id: manager,
        status: 'active',
        created_at: iso(new Date(now.getTime() - 300 * 86400000)),
      });
    }

    const buildings: [string, string, string, number][] = [
      ['b_helix', 'p_helix', 'Helix House', 3],
      ['b_marina', 'p_marina', 'Marina Tower A', 18],
      ['b_cedar', 'p_cedar', 'Cedar Block C', 4],
      ['b_atlas', 'p_atlas', 'Atlas Haus', 6],
    ];
    for (const [bid, pid, name, floors] of buildings) {
      ins('buildings', { id: bid, org_id: orgId, property_id: pid, name, floors_count: floors, created_at: iso(now) });
    }

    const floors: [string, string, string, number][] = [
      ['f_h1', 'b_helix', 'Level 1 — Community', 1],
      ['f_h2', 'b_helix', 'Level 2 — Studios', 2],
      ['f_m12', 'b_marina', 'Level 12', 12],
      ['f_m14', 'b_marina', 'Level 14', 14],
      ['f_c1', 'b_cedar', 'Ground floor', 0],
    ];
    for (const [fid, bid, name, level] of floors) {
      ins('floors', { id: fid, org_id: orgId, building_id: bid, name, level, created_at: iso(now) });
    }

    const units: [string, string, string, string | null, string, string, number, number, number, string][] = [
      ['un_mar_1201', 'p_marina', 'b_marina', 'f_m12', 'Suite 1201', 'office', 120, 0, 850000, 'occupied'],
      ['un_mar_1202', 'p_marina', 'b_marina', 'f_m12', 'Suite 1202', 'office', 95, 0, 680000, 'available'],
      ['un_mar_1401', 'p_marina', 'b_marina', 'f_m14', 'Suite 1401', 'office', 150, 0, 1100000, 'occupied'],
      ['un_mar_1402', 'p_marina', 'b_marina', 'f_m14', 'Suite 1402', 'office', 88, 0, 620000, 'available'],
      ['un_ced_a101', 'p_cedar', 'b_cedar', 'f_c1', 'Apartment A-101', 'apartment', 96, 2, 220000, 'occupied'],
      ['un_ced_a102', 'p_cedar', 'b_cedar', 'f_c1', 'Apartment A-102', 'apartment', 62, 1, 175000, 'occupied'],
      ['un_ced_a103', 'p_cedar', 'b_cedar', 'f_c1', 'Apartment A-103', 'apartment', 118, 3, 310000, 'available'],
      ['un_ced_a104', 'p_cedar', 'b_cedar', 'f_c1', 'Apartment A-104', 'apartment', 74, 1, 189000, 'maintenance'],
      ['un_hel_201', 'p_helix', 'b_helix', 'f_h2', 'Private Office 201', 'office', 32, 0, 320000, 'occupied'],
      ['un_hel_202', 'p_helix', 'b_helix', 'f_h2', 'Private Office 202', 'office', 28, 0, 275000, 'available'],
    ];
    for (const [uid, pid, bid, fid, name, kind, area, beds, rent, status] of units) {
      ins('units', {
        id: uid,
        org_id: orgId,
        property_id: pid,
        building_id: bid,
        floor_id: fid,
        name,
        kind,
        area_sqm: area,
        bedrooms: beds,
        rent_amount: rent,
        rent_period: 'monthly',
        status,
        created_at: iso(new Date(now.getTime() - 260 * 86400000)),
      });
    }

    for (let i = 1; i <= 8; i += 1) {
      const dedicated = i > 5;
      ins('desks', {
        id: `dsk_${i}`,
        org_id: orgId,
        property_id: 'p_helix',
        unit_id: null,
        name: `Desk H-0${i}`,
        category: dedicated ? 'dedicated' : 'hot',
        hourly_rate: dedicated ? 1500 : 1200,
        daily_rate: dedicated ? 4500 : 3500,
        monthly_rate: dedicated ? 34900 : 25000,
        status: 'available',
        created_at: iso(new Date(now.getTime() - 260 * 86400000)),
      });
    }

    const rooms: [string, string, number, number, string][] = [
      ['rm_aurora', 'Aurora Boardroom', 12, 9000, 'Video wall, whiteboard, catering'],
      ['rm_nook', 'Nook 1', 4, 3500, 'Display, whiteboard'],
      ['rm_studio', 'Studio 8', 8, 6000, 'Video wall, standing table'],
      ['rm_atlas', 'Atlas Salon', 10, 7500, 'Video conferencing, catering'],
    ];
    for (const [rid, name, cap, rate, amenities] of rooms) {
      ins('rooms', {
        id: rid,
        org_id: orgId,
        property_id: rid === 'rm_atlas' ? 'p_atlas' : 'p_helix',
        name,
        capacity: cap,
        hourly_rate: rate,
        amenities,
        status: 'available',
        created_at: iso(new Date(now.getTime() - 260 * 86400000)),
      });
    }

    const plans: [string, string, number, string, string, number, number][] = [
      ['mp_day', 'Day Pass', 2500, 'daily', 'Any hot desk for a single day, including coffee and fibre wifi.', 0, 1],
      ['mp_flex', 'Flex Desk', 19900, 'monthly', 'Unlimited hot desk access during business hours.', 4, 4],
      ['mp_ded', 'Dedicated Desk', 34900, 'monthly', 'Your own desk, 24/7 access and two meeting-room hours.', 2, 4],
      ['mp_office', 'Private Office', 89900, 'monthly', 'Lockable private office for up to four people.', 10, 20],
    ];
    for (const [mid, name, price, period, description, roomHours, dayPasses] of plans) {
      ins('membership_plans', {
        id: mid,
        org_id: orgId,
        name,
        price,
        period,
        description,
        room_hours: roomHours,
        day_passes: dayPasses,
        active: 1,
        created_at: iso(new Date(now.getTime() - 260 * 86400000)),
      });
    }

    const memberships: [string, string, string, string, number, string, number, number, string][] = [
      ['mb_jordan', 'u_m1', 'mp_flex', 'Flex Desk', 19900, 'monthly', -60, 5, 'active'],
      ['mb_hana', 'u_m2', 'mp_ded', 'Dedicated Desk', 34900, 'monthly', -20, 10, 'active'],
      ['mb_elena', 'u_m3', 'mp_office', 'Private Office', 89900, 'monthly', -90, 30, 'active'],
      ['mb_noah', 'u_m4', 'mp_day', 'Day Pass', 2500, 'daily', -3, -2, 'expired'],
    ];
    for (const [mid, uid, planId, planName, price, period, startOff, endOff, status] of memberships) {
      ins('memberships', {
        id: mid,
        org_id: orgId,
        user_id: uid,
        plan_id: planId,
        plan_name: planName,
        price,
        period,
        starts_on: day(startOff),
        ends_on: day(endOff),
        status,
        created_at: iso(new Date(now.getTime() + startOff * 86400000)),
      });
    }

    const bookings: [string, string, string, string, string, string, string, number][] = [
      ['bk_1', 'desk', 'dsk_1', 'Desk H-01', 'u_m1', at(0, 13), at(0, 17), 4800],
      ['bk_2', 'room', 'rm_aurora', 'Aurora Boardroom', 'u_m1', at(0, 18), at(0, 20), 18000],
      ['bk_3', 'desk', 'dsk_2', 'Desk H-02', 'u_m2', at(1, 13), at(1, 21), 4500],
      ['bk_4', 'room', 'rm_nook', 'Nook 1', 'u_m3', at(1, 14), at(1, 16), 7000],
      ['bk_5', 'desk', 'dsk_3', 'Desk H-03', 'u_m3', at(2, 13), at(2, 18), 6000],
      ['bk_6', 'room', 'rm_studio', 'Studio 8', 'u_m2', at(3, 15), at(3, 18), 18000],
      ['bk_7', 'desk', 'dsk_1', 'Desk H-01', 'u_m2', at(-1, 13), at(-1, 21), 3500],
      ['bk_8', 'desk', 'dsk_4', 'Desk H-04', 'u_m1', at(-2, 13), at(-2, 17), 4800],
      ['bk_9', 'room', 'rm_aurora', 'Aurora Boardroom', 'u_m3', at(-4, 16), at(-4, 18), 18000],
      ['bk_10', 'desk', 'dsk_5', 'Desk H-05', 'u_m1', at(-6, 14), at(-6, 19), 6000],
    ];
    for (const [bid, rtype, rid, rname, member, start, end, amount] of bookings) {
      ins('bookings', {
        id: bid,
        org_id: orgId,
        property_id: rid.startsWith('rm_') && rid === 'rm_atlas' ? 'p_atlas' : 'p_helix',
        resource_type: rtype,
        resource_id: rid,
        resource_name: rname,
        member_id: member,
        start_at: start,
        end_at: end,
        status: new Date(start) < now ? 'completed' : 'confirmed',
        total_amount: amount,
        created_by: 'u_cw',
        created_at: iso(new Date(new Date(start).getTime() - 86400000)),
      });
    }

    const tenants: [string, string, string, string, string, string, string][] = [
      ['t_lumen', 'Lumen Analytics', 'ops@lumenanalytics.com', '+1 212 555 0142', 'Lumen Analytics Inc.', 'commercial', 'un_mar_1201'],
      ['t_vertex', 'Vertex Legal', 'office@vertexlegal.ae', '+971 4 555 0198', 'Vertex Legal LLP', 'commercial', 'un_mar_1401'],
      ['t_amara', 'Amara Osei', 'amara.osei@example.com', '+1 512 555 0111', 'Amara Osei', 'residential', 'un_ced_a101'],
      ['t_diego', 'Diego Ramos', 'diego.ramos@example.com', '+1 512 555 0166', 'Diego Ramos', 'residential', 'un_ced_a102'],
    ];
    for (const [tid, name, email, phone, company, kind, unit] of tenants) {
      ins('tenants', {
        id: tid,
        org_id: orgId,
        name,
        email,
        phone,
        company,
        kind,
        unit_id: unit,
        status: 'active',
        created_at: iso(new Date(now.getTime() - 340 * 86400000)),
      });
    }

    const leases: [string, string, string, number, number, number, string][] = [
      ['ls_lumen', 'un_mar_1201', 't_lumen', -400, 330, 850000, 'active'],
      ['ls_vertex', 'un_mar_1401', 't_vertex', -200, 45, 1100000, 'active'],
      ['ls_amara', 'un_ced_a101', 't_amara', -300, 65, 220000, 'active'],
      ['ls_diego', 'un_ced_a102', 't_diego', -150, 215, 175000, 'active'],
    ];
    for (const [lid, unit, tenant, startOff, endOff, rent, status] of leases) {
      ins('leases', {
        id: lid,
        org_id: orgId,
        unit_id: unit,
        tenant_id: tenant,
        start_date: day(startOff),
        end_date: day(endOff),
        rent_amount: rent,
        billing_period: 'monthly',
        deposit: rent * 2,
        status,
        created_at: iso(new Date(now.getTime() + startOff * 86400000)),
      });
    }

    const billing = [
      { id: 't_lumen', name: 'Lumen Analytics', amount: 850000, property: 'p_marina', tax: 0 },
      { id: 't_vertex', name: 'Vertex Legal', amount: 1100000, property: 'p_marina', tax: 5 },
      { id: 't_amara', name: 'Amara Osei', amount: 220000, property: 'p_cedar', tax: 0 },
      { id: 't_diego', name: 'Diego Ramos', amount: 175000, property: 'p_cedar', tax: 0 },
    ];
    let invNo = 1;
    for (let m = 5; m >= 0; m -= 1) {
      const issue = monthStart(m);
      const issueDate = issue.toISOString().slice(0, 10);
      const due = new Date(issue);
      due.setUTCDate(due.getUTCDate() + 7);
      for (const b of billing) {
        const taxAmount = Math.round((b.amount * b.tax) / 100);
        const number = `INV-${issue.getUTCFullYear()}-${String(invNo).padStart(4, '0')}`;
        invNo += 1;
        const overdue = m === 1 && b.id === 't_vertex';
        const status = m === 0 ? 'sent' : overdue ? 'overdue' : 'paid';
        const invId = `inv_${number}`;
        ins('invoices', {
          id: invId,
          org_id: orgId,
          number,
          counterparty_type: 'tenant',
          counterparty_id: b.id,
          counterparty_name: b.name,
          property_id: b.property,
          issue_date: issueDate,
          due_date: due.toISOString().slice(0, 10),
          subtotal: b.amount,
          tax_rate: b.tax,
          tax_amount: taxAmount,
          total: b.amount + taxAmount,
          status,
          created_at: issue.toISOString(),
        });
        if (status === 'paid') {
          const paidAt = new Date(issue);
          paidAt.setUTCDate(paidAt.getUTCDate() + 3);
          ins('payments', {
            id: `pay_${number}`,
            org_id: orgId,
            invoice_id: invId,
            amount: b.amount + taxAmount,
            method: 'bank_transfer',
            status: 'succeeded',
            verified: 1,
            reference: `BT-${number}`,
            paid_at: paidAt.toISOString(),
            created_by: 'u_acc',
            created_at: paidAt.toISOString(),
          });
        }
      }
      for (const [mid, memberName, price] of [
        ['mb_jordan', 'Jordan Lee', 19900],
        ['mb_hana', 'Hana Sato', 34900],
      ] as [string, string, number][]) {
        const number = `INV-${issue.getUTCFullYear()}-${String(invNo).padStart(4, '0')}`;
        invNo += 1;
        const status = m === 0 ? 'sent' : 'paid';
        ins('invoices', {
          id: `inv_${number}`,
          org_id: orgId,
          number,
          counterparty_type: 'member',
          counterparty_id: mid,
          counterparty_name: memberName,
          property_id: 'p_helix',
          issue_date: issueDate,
          due_date: due.toISOString().slice(0, 10),
          subtotal: price,
          tax_rate: 0,
          tax_amount: 0,
          total: price,
          status,
          created_at: issue.toISOString(),
        });
        if (status === 'paid') {
          const paidAt = new Date(issue);
          paidAt.setUTCDate(paidAt.getUTCDate() + 2);
          ins('payments', {
            id: `pay_${number}`,
            org_id: orgId,
            invoice_id: `inv_${number}`,
            amount: price,
            method: 'card',
            status: 'succeeded',
            verified: 1,
            reference: `CARD-${number}`,
            paid_at: paidAt.toISOString(),
            created_by: 'u_acc',
            created_at: paidAt.toISOString(),
          });
        }
      }
    }

    const vendors: [string, string, string, string, string][] = [
      ['v_clean', 'Brightline Cleaning', 'Cleaning', 'hello@brightline.co', '+1 212 555 0177'],
      ['v_hvac', 'Northstar HVAC', 'HVAC', 'service@northstarhvac.com', '+1 512 555 0123'],
      ['v_elec', 'Volt & Co Electrical', 'Electrical', 'jobs@voltco.de', '+49 30 555 0144'],
    ];
    for (const [vid, name, trade, email, phone] of vendors) {
      ins('vendors', { id: vid, org_id: orgId, name, trade, email, phone, created_at: iso(new Date(now.getTime() - 200 * 86400000)) });
    }

    const expenses: [string, string, string, string, number, number][] = [
      ['ex_1', 'p_helix', 'cleaning', 'v_clean', 145000, -5],
      ['ex_2', 'p_marina', 'utilities', null, 380000, -12],
      ['ex_3', 'p_cedar', 'repairs', 'v_hvac', 92000, -18],
      ['ex_4', 'p_helix', 'software', null, 48000, -25],
      ['ex_5', 'p_atlas', 'cleaning', 'v_clean', 87000, -32],
      ['ex_6', 'p_marina', 'maintenance', 'v_elec', 210000, -47],
      ['ex_7', 'p_cedar', 'utilities', null, 132000, -60],
      ['ex_8', 'p_helix', 'marketing', null, 250000, -75],
    ];
    for (const [eid, pid, category, vendor, amount, off] of expenses) {
      ins('expenses', {
        id: eid,
        org_id: orgId,
        property_id: pid,
        category,
        vendor_id: vendor,
        amount,
        spent_on: day(off),
        notes: null,
        created_at: iso(new Date(now.getTime() + off * 86400000)),
      });
    }

    const tickets: [string, string, string, string, string, string, string, string | null, number, number][] = [
      ['mt_1', 'p_helix', 'Aurora Boardroom projector flickering', 'The projector drops signal after 20 minutes. Member reported during a client call.', 'high', 'in_progress', 'u_maint', 'v_elec', 0, -1],
      ['mt_2', 'p_cedar', 'A-104 water pressure low', 'Tenant reports weak hot water pressure in the main bathroom.', 'medium', 'open', null, 'v_hvac', 0, -2],
      ['mt_3', 'p_marina', 'Suite 1201 HVAC thermostat offline', 'Thermostat not responding on the app or panel.', 'high', 'open', 'u_maint', 'v_hvac', 0, -3],
      ['mt_4', 'p_helix', 'Replace lobby door sensor', 'Automatic door sensor replaced and calibrated.', 'low', 'completed', 'u_maint', 'v_elec', 32000, -9],
      ['mt_5', 'p_cedar', 'Garden lighting repair', 'Three path lights replaced.', 'low', 'completed', 'u_maint', 'v_elec', 18000, -16],
    ];
    for (const [tid, pid, title, description, priority, status, assignee, vendor, cost, off] of tickets) {
      ins('maintenance_tickets', {
        id: tid,
        org_id: orgId,
        property_id: pid,
        unit_id: null,
        title,
        description,
        priority,
        status,
        assignee_id: assignee,
        vendor_id: vendor,
        cost,
        created_by: 'u_demo',
        created_at: iso(new Date(now.getTime() + off * 86400000)),
        completed_at: status === 'completed' ? iso(new Date(now.getTime() + (off + 2) * 86400000)) : null,
      });
    }

    const leads: [string, string, string, string, string, string, string, number, number][] = [
      ['ld_1', 'Marcus Webb', 'marcus.webb@example.com', 'website', 'tenant', 'qualified', 'u_agent', 4800000, 3],
      ['ld_2', 'Ines Duarte', 'ines.duarte@example.com', 'referral', 'buyer', 'viewing', 'u_agent', 9200000, 1],
      ['ld_3', 'Omar Haddad', 'omar.haddad@example.com', 'linkedin', 'buyer', 'negotiation', 'u_demo', 14500000, 5],
      ['ld_4', 'Grace Kim', 'grace.kim@example.com', 'website', 'seller', 'contacted', 'u_agent', 7300000, 4],
      ['ld_5', 'Tomás Silva', 'tomas.silva@example.com', 'walk_in', 'tenant', 'new', 'u_cw', 2100000, 0],
      ['ld_6', 'Nadia Rahman', 'nadia.rahman@example.com', 'instagram', 'member', 'won', 'u_cw', 89900, -6],
      ['ld_7', 'Peter Novak', 'peter.novak@example.com', 'website', 'buyer', 'lost', 'u_agent', 5600000, -12],
      ['ld_8', 'Aisha Bello', 'aisha.bello@example.com', 'referral', 'member', 'qualified', 'u_cw', 34900, 2],
    ];
    for (const [lid, name, email, source, kind, stage, owner, value, off] of leads) {
      ins('leads', {
        id: lid,
        org_id: orgId,
        name,
        email,
        phone: null,
        source,
        kind,
        owner_id: owner,
        property_id: null,
        notes: null,
        next_follow_up: day(off > 0 ? off : 2),
        created_at: iso(new Date(now.getTime() - Math.abs(off + 10) * 86400000)),
      });
      ins('deals', {
        id: `dl_${lid}`,
        org_id: orgId,
        lead_id: lid,
        title: `${name} — ${kind} opportunity`,
        stage,
        value,
        property_id: null,
        owner_id: owner,
        expected_close: day(off + 20),
        created_at: iso(new Date(now.getTime() - Math.abs(off + 10) * 86400000)),
      });
    }

    const projects: [string, string, string, string, number, number, number, number][] = [
      ['pr_aurora', 'Aurora Tower', 'London, UK', 'Mixed-use 24-storey tower with 96 residences and ground-floor retail.', 62, 4200000000, -300, 400],
      ['pr_riverside', 'Riverside Lofts', 'Austin, US', 'Adaptive reuse of a riverside warehouse into 48 loft apartments.', 18, 1450000000, -60, 520],
    ];
    for (const [pid, name, location, description, progress, budget, startOff, endOff] of projects) {
      ins('projects', {
        id: pid,
        org_id: orgId,
        name,
        location,
        description,
        status: progress > 50 ? 'under_construction' : 'planning',
        start_date: day(startOff),
        target_date: day(endOff),
        budget,
        progress,
        created_at: iso(new Date(now.getTime() + startOff * 86400000)),
      });
    }

    const unitRows: [string, string, string, number, number, string][] = [
      ['pu_1', 'pr_aurora', 'A-201', 78, 62000000, 'sold'],
      ['pu_2', 'pr_aurora', 'A-202', 92, 74500000, 'reserved'],
      ['pu_3', 'pr_aurora', 'A-301', 78, 63500000, 'available'],
      ['pu_4', 'pr_aurora', 'A-302', 110, 88000000, 'available'],
      ['pu_5', 'pr_aurora', 'A-401', 64, 52000000, 'sold'],
      ['pu_6', 'pr_aurora', 'A-402', 64, 53000000, 'available'],
      ['pu_7', 'pr_aurora', 'A-501', 140, 118000000, 'reserved'],
      ['pu_8', 'pr_aurora', 'A-502', 140, 119000000, 'available'],
      ['pu_9', 'pr_riverside', 'R-101', 88, 41000000, 'available'],
      ['pu_10', 'pr_riverside', 'R-102', 88, 42000000, 'reserved'],
      ['pu_11', 'pr_riverside', 'R-201', 105, 51000000, 'available'],
      ['pu_12', 'pr_riverside', 'R-202', 105, 52000000, 'sold'],
    ];
    for (const [pid, project, name, area, price, status] of unitRows) {
      ins('project_units', {
        id: pid,
        org_id: orgId,
        project_id: project,
        name,
        kind: 'apartment',
        area_sqm: area,
        price,
        status,
        buyer_id: null,
        milestone_paid: status === 'sold' ? price : status === 'reserved' ? Math.round(price * 0.1) : 0,
        created_at: iso(new Date(now.getTime() - 120 * 86400000)),
      });
    }

    const buyers: [string, string, string, string, string, string, string][] = [
      ['by_1', 'pr_aurora', 'Helena Marsh', 'helena.marsh@example.com', '+44 20 5550 121', 'pu_1', 'contracted'],
      ['by_2', 'pr_aurora', 'Rafael Costa', 'rafael.costa@example.com', '+44 20 5550 144', 'pu_2', 'reserved'],
      ['by_3', 'pr_riverside', 'Dana Whitfield', 'dana.whitfield@example.com', '+1 512 555 0199', 'pu_12', 'contracted'],
    ];
    for (const [bid, project, name, email, phone, unit, status] of buyers) {
      ins('buyers', { id: bid, org_id: orgId, project_id: project, name, email, phone, unit_id: unit, booking_status: status, created_at: iso(new Date(now.getTime() - 90 * 86400000)) });
    }

    const notes: [string, string, string, string, string][] = [
      ['act_1', 'lead', 'ld_3', 'call', 'Discussed financing options for Aurora Tower A-501. Sending payment plan.'],
      ['act_2', 'lead', 'ld_1', 'email', 'Shared Suite 1202 availability and floor plan.'],
      ['act_3', 'ticket', 'mt_3', 'note', 'Vendor scheduled for Thursday morning access.'],
    ];
    for (const [aid, etype, eid, kind, body] of notes) {
      ins('activities', { id: aid, org_id: orgId, entity_type: etype, entity_id: eid, kind, body, user_id: 'u_demo', created_at: iso(new Date(now.getTime() - 2 * 86400000)) });
    }

    const notifs: [string, string, string, string, string][] = [
      ['nt_1', 'Overdue invoice INV-' + String(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).getUTCFullYear()) + '-0002', 'Vertex Legal has an overdue balance of $11,550.', 'warning', '/app/finance'],
      ['nt_2', 'Membership expiring', 'Jordan Lee — Flex Desk expires in 5 days.', 'info', '/app/members'],
      ['nt_3', 'New lead assigned', 'Aisha Bello was assigned to you from a referral.', 'info', '/app/crm'],
      ['nt_4', 'Maintenance escalated', 'Suite 1201 HVAC thermostat offline marked high priority.', 'danger', '/app/maintenance'],
    ];
    for (const [nid, title, body, kind, link] of notifs) {
      ins('notifications', { id: nid, org_id: orgId, user_id: 'u_demo', title, body, kind, link, read_at: null, created_at: iso(new Date(now.getTime() - 3 * 3600000)) });
    }

    const automations: [string, string, string, string, number, string][] = [
      ['au_rent', 'rent_due', 'Rent due reminder', 'in_app', 3, 'Rent of {{amount}} is due on {{date}}.'],
      ['au_member', 'membership_expiry', 'Membership expiry reminder', 'in_app', 7, 'Your {{plan}} membership expires on {{date}}.'],
      ['au_lease', 'lease_renewal', 'Lease renewal reminder', 'in_app', 60, 'Lease for {{tenant}} ends on {{date}}.'],
      ['au_booking', 'booking_confirmation', 'Booking confirmation', 'in_app', 0, 'Your booking for {{resource}} is confirmed.'],
      ['au_maint', 'maintenance_update', 'Maintenance notification', 'in_app', 0, 'Ticket {{title}} is now {{status}}.'],
      ['au_lead', 'new_lead', 'New lead notification', 'in_app', 0, 'New lead {{name}} assigned to you.'],
    ];
    for (const [aid, kind, name, channel, offset, template] of automations) {
      ins('automations', { id: aid, org_id: orgId, kind, name, channel, offset_days: offset, enabled: 1, template, last_run_at: null, created_at: iso(new Date(now.getTime() - 200 * 86400000)) });
    }

    ins('support_requests', {
      id: 'sr_1',
      org_id: orgId,
      user_id: 'u_demo',
      subject: 'Bulk import of residents',
      body: 'We would like to import 200 residents from a spreadsheet during onboarding.',
      status: 'open',
      created_at: iso(new Date(now.getTime() - 4 * 86400000)),
    });

    const auditRows: [string, string, string, string, string][] = [
      ['al_1', 'invoice.paid', 'invoice', 'inv_paid', 'Payment verified via bank transfer'],
      ['al_2', 'booking.created', 'booking', 'bk_3', 'Booking confirmed for Desk H-02'],
      ['al_3', 'member.invited', 'user', 'u_m3', 'Invitation sent to elena@spacepilot.app'],
      ['al_4', 'property.updated', 'property', 'p_marina', 'Suite 1402 listed as available'],
    ];
    for (const [aid, action, etype, eid, meta] of auditRows) {
      ins('audit_logs', {
        id: aid,
        org_id: orgId,
        user_id: 'u_demo',
        actor: 'Avery Sinclair',
        action,
        entity_type: etype,
        entity_id: eid,
        meta: JSON.stringify({ note: meta }),
        created_at: iso(new Date(now.getTime() - 5 * 3600000)),
      });
    }

    ins('platform_settings', { key: 'platform_name', value: 'SpacePilot' });
    ins('platform_settings', { key: 'support_email', value: 'support@spacepilot.app' });
    ins('platform_settings', { key: 'default_currency', value: 'USD' });
  });

  seed();
  db.prepare('SELECT 1').get();
}

export { DEMO_PASSWORD };
