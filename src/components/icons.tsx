type IconName =
  | 'grid'
  | 'building'
  | 'calendar'
  | 'users'
  | 'user'
  | 'receipt'
  | 'chart'
  | 'sparkles'
  | 'wrench'
  | 'settings'
  | 'mail'
  | 'layers'
  | 'briefcase'
  | 'shield'
  | 'logout'
  | 'plus'
  | 'search'
  | 'desk'
  | 'door'
  | 'arrow'
  | 'check'
  | 'clock'
  | 'trend'
  | 'map'
  | 'home'
  | 'bolt'
  | 'doc'
  | 'bell'
  | 'globe';

const PATHS: Record<IconName, string> = {
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z',
  building: 'M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M16 9h2a2 2 0 0 1 2 2v10M8 7h4M8 11h4M8 15h4M2 21h20',
  calendar: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  receipt: 'M6 2h12a1 1 0 0 1 1 1v18l-3-2-2 2-2-2-2 2-2-2-3 2V3a1 1 0 0 1 1-1zM9 7h6M9 11h6M9 15h3',
  chart: 'M3 3v18h18M7 15l3-4 3 3 5-7',
  sparkles: 'M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6zM18 15l.9 2.1L21 18l-2.1.9L18 21l-.9-2.1L15 18l2.1-.9z',
  wrench: 'M14.7 6.3a4 4 0 1 0 5 5L21 21l-3 .5-3.5-8.2a4 4 0 0 1 .2-7z',
  settings:
    'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 15H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 4.1V4a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 21 11h.1a2 2 0 1 1 0 4H21a1.7 1.7 0 0 0-1.6 1z',
  mail: 'M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM2 8l10 6 10-6',
  layers: 'M12 2l9 5-9 5-9-5 9-5zM3 12l9 5 9-5M3 17l9 5 9-5',
  briefcase: 'M3 8h18v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8zM8 8V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  plus: 'M12 5v14M5 12h14',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  desk: 'M3 19h18M5 19V9h14v10M5 9l2-4h10l2 4M9 13h6',
  door: 'M5 21V4a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v17M3 21h18M13 12h.01',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  check: 'M20 6L9 17l-5-5',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2',
  trend: 'M23 6l-9.5 9.5-5-5L1 18M17 6h6v6',
  map: 'M21 10c0 7-9 12-9 12S3 17 3 10a9 9 0 0 1 18 0zM12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  home: 'M3 10l9-7 9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V10zM9 22V12h6v10',
  bolt: 'M13 2L3 14h7l-1 8 10-12h-7l1-8z',
  doc: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zM14 2v6h6M9 15h6M9 11h3',
  bell: 'M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8M13.7 21a2 2 0 0 1-3.4 0',
  globe: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20z',
};

export function Icon({ name, size = 16, className = '' }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

export type { IconName };
