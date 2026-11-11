import { requireWorkspace, allowed } from '@/lib/auth';
import { allPlans, cancelSubscriptionAction, listOrgUsage, updateSubscriptionAction } from '@/lib/actions/settings';
import { money, fmtDate, titleCase } from '@/lib/format';
import { ActionForm } from '@/components/form';
import { Card, PageHeader, Stat, Field, Badge, Progress, EmptyState } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function BillingPage() {
  const session = await requireWorkspace();

  if (!allowed(session, 'billing.write')) {
    return (
      <div className="space-y-6">
        <PageHeader title="Billing" subtitle="Subscription and usage." />
        <EmptyState title="No access" body="Only the organization owner can manage billing." />
      </div>
    );
  }

  const plans = await allPlans();
  const usage = await listOrgUsage(session.orgId!);
  const subscription = usage.subscription;

  return (
    <div className="space-y-6">
      <PageHeader title="Billing & plans" eyebrow="Subscription" subtitle="Change plan, switch billing period and track usage limits.">
        <Badge tone="brand">{subscription?.plan ?? session.plan ?? 'free'}</Badge>
        {subscription?.status && <Badge tone={subscription.status === 'active' ? 'ok' : 'warn'}>{subscription.status}</Badge>}
      </PageHeader>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Properties used" value={`${usage.properties}${usage.propertyLimit ? ` / ${usage.propertyLimit}` : ''}`} />
        <Stat label="Seats used" value={`${usage.seats}${usage.seatLimit ? ` / ${usage.seatLimit}` : ''}`} />
        <Stat label="AI credits" value={`${usage.aiCreditsUsed ?? 0} / ${usage.aiCredits ?? 0}`} />
        <Stat
          label="Renews"
          value={subscription?.current_period_end ? fmtDate(subscription.current_period_end, session.locale, session.timezone) : '—'}
          hint={subscription?.period ? `Billed ${subscription.period}` : undefined}
        />
      </div>

      {usage.propertyLimit ? (
        <Card title="Usage against plan limits" subtitle="Upgrade before you hit a limit to keep adding properties and seats.">
          <div className="space-y-4">
            <div>
              <div className="mb-1 flex justify-between text-[12px] muted"><span>Properties</span><span>{usage.properties} / {usage.propertyLimit}</span></div>
              <Progress value={(usage.properties / usage.propertyLimit) * 100} />
            </div>
            <div>
              <div className="mb-1 flex justify-between text-[12px] muted"><span>Team seats</span><span>{usage.seats} / {usage.seatLimit}</span></div>
              <Progress value={(usage.seats / Math.max(1, usage.seatLimit)) * 100} />
            </div>
          </div>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {plans.map((p) => {
          const current = (subscription?.plan ?? session.plan) === p.code;
          const features = String(p.features ?? '')
            .split(',')
            .map((f) => f.trim())
            .filter(Boolean);
          return (
            <Card
              key={p.code}
              title={p.name}
              subtitle={`${money(p.price_monthly, session.currency, session.locale)} / month · ${money(p.price_yearly, session.currency, session.locale)} / year`}
              action={current ? <Badge tone="ok">Current</Badge> : undefined}
            >
              <ul className="mb-4 space-y-1.5 text-[12.5px] muted">
                <li>{p.property_limit ? `${p.property_limit} properties` : 'Unlimited properties'}</li>
                <li>{p.seat_limit ? `${p.seat_limit} team seats` : 'Unlimited seats'}</li>
                <li>{p.ai_credits ? `${p.ai_credits} AI credits / month` : 'AI credits on request'}</li>
                {features.map((f) => <li key={f}>{titleCase(f)}</li>)}
              </ul>
              <ActionForm action={updateSubscriptionAction} submit={current ? 'Update period' : `Switch to ${p.name}`} compact>
                <input type="hidden" name="plan" value={p.code} />
                <div className="grid grid-cols-2 gap-2">
                  <select name="period" defaultValue={subscription?.period ?? 'monthly'} className="select h-8 text-[12px]">
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                  <input name="seats" type="number" min={1} defaultValue={usage.seats || 1} className="input h-8 text-[12px]" />
                </div>
              </ActionForm>
            </Card>
          );
        })}
      </div>

      <Card title="Add-ons" subtitle="Additional capacity beyond your plan limits">
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { title: 'Extra property pack', body: 'Add 10 properties to your limit.', plan: 'growth' },
            { title: 'Extra team seats', body: 'Add 5 seats for operations staff.', plan: 'growth' },
            { title: 'AI credit pack', body: '5,000 additional assistant credits.', plan: 'professional' },
          ].map((a) => (
            <div key={a.title} className="rounded-xl border border-[var(--line)] p-4">
              <p className="text-[13px] font-semibold">{a.title}</p>
              <p className="mt-1 text-[12px] muted">{a.body}</p>
              <div className="mt-3">
                <ActionForm action={updateSubscriptionAction} submit="Request add-on" compact>
                  <input type="hidden" name="plan" value={subscription?.plan ?? a.plan} />
                  <input type="hidden" name="period" value={subscription?.period ?? 'monthly'} />
                  <input type="hidden" name="seats" value={usage.seats + 5} />
                </ActionForm>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Cancel subscription" subtitle="Your workspace stays readable but modules become read-only at the end of the period.">
        <ActionForm action={cancelSubscriptionAction} submit="Cancel subscription" footer={<span className="text-[11.5px] muted">You can reactivate at any time.</span>}>
          <p className="text-[12.5px] muted">Cancelling keeps your data. Billing stops at the end of the current period.</p>
        </ActionForm>
      </Card>
    </div>
  );
}
