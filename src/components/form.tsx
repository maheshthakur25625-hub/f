'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import type { ReactNode } from 'react';

export type ActionState = { ok?: boolean; error?: string; message?: string };

export const initialActionState: ActionState = {};

export type ServerAction = (state: ActionState, formData: FormData) => Promise<ActionState>;

export function SubmitButton({
  children,
  className = 'btn btn-primary',
  pendingLabel = 'Saving…',
  name,
  value,
}: {
  children: ReactNode;
  className?: string;
  pendingLabel?: string;
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending} name={name} value={value}>
      {pending ? pendingLabel : children}
    </button>
  );
}

export function ActionForm({
  action,
  children,
  submit = 'Save',
  className = 'space-y-4',
  footer,
  pendingLabel,
  compact,
}: {
  action: ServerAction;
  children: ReactNode;
  submit?: string;
  className?: string;
  footer?: ReactNode;
  pendingLabel?: string;
  compact?: boolean;
}) {
  const [state, formAction] = useActionState(action, initialActionState);
  return (
    <form action={formAction} className={className}>
      {children}
      {state?.error && (
        <p className="rounded-lg px-3 py-2 text-[12.5px] font-medium" style={{ background: 'var(--bad-soft)', color: 'var(--bad)' }}>
          {state.error}
        </p>
      )}
      {state?.ok && state.message && (
        <p className="rounded-lg px-3 py-2 text-[12.5px] font-medium" style={{ background: 'var(--ok-soft)', color: 'var(--ok)' }}>
          {state.message}
        </p>
      )}
      <div className="flex items-center gap-2">
        <SubmitButton className={compact ? 'btn btn-primary btn-sm' : 'btn btn-primary'} pendingLabel={pendingLabel}>
          {submit}
        </SubmitButton>
        {footer}
      </div>
    </form>
  );
}

export function DangerSubmit({ label = 'Delete', confirmText = 'This action cannot be undone. Continue?' }: { label?: string; confirmText?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="btn btn-danger btn-sm"
      disabled={pending}
      onClick={(e) => {
        if (!window.confirm(confirmText)) e.preventDefault();
      }}
    >
      {pending ? 'Working…' : label}
    </button>
  );
}

export function GhostSubmit({ label, className = 'btn btn-ghost btn-sm', title }: { label: string; className?: string; title?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending} title={title}>
      {pending ? '…' : label}
    </button>
  );
}

export function ThemeToggle() {
  return (
    <button
      type="button"
      aria-label="Toggle theme"
      className="btn btn-ghost btn-sm h-8 w-8 !px-0"
      onClick={() => {
        const root = document.documentElement;
        const next = root.classList.contains('dark') ? 'light' : 'dark';
        root.classList.toggle('dark', next === 'dark');
        try {
          localStorage.setItem('sp-theme', next);
        } catch {
          /* ignore */
        }
      }}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="dark:hidden">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
      </svg>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="hidden dark:block">
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
      </svg>
    </button>
  );
}

export function CopyField({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="label">{label}</p>
      <div className="flex items-center gap-2">
        <code className="flex-1 truncate rounded-lg border border-line bg-surface2 px-3 py-2 text-[12px]">{value}</code>
        <button
          type="button"
          className="btn btn-sm"
          onClick={async (e) => {
            try {
              await navigator.clipboard.writeText(value);
              (e.currentTarget as HTMLButtonElement).textContent = 'Copied';
            } catch {
              /* ignore */
            }
          }}
        >
          Copy
        </button>
      </div>
    </div>
  );
}
