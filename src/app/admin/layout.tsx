import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/auth';
import { logoutAction } from '@/lib/actions/auth';
import { ThemeToggle } from '@/components/form';

export const dynamic = 'force-dynamic';

const NAV = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/organizations', label: 'Organizations' },
  { href: '/admin/plans', label: 'Plans' },
  { href: '/admin/audit', label: 'Audit log' },
  { href: '/admin/settings', label: 'Platform' },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  if (!session.isPlatformAdmin) redirect('/app');

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <header className="sticky top-0 z-30 border-b border-[var(--line)] bg-[var(--surface)]/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6">
          <Link href="/admin" className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-[var(--fg)] text-[13px] font-bold text-[var(--bg)]">S</span>
            <span className="text-[14px] font-semibold tracking-tight">SpacePilot</span>
          </Link>
          <span className="rounded-md border border-[var(--line)] px-1.5 py-0.5 text-[10.5px] uppercase tracking-wide muted">Platform</span>
          <nav className="ml-4 hidden items-center gap-1 md:flex">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="rounded-lg px-2.5 py-1.5 text-[12.5px] muted transition hover:bg-[var(--hover)] hover:text-[var(--fg)]">
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Link href="/app" className="btn btn-ghost btn-sm">Workspace</Link>
            <ThemeToggle />
            <form action={logoutAction}>
              <button className="btn btn-sm" type="submit">Sign out</button>
            </form>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto border-t border-[var(--line)] px-4 py-1.5 md:hidden">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="whitespace-nowrap rounded-lg px-2.5 py-1 text-[12px] muted">{n.label}</Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}
