import Link from 'next/link';
import { all } from '@/lib/db';
import { Icon, type IconName } from '@/components/icons';
import { ThemeToggle } from '@/components/form';
import { money } from '@/lib/format';

export const dynamic = 'force-dynamic';

const PILLARS: { icon: IconName; title: string; body: string }[] = [
  { icon: 'building', title: 'Portfolio control', body: 'Buildings, floors, units, availability and occupancy in one live register — commercial, residential or mixed.' },
  { icon: 'desk', title: 'Coworking engine', body: 'Hot desks, dedicated desks and meeting rooms with transactional availability checks that make double bookings impossible.' },
  { icon: 'receipt', title: 'Billing that reconciles', body: 'Invoices, rent schedules, memberships, deposits and expenses — revenue is only counted once a payment is verified.' },
  { icon: 'users', title: 'Tenants & members', body: 'Self-service portal for bookings, invoices, documents and maintenance requests, scoped to each person.' },
  { icon: 'sparkles', title: 'AI analyst', body: 'Ask about revenue, vacancy, arrears or pipeline. Answers are computed from your own authorised records.' },
  { icon: 'shield', title: 'Isolation by design', body: 'Every query is organisation-scoped and every mutation re-checks role permissions on the server.' },
];

const FLOW = [
  { step: '01', title: 'Create your workspace', body: 'Sign up, verify your email and describe the business — country, currency and timezone set the defaults.' },
  { step: '02', title: 'Model your portfolio', body: 'Add properties, buildings, floors, units, desks and rooms. Availability is derived, never typed in twice.' },
  { step: '03', title: 'Operate daily', body: 'Bookings, leases, rent, maintenance and CRM run against the same data model, with automations keeping everyone informed.' },
];

export default function LandingPage() {
  const plans = all<{
    code: string;
    name: string;
    price_monthly: number;
    price_yearly: number;
    property_limit: number;
    seat_limit: number;
    ai_credits: number;
    features: string;
  }>(`SELECT * FROM plans WHERE active = 1 ORDER BY sort`);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-line bg-[color-mix(in_srgb,var(--bg)_88%,transparent)] backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-brand text-white dark:text-[#0a0a14]">
              <Icon name="layers" size={16} />
            </span>
            <span className="text-[15px] font-semibold tracking-[-0.01em]">SpacePilot</span>
          </Link>
          <nav className="hidden items-center gap-6 text-[13px] muted md:flex">
            <a href="#platform" className="hover:text-[var(--fg)]">Platform</a>
            <a href="#how" className="hover:text-[var(--fg)]">How it works</a>
            <a href="#pricing" className="hover:text-[var(--fg)]">Pricing</a>
            <Link href="/login" className="hover:text-[var(--fg)]">Sign in</Link>
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link href="/register" className="btn btn-primary btn-sm">Start free</Link>
          </div>
        </div>
      </header>

      <section className="glow relative overflow-hidden border-b border-line">
        <div className="mx-auto max-w-6xl px-4 pb-16 pt-16 sm:pt-24">
          <span className="badge badge-brand">Real estate & coworking operating system</span>
          <h1 className="mt-4 max-w-3xl text-[34px] font-semibold leading-[1.1] tracking-[-0.03em] sm:text-[52px]">
            One platform for every square metre you manage.
          </h1>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed muted sm:text-[16.5px]">
            SpacePilot unifies coworking bookings, commercial and residential tenancies, agency pipelines and developer
            inventory — with billing, maintenance, automations and an AI analyst built on the same live data.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link href="/register" className="btn btn-primary btn-lg">
              Create your workspace <Icon name="arrow" size={15} />
            </Link>
            <Link href="/login" className="btn btn-lg">
              Explore the demo workspace
            </Link>
          </div>
          <p className="mt-3 text-[12px] muted">
            Demo login: <span className="font-medium">avery@helix.space</span> · password <span className="font-medium">SpacePilot123!</span>
          </p>

          <div className="mt-12 grid gap-3 sm:grid-cols-3">
            {[
              ['6 business models', 'Coworking, commercial, residential, serviced offices, agencies, developers'],
              ['26 relational tables', 'Normalised schema with organisation-scoped indexes and constraints'],
              ['Server-enforced roles', 'Owner to member — permissions checked on every mutation'],
            ].map(([title, body]) => (
              <div key={title} className="card card-pad">
                <p className="text-[13.5px] font-semibold">{title}</p>
                <p className="mt-1 text-[12.5px] muted">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="platform" className="mx-auto max-w-6xl px-4 py-16">
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-brand">Platform</p>
        <h2 className="mt-2 max-w-2xl text-[26px] font-semibold tracking-[-0.02em] sm:text-[32px]">
          Everything an operator needs, without stitching four tools together.
        </h2>
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {PILLARS.map((p) => (
            <div key={p.title} className="card card-pad transition hover:-translate-y-[2px] hover:shadow-[var(--shadow-md)]">
              <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-brandsoft text-brand">
                <Icon name={p.icon} size={17} />
              </span>
              <p className="mt-3 text-[14px] font-semibold">{p.title}</p>
              <p className="mt-1 text-[12.5px] leading-relaxed muted">{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="how" className="border-y border-line bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="text-[26px] font-semibold tracking-[-0.02em] sm:text-[32px]">Live in an afternoon</h2>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {FLOW.map((f) => (
              <div key={f.step}>
                <span className="text-[12px] font-semibold text-brand">{f.step}</span>
                <p className="mt-1 text-[15px] font-semibold">{f.title}</p>
                <p className="mt-1 text-[13px] leading-relaxed muted">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="mx-auto max-w-6xl px-4 py-16">
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-brand">Pricing</p>
        <h2 className="mt-2 text-[26px] font-semibold tracking-[-0.02em] sm:text-[32px]">Plans that scale with your portfolio</h2>
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {plans.map((plan) => (
            <div key={plan.code} className={`card card-pad flex flex-col ${plan.code === 'growth' ? 'ring-1 ring-[var(--brand)]' : ''}`}>
              <p className="text-[13px] font-semibold">{plan.name}</p>
              <p className="mt-2 text-[22px] font-semibold tracking-[-0.02em]">
                {plan.price_monthly === 0 ? 'Free' : money(plan.price_monthly)}
                {plan.price_monthly > 0 && <span className="text-[12px] font-normal muted">/mo</span>}
              </p>
              <p className="mt-1 text-[11.5px] muted">
                {plan.property_limit >= 500 ? 'Unlimited' : plan.property_limit} properties · {plan.seat_limit} seats
              </p>
              <ul className="mt-3 flex-1 space-y-1.5">
                {(JSON.parse(plan.features) as string[]).map((f) => (
                  <li key={f} className="flex gap-1.5 text-[12px] muted">
                    <Icon name="check" size={13} className="mt-[2px] flex-none text-ok" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link href="/register" className={`btn mt-4 ${plan.code === 'growth' ? 'btn-primary' : ''}`}>
                Choose {plan.name}
              </Link>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-[12.5px] muted">
            <Icon name="layers" size={15} />
            SpacePilot — real estate & coworking operating system
          </div>
          <div className="flex items-center gap-4 text-[12.5px] muted">
            <Link href="/login" className="hover:text-[var(--fg)]">Sign in</Link>
            <Link href="/register" className="hover:text-[var(--fg)]">Create account</Link>
            <a href="#pricing" className="hover:text-[var(--fg)]">Pricing</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
