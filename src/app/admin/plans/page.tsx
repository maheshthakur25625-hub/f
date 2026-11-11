import { allPlans, adminUpdatePlanAction } from '@/lib/actions/settings';
import { money, titleCase } from '@/lib/format';
import { ActionForm } from '@/components/form';
import { Card, PageHeader, Field, Badge } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function AdminPlansPage() {
  const plans = await allPlans();

  return (
    <div className="space-y-6">
      <PageHeader title="Plans & pricing" eyebrow="Commercial" subtitle="Prices, limits and features are configuration — changes apply to every organization immediately." />

      <div className="grid gap-4 lg:grid-cols-2">
        {plans.map((p) => {
          const features = (() => {
            try {
              const parsed = JSON.parse(String(p.features ?? '[]'));
              return Array.isArray(parsed) ? parsed.join(', ') : String(p.features ?? '');
            } catch {
              return String(p.features ?? '');
            }
          })();
          return (
            <Card
              key={p.code}
              title={p.name}
              subtitle={`${p.code} · ${money(p.price_monthly, 'USD', 'en-US')} / mo · ${money(p.price_yearly, 'USD', 'en-US')} / yr`}
              action={<Badge tone={p.active ? 'ok' : 'neutral'}>{p.active ? 'active' : 'hidden'}</Badge>}
            >
              <ActionForm action={adminUpdatePlanAction} submit="Save plan">
                <input type="hidden" name="code" value={p.code} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Display name" name="name" defaultValue={p.name} />
                  <Field label="Monthly price" name="price_monthly" type="number" step="0.01" min={0} defaultValue={(p.price_monthly / 100).toFixed(2)} />
                  <Field label="Yearly price" name="price_yearly" type="number" step="0.01" min={0} defaultValue={(p.price_yearly / 100).toFixed(2)} />
                  <Field label="Property limit" name="property_limit" type="number" min={1} defaultValue={String(p.property_limit)} />
                  <Field label="Seat limit" name="seat_limit" type="number" min={1} defaultValue={String(p.seat_limit)} />
                  <Field label="AI credits / month" name="ai_credits" type="number" min={0} defaultValue={String(p.ai_credits)} />
                  <Field label="Features (comma separated)" name="features" defaultValue={features} className="sm:col-span-2" />
                  <label className="flex items-center gap-2 text-[12.5px] sm:col-span-2">
                    <input type="checkbox" name="active" defaultChecked={Boolean(p.active)} className="h-4 w-4 accent-[var(--brand)]" />
                    Available for new subscriptions
                  </label>
                </div>
              </ActionForm>
            </Card>
          );
        })}
      </div>

      <Card title="Add-ons" subtitle="Packages sold on top of a base plan">
        <ul className="grid gap-2 text-[12.5px] muted sm:grid-cols-3">
          <li className="rounded-lg border border-[var(--line)] p-3">Extra properties — {money(1900, 'USD', 'en-US')} / 10 properties</li>
          <li className="rounded-lg border border-[var(--line)] p-3">Extra seats — {money(900, 'USD', 'en-US')} / 5 seats</li>
          <li className="rounded-lg border border-[var(--line)] p-3">AI credits — {money(2900, 'USD', 'en-US')} / 5,000 credits</li>
        </ul>
      </Card>
    </div>
  );
}
