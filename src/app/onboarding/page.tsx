import Link from 'next/link';
import { redirect } from 'next/navigation';
import { one } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { Icon } from '@/components/icons';
import { ActionForm, SubmitButton, ThemeToggle } from '@/components/form';
import { Field } from '@/components/ui';
import {
  finishOnboardingAction,
  saveBusinessProfileAction,
  saveBusinessTypeAction,
  saveFirstPropertyAction,
  saveModulesAction,
} from '@/lib/actions/onboarding';
import { verifyEmailAction } from '@/lib/actions/auth';
import { BUSINESS_TYPES, COUNTRIES, CURRENCIES, MODULE_CATALOG, TIMEZONES } from '@/lib/format';
import { ROLES } from '@/lib/rbac';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Set up your workspace · SpacePilot' };

const STEPS = ['Account', 'Business', 'Type', 'Modules', 'Property', 'Team'];

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ step?: string }> }) {
  const session = await getSession();
  if (!session) redirect('/login');

  const params = await searchParams;
  const org = session.orgId
    ? one<{
        id: string;
        name: string;
        business_type: string;
        country: string;
        currency: string;
        timezone: string;
        locale: string;
        website: string | null;
        address: string | null;
        modules: string;
        onboarding_complete: number;
      }>(`SELECT * FROM organizations WHERE id = ?`, [session.orgId])
    : null;

  if (org?.onboarding_complete) redirect(session.role === 'member' ? '/portal' : '/app');

  const step = Math.min(Math.max(Number(params.step ?? (org ? 3 : 2)), 2), 6);
  const selectedModules = org ? (JSON.parse(org.modules) as string[]) : [];

  return (
    <div className="min-h-screen">
      <header className="border-b border-line">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-[9px] bg-brand text-white dark:text-[#0a0a14]">
              <Icon name="layers" size={14} />
            </span>
            <span className="text-[14px] font-semibold">SpacePilot</span>
          </Link>
          <div className="flex items-center gap-2">
            <span className="text-[12px] muted">{session.email}</span>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-7 flex flex-wrap items-center gap-x-2 gap-y-2">
          {STEPS.map((label, i) => {
            const n = i + 1;
            const state = n < step ? 'done' : n === step ? 'current' : 'todo';
            return (
              <div key={label} className="flex items-center gap-2">
                <span
                  className={`grid h-6 w-6 place-items-center rounded-full text-[11px] font-semibold ${
                    state === 'done'
                      ? 'bg-oksoft text-ok'
                      : state === 'current'
                        ? 'bg-brand text-white dark:text-[#0a0a14]'
                        : 'border border-line text-muted'
                  }`}
                >
                  {state === 'done' ? <Icon name="check" size={12} /> : n}
                </span>
                <span className={`text-[12px] ${state === 'current' ? 'font-semibold' : 'muted'}`}>{label}</span>
                {i < STEPS.length - 1 && <span className="mx-1 h-px w-4 bg-[var(--line-strong)] sm:w-7" />}
              </div>
            );
          })}
        </div>

        {step === 2 && (
          <div className="card card-pad">
            <h1 className="text-[20px] font-semibold tracking-[-0.02em]">Tell us about the business</h1>
            <p className="mt-1 text-[13px] muted">
              These defaults drive currency, dates and tax formatting across every module.
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface2 px-3.5 py-3">
              <Icon name={session.emailVerified ? 'check' : 'mail'} size={15} className={session.emailVerified ? 'text-ok' : 'text-warn'} />
              <p className="flex-1 text-[12.5px]">
                {session.emailVerified
                  ? 'Email verified — your account is ready.'
                  : `Verify ${session.email} to secure your workspace.`}
              </p>
              {!session.emailVerified && (
                <form action={verifyEmailAction}>
                  <SubmitButton className="btn btn-sm" pendingLabel="Verifying…">
                    Verify now
                  </SubmitButton>
                </form>
              )}
            </div>

            <ActionForm action={saveBusinessProfileAction} submit="Continue" className="mt-4 space-y-3.5" pendingLabel="Saving…">
              <Field label="Business name" name="name" defaultValue={org?.name} placeholder="Helix Workspaces" required />
              <div className="grid gap-3.5 sm:grid-cols-2">
                <Field
                  label="Country"
                  name="country"
                  options={COUNTRIES}
                  defaultValue={org?.country ?? 'US'}
                />
                <Field label="Currency" name="currency" options={CURRENCIES.map((c) => ({ value: c, label: c }))} defaultValue={org?.currency ?? 'USD'} />
                <Field label="Timezone" name="timezone" options={TIMEZONES} defaultValue={org?.timezone ?? 'UTC'} />
                <Field label="Locale" name="locale" defaultValue={org?.locale ?? 'en-US'} placeholder="en-US" hint="Used for date and number formatting." />
              </div>
              <Field label="Business website" name="website" defaultValue={org?.website} placeholder="https://helix.space" />
              <Field label="Business address" name="address" defaultValue={org?.address} rows={2} placeholder="14 Harbour Exchange, London" />
            </ActionForm>
          </div>
        )}

        {step === 3 && org && (
          <div className="card card-pad">
            <h1 className="text-[20px] font-semibold tracking-[-0.02em]">What do you operate?</h1>
            <p className="mt-1 text-[13px] muted">We pre-select the modules that fit your business model. You can change this later.</p>
            <ActionForm action={saveBusinessTypeAction} submit="Continue" className="mt-4 space-y-3" pendingLabel="Saving…">
              <div className="grid gap-2 sm:grid-cols-2">
                {BUSINESS_TYPES.map((type) => (
                  <label
                    key={type.value}
                    className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-line px-3.5 py-3 transition hover:border-[var(--brand)] has-[:checked]:border-[var(--brand)] has-[:checked]:bg-brandsoft"
                  >
                    <input type="radio" name="business_type" value={type.value} defaultChecked={org.business_type === type.value} className="mt-1" required />
                    <span>
                      <span className="block text-[13px] font-semibold">{type.label}</span>
                      <span className="mt-0.5 block text-[11.5px] muted">{type.description}</span>
                    </span>
                  </label>
                ))}
              </div>
            </ActionForm>
          </div>
        )}

        {step === 4 && org && (
          <div className="card card-pad">
            <h1 className="text-[20px] font-semibold tracking-[-0.02em]">Configure your modules</h1>
            <p className="mt-1 text-[13px] muted">Only enabled modules appear in the sidebar for your team.</p>
            <ActionForm action={saveModulesAction} submit="Continue" className="mt-4 space-y-3" pendingLabel="Saving…">
              <div className="grid gap-2 sm:grid-cols-2">
                {MODULE_CATALOG.map((m) => (
                  <label key={m.value} className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-line px-3.5 py-3 has-[:checked]:border-[var(--brand)] has-[:checked]:bg-brandsoft">
                    <input
                      type="checkbox"
                      name="modules"
                      value={m.value}
                      defaultChecked={selectedModules.includes(m.value)}
                    />
                    <span>
                      <span className="block text-[13px] font-medium">{m.label}</span>
                      <span className="block text-[11.5px] muted">{m.description}</span>
                    </span>
                  </label>
                ))}
              </div>
            </ActionForm>
          </div>
        )}

        {step === 5 && org && (
          <div className="card card-pad">
            <h1 className="text-[20px] font-semibold tracking-[-0.02em]">Create your first property</h1>
            <p className="mt-1 text-[13px] muted">We will create the building, a first floor and your initial units so you can start operating immediately.</p>
            <ActionForm action={saveFirstPropertyAction} submit="Create property" className="mt-4 space-y-3.5" pendingLabel="Creating…">
              <Field label="Property name" name="name" placeholder="Helix Harbour" required />
              <div className="grid gap-3.5 sm:grid-cols-2">
                <Field
                  label="Property type"
                  name="type"
                  options={[
                    { value: 'coworking', label: 'Coworking space' },
                    { value: 'commercial', label: 'Commercial' },
                    { value: 'residential', label: 'Residential' },
                    { value: 'serviced_office', label: 'Serviced office' },
                    { value: 'mixed', label: 'Mixed use' },
                  ]}
                  defaultValue="coworking"
                />
                <Field label="City" name="city" placeholder="London" />
                <Field label="Country" name="country" options={COUNTRIES} defaultValue={org.country} />
                <Field
                  label="Unit type"
                  name="unit_kind"
                  options={[
                    { value: 'office', label: 'Office' },
                    { value: 'desk', label: 'Desk' },
                    { value: 'apartment', label: 'Apartment' },
                    { value: 'room', label: 'Room' },
                  ]}
                  defaultValue="office"
                />
                <Field label="Number of units" name="units" type="number" min={0} max={50} defaultValue={4} />
                <Field label={`Monthly rent per unit (${org.currency})`} name="rent" type="number" min={0} step="0.01" defaultValue={0} hint="Enter the amount, not cents." />
              </div>
              <Field label="Address" name="address" rows={2} placeholder="14 Harbour Exchange Square" />
              <Field label="Description" name="description" rows={2} placeholder="Riverside workspace with 24/7 access and meeting rooms." />
            </ActionForm>
          </div>
        )}

        {step === 6 && org && (
          <div className="card card-pad">
            <h1 className="text-[20px] font-semibold tracking-[-0.02em]">Invite your team</h1>
            <p className="mt-1 text-[13px] muted">
              Roles control what each person can see and change. Invites are created instantly — email delivery activates
              once an email provider key is configured.
            </p>
            <ActionForm action={finishOnboardingAction} submit="Finish setup" className="mt-4 space-y-3" pendingLabel="Finishing…">
              {[1, 2, 3].map((n) => (
                <div key={n} className="grid gap-3 sm:grid-cols-[1.6fr_1fr]">
                  <Field label={n === 1 ? 'Teammate email' : `Teammate email ${n}`} name={`email_${n}`} type="email" placeholder="colleague@company.com" />
                  <Field
                    label="Role"
                    name={`role_${n}`}
                    options={ROLES.filter((r) => r.value !== 'owner').map((r) => ({ value: r.value, label: r.label }))}
                    defaultValue="property_manager"
                  />
                </div>
              ))}
              <p className="text-[11.5px] muted">You can skip this and invite people later from Team settings.</p>
            </ActionForm>
          </div>
        )}
      </div>
    </div>
  );
}
