import { all } from '@/lib/db';
import { adminTogglePlatformSettingAction } from '@/lib/actions/settings';
import { ActionForm } from '@/components/form';
import { Card, PageHeader, Field, Badge } from '@/components/ui';

export const dynamic = 'force-dynamic';

const DEFAULTS = [
  { key: 'support_email', label: 'Support email', hint: 'Shown on support requests and invoices.', placeholder: 'support@spacepilot.app' },
  { key: 'trial_days', label: 'Trial length (days)', hint: 'Applied to new organizations.', placeholder: '14' },
  { key: 'default_currency', label: 'Default currency', hint: 'Used when onboarding has no preference.', placeholder: 'USD' },
  { key: 'ai_enabled', label: 'AI assistant enabled', hint: 'Values: true or false', placeholder: 'true' },
  { key: 'signups_enabled', label: 'Public signups enabled', hint: 'Values: true or false', placeholder: 'true' },
  { key: 'maintenance_mode', label: 'Maintenance mode', hint: 'Values: on or off', placeholder: 'off' },
];

export default async function AdminSettingsPage() {
  const rows = all<Record<string, any>>(`SELECT * FROM platform_settings`);
  const map = new Map(rows.map((r) => [r.key, String(r.value)]));

  return (
    <div className="space-y-6">
      <PageHeader title="Platform settings" eyebrow="Configuration" subtitle="Operational switches for the whole platform. Values are stored server-side only." />

      <div className="grid gap-4 lg:grid-cols-2">
        {DEFAULTS.map((d) => (
          <Card key={d.key} title={d.label} subtitle={d.hint} action={<Badge tone={map.has(d.key) ? 'ok' : 'neutral'}>{map.has(d.key) ? 'set' : 'default'}</Badge>}>
            <ActionForm action={adminTogglePlatformSettingAction} submit="Save">
              <input type="hidden" name="key" value={d.key} />
              <Field label="Value" name="value" defaultValue={map.get(d.key) ?? ''} placeholder={d.placeholder} />
            </ActionForm>
          </Card>
        ))}
      </div>

      <Card title="Security posture" subtitle="Built-in protections active on this deployment">
        <ul className="grid gap-2 text-[12.5px] muted sm:grid-cols-2">
          <li className="rounded-lg border border-[var(--line)] p-3">Server-side authorization on every action, scoped by organization.</li>
          <li className="rounded-lg border border-[var(--line)] p-3">Session cookies are HTTP-only, SameSite=Lax, with 30-day expiry.</li>
          <li className="rounded-lg border border-[var(--line)] p-3">Payments are only counted when verified by the provider.</li>
          <li className="rounded-lg border border-[var(--line)] p-3">Documents are served through an authenticated route, never public paths.</li>
          <li className="rounded-lg border border-[var(--line)] p-3">Audit trail recorded for privileged mutations.</li>
          <li className="rounded-lg border border-[var(--line)] p-3">Secrets read from environment variables only.</li>
        </ul>
      </Card>
    </div>
  );
}
