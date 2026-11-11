export function money(cents: number, currency = 'USD', locale = 'en-US'): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      maximumFractionDigits: Math.abs(cents) % 100 === 0 ? 0 : 2,
    }).format((cents || 0) / 100);
  } catch {
    return `${currency} ${((cents || 0) / 100).toFixed(0)}`;
  }
}

export function compactMoney(cents: number, currency = 'USD', locale = 'en-US'): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format((cents || 0) / 100);
  } catch {
    return money(cents, currency, locale);
  }
}

export function percent(value: number, digits = 0): string {
  return `${(value || 0).toFixed(digits)}%`;
}

export function fmtDate(value: string | Date | null | undefined, locale = 'en-US', timezone?: string): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value.length <= 10 ? `${value}T12:00:00Z` : value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: timezone || 'UTC' }).format(d);
}

export function fmtDateTime(value: string | Date | null | undefined, locale = 'en-US', timezone?: string): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: timezone || 'UTC' }).format(d);
}

export function fmtTime(value: string | Date, locale = 'en-US', timezone?: string): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', timeZone: timezone || 'UTC' }).format(d);
}

export function timeAgo(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  const diff = Date.now() - d.getTime();
  const mins = Math.round(diff / 60000);
  if (Math.abs(mins) < 1) return 'just now';
  if (Math.abs(mins) < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (Math.abs(hours) < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 30) return `${days}d ago`;
  return fmtDate(d);
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function addDays(iso: string | Date, days: number): string {
  const d = typeof iso === 'string' ? new Date(iso.length <= 10 ? `${iso}T12:00:00Z` : iso) : new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

export function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
}

export function monthKey(value: string | Date): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function monthLabel(key: string, locale = 'en-US'): string {
  const [y, m] = key.split('-').map(Number);
  return new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 1)));
}

export function titleCase(value: string): string {
  return value.replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function toneForStatus(status: string): 'ok' | 'warn' | 'bad' | 'info' | 'neutral' {
  const s = status.toLowerCase();
  if (['paid', 'active', 'confirmed', 'completed', 'succeeded', 'available', 'won', 'sold', 'verified'].includes(s)) return 'ok';
  if (['pending', 'in_progress', 'reserved', 'sent', 'open', 'trial', 'on_hold', 'invited', 'planning'].includes(s)) return 'warn';
  if (['overdue', 'cancelled', 'failed', 'lost', 'vacant', 'archived', 'expired', 'void'].includes(s)) return 'bad';
  if (['checked_in', 'occupied', 'new', 'qualified', 'in_review'].includes(s)) return 'info';
  return 'neutral';
}

export const CURRENCIES = ['USD', 'EUR', 'GBP', 'AED', 'SAR', 'CAD', 'AUD', 'SGD', 'INR', 'JPY', 'ZAR', 'BRL', 'MXN', 'CHF', 'SEK', 'NGN', 'KES', 'HKD'];

export const COUNTRIES = [
  ['US', 'United States', 'USD', 'en-US', 'America/New_York'],
  ['GB', 'United Kingdom', 'GBP', 'en-GB', 'Europe/London'],
  ['DE', 'Germany', 'EUR', 'de-DE', 'Europe/Berlin'],
  ['FR', 'France', 'EUR', 'fr-FR', 'Europe/Paris'],
  ['AE', 'United Arab Emirates', 'AED', 'en-AE', 'Asia/Dubai'],
  ['SA', 'Saudi Arabia', 'SAR', 'ar-SA', 'Asia/Riyadh'],
  ['CA', 'Canada', 'CAD', 'en-CA', 'America/Toronto'],
  ['AU', 'Australia', 'AUD', 'en-AU', 'Australia/Sydney'],
  ['SG', 'Singapore', 'SGD', 'en-SG', 'Asia/Singapore'],
  ['IN', 'India', 'INR', 'en-IN', 'Asia/Kolkata'],
  ['ZA', 'South Africa', 'ZAR', 'en-ZA', 'Africa/Johannesburg'],
  ['NG', 'Nigeria', 'NGN', 'en-NG', 'Africa/Lagos'],
  ['KE', 'Kenya', 'KES', 'en-KE', 'Africa/Nairobi'],
  ['BR', 'Brazil', 'BRL', 'pt-BR', 'America/Sao_Paulo'],
  ['MX', 'Mexico', 'MXN', 'es-MX', 'America/Mexico_City'],
  ['JP', 'Japan', 'JPY', 'ja-JP', 'Asia/Tokyo'],
] as const;

export const TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Toronto',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Madrid',
  'Africa/Lagos',
  'Africa/Nairobi',
  'Africa/Johannesburg',
  'Asia/Dubai',
  'Asia/Riyadh',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Hong_Kong',
  'Asia/Tokyo',
  'Australia/Sydney',
];

export const BUSINESS_TYPES = [
  { value: 'coworking', label: 'Coworking space', blurb: 'Desks, private offices, meeting rooms and memberships.', modules: ['properties', 'coworking', 'finance', 'maintenance', 'crm'] },
  { value: 'commercial', label: 'Commercial property management', blurb: 'Office units, tenants, leases and rent collection.', modules: ['properties', 'commercial', 'finance', 'maintenance'] },
  { value: 'residential', label: 'Residential property management', blurb: 'Apartments, tenancies, rent and maintenance.', modules: ['properties', 'residential', 'finance', 'maintenance'] },
  { value: 'serviced', label: 'Serviced office provider', blurb: 'Flexible suites, meeting rooms and hospitality.', modules: ['properties', 'coworking', 'commercial', 'finance', 'maintenance'] },
  { value: 'agency', label: 'Real estate agency', blurb: 'Listings, buyer and seller CRM, deals and visits.', modules: ['properties', 'crm', 'finance'] },
  { value: 'development', label: 'Property development', blurb: 'Projects, phases, unit inventory and sales.', modules: ['properties', 'development', 'crm', 'finance'] },
] as const;

export const MODULE_CATALOG = [
  { key: 'properties', label: 'Property management', detail: 'Buildings, floors, units and availability' },
  { key: 'coworking', label: 'Coworking & bookings', detail: 'Desks, rooms, availability calendar' },
  { key: 'commercial', label: 'Commercial leases', detail: 'Tenants, leases and rent schedules' },
  { key: 'residential', label: 'Residential tenancies', detail: 'Apartments, tenancy and rent tracking' },
  { key: 'crm', label: 'Sales CRM', detail: 'Leads, pipeline, follow-ups and visits' },
  { key: 'development', label: 'Developer projects', detail: 'Projects, inventory and buyers' },
  { key: 'finance', label: 'Finance', detail: 'Invoices, payments, expenses and tax' },
  { key: 'maintenance', label: 'Maintenance', detail: 'Tickets, vendors and history' },
  { key: 'ai', label: 'AI assistant', detail: 'Insights and natural language questions' },
] as const;
