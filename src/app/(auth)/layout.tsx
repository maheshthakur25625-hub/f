import Link from 'next/link';
import { Icon } from '@/components/icons';
import { ThemeToggle } from '@/components/form';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden border-r border-line bg-[var(--surface)] p-10 lg:flex lg:flex-col lg:justify-between">
        <Link href="/" className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-brand text-white dark:text-[#0a0a14]">
            <Icon name="layers" size={16} />
          </span>
          <span className="text-[15px] font-semibold tracking-[-0.01em]">SpacePilot</span>
        </Link>

        <div className="glow -mx-10 px-10 py-10">
          <h2 className="max-w-md text-[30px] font-semibold leading-[1.15] tracking-[-0.025em]">
            The operating system for workspaces, tenancies and portfolios.
          </h2>
          <p className="mt-3 max-w-md text-[13.5px] leading-relaxed muted">
            Bookings that can never double-book, rent that reconciles against verified payments, and an AI analyst that
            answers from your own records.
          </p>
          <div className="mt-8 grid max-w-md gap-2">
            {[
              ['Isolated workspaces', 'Every query and mutation is scoped to your organisation.'],
              ['Six business models', 'Coworking, commercial, residential, serviced, agency, developer.'],
              ['Role-aware by default', 'Owner, managers, agents, accountants, staff and members.'],
            ].map(([title, body]) => (
              <div key={title} className="flex gap-3 rounded-xl border border-line bg-[var(--surface)] px-3.5 py-3">
                <Icon name="check" size={15} className="mt-[3px] flex-none text-ok" />
                <div>
                  <p className="text-[12.5px] font-semibold">{title}</p>
                  <p className="text-[12px] muted">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="text-[11.5px] muted">© {new Date().getFullYear()} SpacePilot · Global real estate & coworking SaaS</p>
      </aside>

      <main className="flex flex-col">
        <div className="flex items-center justify-between p-5 lg:justify-end">
          <Link href="/" className="flex items-center gap-2 lg:hidden">
            <span className="grid h-7 w-7 place-items-center rounded-[9px] bg-brand text-white dark:text-[#0a0a14]">
              <Icon name="layers" size={14} />
            </span>
            <span className="text-[14px] font-semibold">SpacePilot</span>
          </Link>
          <ThemeToggle />
        </div>
        <div className="flex flex-1 items-center justify-center px-5 pb-16">
          <div className="w-full max-w-[380px]">{children}</div>
        </div>
      </main>
    </div>
  );
}
