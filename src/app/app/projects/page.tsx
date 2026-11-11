import { requireWorkspace, allowed } from '@/lib/auth';
import { all } from '@/lib/db';
import {
  createProjectAction,
  createProjectUnitAction,
  recordMilestoneAction,
  sellProjectUnitAction,
  updateProjectAction,
} from '@/lib/actions/projects';
import { money, fmtDate, titleCase, todayISO } from '@/lib/format';
import { ActionForm, GhostSubmit } from '@/components/form';
import { Card, PageHeader, Stat, Field, StatusBadge, EmptyState, Badge, Progress } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function ProjectsPage() {
  const session = await requireWorkspace();
  const orgId = session.orgId!;
  const cur = session.currency;
  const loc = session.locale;

  if (!allowed(session, 'projects.view')) {
    return (
      <div className="space-y-6">
        <PageHeader title="Development" subtitle="Projects, inventory and buyer milestones." />
        <EmptyState title="No access" body="Your role does not include development visibility." />
      </div>
    );
  }

  const canWrite = allowed(session, 'projects.write');
  const projects = all<Record<string, any>>(
    `SELECT pr.*,
            (SELECT COUNT(*) FROM project_units pu WHERE pu.project_id = pr.id) AS units_total,
            (SELECT COUNT(*) FROM project_units pu WHERE pu.project_id = pr.id AND pu.status = 'available') AS units_available,
            (SELECT COUNT(*) FROM project_units pu WHERE pu.project_id = pr.id AND pu.status = 'sold') AS units_sold,
            (SELECT COALESCE(SUM(pu.price),0) FROM project_units pu WHERE pu.project_id = pr.id AND pu.status = 'sold') AS sold_value
       FROM projects pr WHERE pr.org_id = ? ORDER BY pr.created_at DESC`,
    [orgId],
  );
  const units = all<Record<string, any>>(
    `SELECT pu.*, pr.name AS project_name FROM project_units pu JOIN projects pr ON pr.id = pu.project_id
      WHERE pu.org_id = ? ORDER BY pr.name, pu.name LIMIT 100`,
    [orgId],
  );
  const buyers = all<Record<string, any>>(
    `SELECT b.*, pr.name AS project_name, pu.name AS unit_name FROM buyers b
       LEFT JOIN projects pr ON pr.id = b.project_id LEFT JOIN project_units pu ON pu.id = b.unit_id
      WHERE b.org_id = ? ORDER BY b.created_at DESC LIMIT 40`,
    [orgId],
  );

  const totalUnits = units.length;
  const available = units.filter((u) => u.status === 'available').length;
  const soldValue = units.filter((u) => u.status === 'sold').reduce((s, u) => s + Number(u.price ?? 0), 0);
  const pipelineValue = units.filter((u) => u.status === 'reserved').reduce((s, u) => s + Number(u.price ?? 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader title="Development" eyebrow="Projects" subtitle="Track phases, unit inventory, sales and construction progress.">
        <Badge tone="neutral">{projects.length} projects</Badge>
      </PageHeader>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Units in inventory" value={String(totalUnits)} />
        <Stat label="Available units" value={String(available)} tone={available ? 'brand' : 'neutral'} />
        <Stat label="Sold value" value={money(soldValue, cur, loc)} tone="ok" />
        <Stat label="Reserved value" value={money(pipelineValue, cur, loc)} tone="warn" />
      </div>

      {canWrite && (
        <Card title="New project" subtitle="Projects group buildings, units and buyer records.">
          <ActionForm action={createProjectAction} submit="Create project">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Project name" name="name" required placeholder="Riverside Residences" />
              <Field label="Location" name="location" placeholder="Lisbon, Portugal" />
              <Field label="Status" name="status" options={[
                { value: 'planning', label: 'Planning' },
                { value: 'construction', label: 'Construction' },
                { value: 'sales', label: 'Sales' },
                { value: 'completed', label: 'Completed' },
              ]} />
              <Field label="Start date" name="start_date" type="date" />
              <Field label="Target completion" name="target_date" type="date" />
              <Field label="Budget (cents)" name="budget" type="number" min={0} />
              <Field label="Description" name="description" rows={2} className="sm:col-span-2 lg:col-span-3" />
            </div>
          </ActionForm>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {projects.map((p) => (
          <Card
            key={p.id}
            title={p.name}
            subtitle={`${p.location ?? 'Location TBC'} · target ${p.target_date ? fmtDate(p.target_date, loc, session.timezone) : 'TBC'}`}
            action={<StatusBadge status={p.status} />}
          >
            <div className="space-y-3">
              <div>
                <div className="mb-1 flex items-center justify-between text-[12px] muted">
                  <span>Construction progress</span>
                  <span className="tabular-nums">{Number(p.progress ?? 0)}%</span>
                </div>
                <Progress value={Number(p.progress ?? 0)} />
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg border border-[var(--line)] py-2">
                  <p className="text-[11px] muted">Units</p>
                  <p className="text-[14px] font-semibold">{p.units_total}</p>
                </div>
                <div className="rounded-lg border border-[var(--line)] py-2">
                  <p className="text-[11px] muted">Available</p>
                  <p className="text-[14px] font-semibold">{p.units_available}</p>
                </div>
                <div className="rounded-lg border border-[var(--line)] py-2">
                  <p className="text-[11px] muted">Sold</p>
                  <p className="text-[14px] font-semibold">{p.units_sold}</p>
                </div>
              </div>
              <p className="text-[12px] muted">Sold value {money(p.sold_value, cur, loc)}</p>
              {canWrite && (
                <ActionForm action={updateProjectAction} submit="Update project" className="flex flex-wrap items-end gap-2" compact>
                  <input type="hidden" name="id" value={p.id} />
                  <input name="progress" type="number" min={0} max={100} defaultValue={Number(p.progress ?? 0)} className="input h-8 w-20 text-[12px]" />
                  <select name="status" defaultValue={p.status} className="select h-8 w-auto text-[12px]">
                    {['planning', 'construction', 'sales', 'completed'].map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
                  </select>
                  <input name="target_date" type="date" defaultValue={p.target_date ?? ''} className="input h-8 w-auto text-[12px]" />
                </ActionForm>
              )}
            </div>
          </Card>
        ))}
      </div>

      {projects.length === 0 && (
        <Card>
          <EmptyState title="No development projects" body="Create a project to track units, buyers and construction milestones." />
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {canWrite && projects.length > 0 && (
          <Card title="Add unit to inventory" subtitle="Units become sellable immediately">
            <ActionForm action={createProjectUnitAction} submit="Add unit">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Project" name="project_id" options={projects.map((p) => ({ value: p.id, label: p.name }))} required />
                <Field label="Unit name" name="name" required placeholder="Block A · 12B" />
                <Field label="Type" name="kind" options={[
                  { value: 'apartment', label: 'Apartment' },
                  { value: 'office', label: 'Office' },
                  { value: 'villa', label: 'Villa' },
                  { value: 'retail', label: 'Retail' },
                ]} />
                <Field label="Area (m²)" name="area_sqm" type="number" min={0} />
                <Field label="Price (cents)" name="price" type="number" min={0} required />
              </div>
            </ActionForm>
          </Card>
        )}

        {canWrite && (
          <Card title="Record a sale" subtitle="Creates the buyer record and reserves the unit">
            <ActionForm action={sellProjectUnitAction} submit="Record sale">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Unit" name="unit_id" options={[{ value: '', label: '— select available unit —' }, ...units.filter((u) => u.status === 'available').map((u) => ({ value: u.id, label: `${u.project_name} · ${u.name} · ${money(u.price, cur, loc)}` }))]} required />
                <Field label="Buyer name" name="buyer_name" required />
                <Field label="Buyer email" name="buyer_email" type="email" />
                <Field label="Buyer phone" name="buyer_phone" />
              </div>
            </ActionForm>
          </Card>
        )}
      </div>

      <Card title="Unit inventory" subtitle={`${units.length} units`} pad={false}>
        {units.length === 0 ? (
          <div className="px-5 pb-5"><EmptyState title="No units yet" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Unit</th><th>Project</th><th>Type</th><th className="text-right">Area</th><th className="text-right">Price</th><th>Status</th><th /></tr></thead>
              <tbody>
                {units.map((u) => (
                  <tr key={u.id}>
                    <td className="font-medium">{u.name}</td>
                    <td className="muted">{u.project_name}</td>
                    <td>{titleCase(u.kind ?? '')}</td>
                    <td className="text-right tabular-nums">{u.area_sqm ? `${u.area_sqm} m²` : '—'}</td>
                    <td className="text-right tabular-nums">{money(u.price, cur, loc)}</td>
                    <td><StatusBadge status={u.status} /></td>
                    <td className="text-right">
                      {canWrite && u.status !== 'available' && (
                        <ActionForm action={recordMilestoneAction} submit="Milestone" className="flex items-center justify-end gap-2" compact>
                          <input type="hidden" name="unit_id" value={u.id} />
                          <input name="amount" type="number" min={0} placeholder="Amount ¢" className="input h-8 w-24 text-[12px]" />
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

      <Card title="Buyers" subtitle="Reservations and payment milestones" pad={false}>
        {buyers.length === 0 ? (
          <div className="px-5 pb-5"><EmptyState title="No buyers yet" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Buyer</th><th>Project</th><th>Unit</th><th>Status</th><th>Added</th></tr></thead>
              <tbody>
                {buyers.map((b) => (
                  <tr key={b.id}>
                    <td>
                      <div className="font-medium">{b.name}</div>
                      <div className="text-[11.5px] muted">{b.email ?? b.phone ?? '—'}</div>
                    </td>
                    <td className="muted">{b.project_name ?? '—'}</td>
                    <td>{b.unit_name ?? '—'}</td>
                    <td><StatusBadge status={b.booking_status ?? 'reserved'} /></td>
                    <td className="muted">{fmtDate(b.created_at, loc, session.timezone)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
