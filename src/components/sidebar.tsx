'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon, type IconName } from './icons';
import { ThemeToggle } from './form';
import { initials } from '@/lib/format';

export type NavItem = { href: string; label: string; icon: IconName; badge?: string };
export type NavGroup = { label: string; items: NavItem[] };

export function Sidebar({
  groups,
  orgName,
  plan,
  userName,
  roleLabel,
  isPlatformAdmin,
  businessType,
}: {
  groups: NavGroup[];
  orgName: string;
  plan: string;
  userName: string;
  roleLabel: string;
  isPlatformAdmin: boolean;
  businessType: string;
}) {
  const pathname = usePathname();

  const isActive = (href: string) => (href === '/app' ? pathname === '/app' : pathname.startsWith(href));

  const nav = (
    <nav className="flex flex-1 flex-col gap-5 overflow-y-auto px-2 py-3 scroll-thin">
      {groups.map((group) => (
        <div key={group.label}>
          <p className="side-label">{group.label}</p>
          <div className="flex flex-col gap-0.5">
            {group.items.map((item) => (
              <Link key={item.href} href={item.href} className={`side-link ${isActive(item.href) ? 'active' : ''}`}>
                <Icon name={item.icon} size={15} />
                <span className="flex-1 truncate">{item.label}</span>
                {item.badge && <span className="badge badge-brand !px-1.5 !py-0 !text-[10px]">{item.badge}</span>}
              </Link>
            ))}
          </div>
        </div>
      ))}

      {isPlatformAdmin && (
        <div>
          <p className="side-label">Platform</p>
          <Link href="/admin" className={`side-link ${pathname.startsWith('/admin') ? 'active' : ''}`}>
            <Icon name="shield" size={15} />
            <span className="flex-1">Super admin</span>
          </Link>
        </div>
      )}
    </nav>
  );

  const footer = (
    <div className="border-t border-line p-3">
      <div className="mb-2 flex items-center gap-2 rounded-lg bg-surface2 px-2.5 py-2">
        <span className="avatar h-7 w-7">{initials(userName)}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12.5px] font-semibold leading-tight">{userName}</p>
          <p className="truncate text-[11px] muted leading-tight">{roleLabel}</p>
        </div>
        <form action="/api/logout" method="post">
          <button className="btn btn-ghost btn-sm h-7 w-7 !px-0" title="Sign out" aria-label="Sign out">
            <Icon name="logout" size={14} />
          </button>
        </form>
      </div>
      <div className="flex items-center justify-between px-1">
        <span className="badge badge-brand">{plan}</span>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Link href="/portal" className="btn btn-ghost btn-sm !px-2 text-[11.5px]">
            Member view
          </Link>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* desktop */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r border-line bg-surface lg:flex">
        <div className="flex items-center gap-2.5 px-4 pb-3 pt-4">
          <div className="grid h-8 w-8 place-items-center rounded-[10px] bg-brand text-white dark:text-[#0a0a14]">
            <Icon name="layers" size={16} />
          </div>
          <div className="min-w-0">
            <p className="truncate text-[13.5px] font-semibold leading-tight">{orgName}</p>
            <p className="truncate text-[11px] capitalize muted">{businessType.replace('_', ' ')} workspace</p>
          </div>
        </div>
        {nav}
        {footer}
      </aside>

      {/* mobile */}
      <details className="group fixed left-3 top-3 z-40 lg:hidden">
        <summary className="btn btn-sm shadow-[var(--shadow-md)]">
          <Icon name="grid" size={14} />
          Menu
        </summary>
        <div className="mt-2 flex max-h-[75vh] w-[248px] flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-[var(--shadow-lg)]">
          <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
            <span className="avatar h-7 w-7">{initials(orgName)}</span>
            <p className="truncate text-[12.5px] font-semibold">{orgName}</p>
          </div>
          {nav}
          {footer}
        </div>
      </details>
    </>
  );
}
