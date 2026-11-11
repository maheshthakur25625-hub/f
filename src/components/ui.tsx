import Link from 'next/link';
import { initials, toneForStatus } from '@/lib/format';

export function Card({
  title,
  subtitle,
  action,
  children,
  className = '',
  pad = true,
}: {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  pad?: boolean;
}) {
  return (
    <section className={`card ${className}`}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-4 px-5 pt-4 pb-3">
          <div>
            {title && <h2 className="text-[14.5px] font-semibold tracking-[-0.01em]">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-[12.5px] muted">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={pad ? 'px-5 pb-5' : ''}>{children}</div>
    </section>
  );
}

export function PageHeader({
  title,
  subtitle,
  children,
  eyebrow,
}: {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
  eyebrow?: string;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-brand">{eyebrow}</p>}
        <h1 className="text-[22px] font-semibold tracking-[-0.02em] sm:text-[25px]">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-[13.5px] muted">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone = 'neutral',
  icon,
  href,
}: {
  label: string;
  value: string;
  hint?: React.ReactNode;
  tone?: 'neutral' | 'ok' | 'warn' | 'bad' | 'brand';
  icon?: React.ReactNode;
  href?: string;
}) {
  const toneClass =
    tone === 'ok' ? 'text-ok' : tone === 'warn' ? 'text-warn' : tone === 'bad' ? 'text-bad' : tone === 'brand' ? 'text-brand' : '';
  const inner = (
    <div className="card card-pad h-full transition hover:-translate-y-[1px] hover:shadow-[var(--shadow-md)]">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[12px] font-medium muted">{label}</p>
        {icon && <span className={`opacity-80 ${toneClass}`}>{icon}</span>}
      </div>
      <p className={`stat-value mt-2 ${toneClass}`}>{value}</p>
      {hint && <div className="mt-1 text-[12px] muted">{hint}</div>}
    </div>
  );
  return href ? (
    <Link href={href} className="block">
      {inner}
    </Link>
  ) : (
    inner
  );
}

export function Badge({ children, tone }: { children: React.ReactNode; tone?: 'ok' | 'warn' | 'bad' | 'info' | 'brand' | 'neutral' }) {
  const cls = tone && tone !== 'neutral' ? `badge badge-${tone}` : 'badge';
  return <span className={cls}>{children}</span>;
}

export function StatusBadge({ status }: { status: string }) {
  const tone = toneForStatus(status);
  return <Badge tone={tone === 'neutral' ? undefined : tone}>{status.replace(/_/g, ' ')}</Badge>;
}

export function EmptyState({
  title,
  body,
  action,
  icon,
}: {
  title: string;
  body?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--line-strong)] px-6 py-10 text-center">
      {icon && <div className="mb-3 text-muted opacity-70">{icon}</div>}
      <p className="text-[14px] font-semibold">{title}</p>
      {body && <p className="mt-1 max-w-sm text-[12.5px] muted">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Avatar({ name, size = 30 }: { name: string; size?: number }) {
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: Math.round(size / 2.6) }}>
      {initials(name)}
    </span>
  );
}

export function Progress({ value, tone }: { value: number; tone?: string }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className="progress">
      <span style={{ width: `${clamped}%`, background: tone }} />
    </div>
  );
}

export function Field({
  label,
  name,
  type = 'text',
  defaultValue,
  placeholder,
  required,
  options,
  hint,
  step,
  min,
  max,
  rows,
  className,
  disabled,
  value,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string | number | null;
  placeholder?: string;
  required?: boolean;
  options?: { value: string; label: string }[] | readonly { value: string; label: string }[];
  hint?: string;
  step?: string;
  min?: string | number;
  max?: string | number;
  rows?: number;
  className?: string;
  disabled?: boolean;
  value?: string | number;
}) {
  const common = {
    name,
    id: name,
    required,
    placeholder,
    disabled,
    ...(value !== undefined ? { value } : { defaultValue: defaultValue ?? '' }),
  };
  return (
    <div className={className}>
      <label className="label" htmlFor={name}>
        {label}
        {required && <span className="text-bad"> *</span>}
      </label>
      {options ? (
        <select className="select" {...common}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : rows ? (
        <textarea className="textarea" rows={rows} {...common} />
      ) : (
        <input className="input" type={type} step={step} min={min} max={max} {...common} />
      )}
      {hint && <p className="mt-1 text-[11.5px] muted">{hint}</p>}
    </div>
  );
}

export function DataRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-6 border-b border-line py-2.5 last:border-0">
      <span className="text-[12.5px] muted">{label}</span>
      <span className="text-right text-[13px] font-medium">{value}</span>
    </div>
  );
}

export function Notice({
  tone = 'info',
  title,
  children,
}: {
  tone?: 'info' | 'warn' | 'bad' | 'ok';
  title?: string;
  children: React.ReactNode;
}) {
  const bg = `var(--${tone === 'bad' ? 'bad' : tone === 'warn' ? 'warn' : tone === 'ok' ? 'ok' : 'info'}-soft)`;
  const fg = `var(--${tone === 'bad' ? 'bad' : tone === 'warn' ? 'warn' : tone === 'ok' ? 'ok' : 'info'})`;
  return (
    <div className="rounded-xl px-4 py-3 text-[12.5px]" style={{ background: bg, color: fg }}>
      {title && <p className="mb-0.5 font-semibold">{title}</p>}
      <div style={{ color: 'var(--fg)' }} className="opacity-90">
        {children}
      </div>
    </div>
  );
}
