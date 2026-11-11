import Link from 'next/link';
import { requireWorkspace, allowed } from '@/lib/auth';
import { all } from '@/lib/db';
import { createPropertyAction } from '@/lib/actions/properties';
import { money, percent, titleCase, BUSINESS_TYPES } from '@/lib/format';
import { ActionForm } from '@/components/form';
import { Card, PageHeader, EmptyState, StatusBadge, Field, Progress, Badge } from '@/components/ui';

export const dynamic = 'force-dynamic';

type Row = {
  id: string;
  name: string;
  type: string;
  city: string | null;
  country: string | null;
  status: string;
  image_id: string | null;
  units: number;
  occupied: number;
  revenue: number;
  manager: string | null;
};

export default async function PropertiesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const session = await requireWorkspace();
  const orgId = session.orgId!;
  const { status = 'active' } = await searchParams;
  const canWrite = allowed(session, 'properties.write');

  const rows = all<Row>(
    `SELECT p.id, p.name, p.type, p.city, p.country, p.status, p.image_id,
            (SELECT COUNT(*) FROM units u WHERE u.property_id = p.id) AS units,
            (SELECT COUNT(*) FROM units u WHERE u.property_id = p.id AND u.status = 'occupied') AS occupied,
            COALESCE((SELECT SUM(pay.amount) FROM payments pay JOIN invoices i ON i.id = pay.invoice_id
                       WHERE i.property_id = p.id AND pay.org_id = p.org_id
                         AND pay.status IN ('succeeded','paid') AND pay.verified = 1), 0) AS revenue,
            (SELECT u2.name FROM users u2 WHERE u2.id = p.manager_id) AS manager
       FROM properties p
      WHERE p.org_id = ? AND p.status = ?
      ORDER BY p.created_at DESC`,
    [orgId, status],
  );

  const managers = all<{ id: string; name: string }>(
    `SELECT u.id, u.name FROM org_members m JOIN users u ON u.id = m.user_id
      WHERE m.org_id = ? AND m.status = 'active' ORDER BY u.name`,
    [orgId],
  );

  const counts = all<{ status: string; c: number }>(
    `SELECT status, COUNT(*) AS c FROM properties WHERE org_id = ? GROUP BY status`,
    [orgId],
  );
  const total = counts.reduce((s, c) => s + Number(c.c), 0);

  return (
    <div className="mx-auto max-w-[1320px]">
      <PageHeader
        eyebrow="Portfolio"
        title="Properties"
        subtitle="Every building, floor, unit and bookable space your organisation operates."
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {[
          { key: 'active', label: 'Active' },
          { key: 'archived', label: 'Archived' },
        ].map((t) => (
          <Link
            key={t.key}
            href={`/app/properties?status=${t.key}`}
            className={`btn btn-sm ${status === t.key ? 'btn-primary' : ''}`}
          >
            {t.label}
            <span className="ml-1.5 text-[11px] opacity-70">
              {counts.find((c) => c.status === t.key)?.c ?? 0}
            </span>
          </Link>
        ))}
        <span className="ml-auto text-[12px] muted">{total} properties total</span>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_340px]">
        <div className="space-y-3">
          {rows.length ? (
            rows.map((p) => {
              const occupancy = p.units ? (Number(p.occupied) / Number(p.units)) * 100 : 0;
              return (
                <Link
                  key={p.id}
                  href={`/app/properties/${p.id}`}
                  className="card flex flex-col gap-4 p-3 transition hover:-translate-y-0.5 hover:shadow-md sm:flex-row sm:items-center"
                >
                  <div className="h-24 w-full overflow-hidden rounded-lg bg-[var(--surface-2)] sm:h-20 sm:w-28 sm:flex-none">
                    {p.image_id ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/api/files/${p.image_id}`} alt={p.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-brand/25 to-brand/5 text-[11px] font-semibold uppercase tracking-wider muted">
                        {titleCase(p.type).slice(0, 12)}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-[14px] font-semibold">{p.name}</p>
                      <StatusBadge status={p.status} />
                      <Badge>{titleCase(p.type)}</Badge>
                    </div>
                    <p className="mt-0.5 truncate text-[12px] muted">
                      {[p.city, p.country].filter(Boolean).join(', ') || 'No address recorded'}
                      {p.manager ? ` · Manager ${p.manager}` : ''}
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <Progress value={occupancy} />
                      <span className="flex-none text-[11px] font-medium muted">
                        {Number(p.occupied)}/{Number(p.units)} occupied
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-none items-center gap-5 sm:flex-col sm:items-end sm:gap-1">
                    <div>
                      <p className="text-[10.5px] uppercase tracking-wide muted">Revenue</p>
                      <p className="text-[13px] font-semibold">{money(Number(p.revenue), session.currency, session.locale)}</p>
                    </div>
                    <div>
                      <p className="text-[10.5px] uppercase tracking-wide muted">Occupancy</p>
                      <p className="text-[13px] font-semibold">{percent(occupancy)}</p>
                    </div>
                  </div>
                </Link>
              );
            })
          ) : (
            <Card>
              <EmptyState
                title={status === 'archived' ? 'No archived properties' : 'No properties yet'}
                body={
                  status === 'archived'
                    ? 'Archived properties are kept for historical reporting.'
                    : 'Add your first building to start tracking units, desks and revenue.'
                }
              />
            </Card>
          )}
        </div>

        {canWrite && (
          <Card title="Add a property" subtitle="Portfolio records drive every module." className="h-fit xl:sticky xl:top-6">
            <ActionForm action={createPropertyAction} submit="Create property">
              <Field label="Property name" name="name" placeholder="Riverside Innovation Hub" required />
              <Field
                label="Type"
                name="type"
                options={[
                  { value: 'coworking', label: 'Coworking space' },
                  { value: 'commercial', label: 'Commercial offices' },
                  { value: 'residential', label: 'Residential' },
                  { value: 'serviced_office', label: 'Serviced offices' },
                  { value: 'mixed', label: 'Mixed use' },
                ]}
              />
              <Field label="City" name="city" placeholder="Amsterdam" />
              <Field label="Country" name="country" defaultValue={session.country} />
              <Field label="Address" name="address" placeholder="Keizersgracht 120" />
              <Field
                label="Property manager"
                name="manager_id"
                defaultValue={session.userId}
                options={managers.map((m) => ({ value: m.id, label: m.name }))}
              />
              <Field label="Description" name="description" rows={3} placeholder="Grade A workspace with 40 desks and 4 meeting rooms." />
            </ActionForm>
            <p className="mt-3 text-[11.5px] muted">
              Types available for your business: {BUSINESS_TYPES.map((b) => b.label).slice(0, 3).join(', ')} and more.
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
