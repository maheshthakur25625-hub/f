import { compactMoney, monthLabel } from '@/lib/format';

export type Point = { key: string; label: string; value: number };

/** Smooth-ish area chart rendered as inline SVG (no client JS). */
export function AreaChart({
  data,
  height = 168,
  currency = 'USD',
  locale = 'en-US',
  valueFormat,
}: {
  data: Point[];
  height?: number;
  currency?: string;
  locale?: string;
  valueFormat?: (v: number) => string;
}) {
  const w = 560;
  const h = height;
  const padX = 8;
  const padTop = 14;
  const padBottom = 22;
  const max = Math.max(...data.map((d) => d.value), 1);
  const stepX = data.length > 1 ? (w - padX * 2) / (data.length - 1) : 0;
  const scaleY = (v: number) => padTop + (1 - v / max) * (h - padTop - padBottom);
  const points = data.map((d, i) => [padX + i * stepX, scaleY(d.value)] as const);

  const line = points
    .map(([x, y], i) => {
      if (i === 0) return `M ${x} ${y}`;
      const [px, py] = points[i - 1];
      const cx = (px + x) / 2;
      return `C ${cx} ${py}, ${cx} ${y}, ${x} ${y}`;
    })
    .join(' ');
  const area = `${line} L ${points[points.length - 1]?.[0] ?? padX} ${h - padBottom} L ${padX} ${h - padBottom} Z`;
  const fmt = valueFormat ?? ((v: number) => compactMoney(v, currency, locale));

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height }} preserveAspectRatio="none" role="img">
        <defs>
          <linearGradient id="spArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--brand)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.5, 1].map((t) => (
          <line
            key={t}
            x1={0}
            x2={w}
            y1={padTop + t * (h - padTop - padBottom)}
            y2={padTop + t * (h - padTop - padBottom)}
            stroke="var(--line)"
            strokeDasharray="3 5"
            strokeWidth="1"
          />
        ))}
        <path d={area} fill="url(#spArea)" />
        <path d={line} fill="none" stroke="var(--brand)" strokeWidth="2.2" strokeLinecap="round" />
        {points.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="2.6" fill="var(--surface)" stroke="var(--brand)" strokeWidth="1.8" />
        ))}
      </svg>
      <div className="mt-1 flex justify-between text-[11px] muted">
        {data.map((d) => (
          <span key={d.key} className="flex-1 text-center">
            {d.label}
          </span>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between text-[11.5px] muted">
        <span>Peak {fmt(max)}</span>
        <span>Last {fmt(data[data.length - 1]?.value ?? 0)}</span>
      </div>
    </div>
  );
}

export function BarChart({
  data,
  height = 160,
  currency = 'USD',
  locale = 'en-US',
}: {
  data: Point[];
  height?: number;
  currency?: string;
  locale?: string;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="w-full">
      <div className="flex items-end gap-2" style={{ height }}>
        {data.map((d) => (
          <div key={d.key} className="group flex h-full flex-1 flex-col justify-end gap-1.5">
            <div className="text-center text-[10.5px] font-semibold muted opacity-0 transition group-hover:opacity-100">
              {compactMoney(d.value, currency, locale)}
            </div>
            <div
              className="w-full rounded-t-[5px] bg-brand transition-all"
              style={{ height: `${Math.max((d.value / max) * 100, 2)}%`, opacity: 0.35 + 0.65 * (d.value / max) }}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        {data.map((d) => (
          <span key={d.key} className="flex-1 text-center text-[11px] muted">
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export function Donut({ segments, size = 132, centerLabel, centerValue }: { segments: { label: string; value: number; color: string }[]; size?: number; centerLabel?: string; centerValue?: string }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const r = size / 2 - 10;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="flex items-center gap-5">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="flex-none">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth="11" />
        {segments.map((s) => {
          const len = (s.value / total) * c;
          const el = (
            <circle
              key={s.label}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth="11"
              strokeDasharray={`${len} ${c - len}`}
              strokeDashoffset={-offset}
              strokeLinecap="butt"
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          );
          offset += len;
          return el;
        })}
        {centerValue && (
          <text x="50%" y="47%" textAnchor="middle" fill="var(--fg)" fontSize="16" fontWeight="700">
            {centerValue}
          </text>
        )}
        {centerLabel && (
          <text x="50%" y="60%" textAnchor="middle" fill="var(--muted)" fontSize="9.5">
            {centerLabel}
          </text>
        )}
      </svg>
      <div className="space-y-1.5">
        {segments.map((s) => (
          <div key={s.label} className="flex items-center gap-2 text-[12px]">
            <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
            <span className="muted">{s.label}</span>
            <span className="font-semibold">{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function monthPoints(rows: { month: string; total: number }[]): Point[] {
  return rows.map((r) => ({ key: r.month, label: monthLabel(r.month), value: r.total }));
}
