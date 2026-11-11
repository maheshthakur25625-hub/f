import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ActionForm } from '@/components/form';
import { Field } from '@/components/ui';
import { registerAction } from '@/lib/actions/auth';
import { getSession } from '@/lib/auth';

export const metadata = { title: 'Create account · SpacePilot' };

export default async function RegisterPage() {
  const session = await getSession();
  if (session) redirect(session.role === 'member' ? '/portal' : '/app');

  return (
    <>
      <h1 className="text-[24px] font-semibold tracking-[-0.02em]">Create your workspace</h1>
      <p className="mt-1 text-[13px] muted">Start with a 14-day trial. No card required.</p>

      <ActionForm
        action={registerAction}
        submit="Create account"
        className="mt-6 space-y-3.5"
        pendingLabel="Creating account…"
      >
        <Field label="Full name" name="name" placeholder="Avery Sinclair" required />
        <Field label="Work email" name="email" type="email" placeholder="you@company.com" required />
        <Field label="Password" name="password" type="password" placeholder="At least 8 characters" required hint="Use 8+ characters with a mix of letters and numbers." />
        <label className="flex items-start gap-2 text-[12px] muted">
          <input type="checkbox" required className="mt-[2px]" />
          <span>
            I agree to the SpacePilot terms of service and privacy policy, and understand my organisation data stays
            isolated to my workspace.
          </span>
        </label>
      </ActionForm>

      <div className="mt-5 grid gap-2">
        <button type="button" disabled className="btn w-full opacity-60" title="Google sign-in activates once OAuth credentials are configured">
          <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden>
            <path fill="#4285F4" d="M23 12.2c0-.8-.1-1.6-.2-2.3H12v4.4h6.2a5.3 5.3 0 0 1-2.3 3.5v2.9h3.7c2.2-2 3.4-5 3.4-8.5z" />
            <path fill="#34A853" d="M12 24c3.1 0 5.7-1 7.6-2.8l-3.7-2.9c-1 .7-2.3 1.1-3.9 1.1-3 0-5.5-2-6.4-4.7H1.8v3A12 12 0 0 0 12 24z" />
            <path fill="#FBBC05" d="M5.6 14.7a7.2 7.2 0 0 1 0-4.6v-3H1.8a12 12 0 0 0 0 10.6l3.8-3z" />
            <path fill="#EA4335" d="M12 4.8c1.7 0 3.2.6 4.4 1.7l3.3-3.3A11.6 11.6 0 0 0 12 0 12 12 0 0 0 1.8 6.1l3.8 3C6.5 6.7 9 4.8 12 4.8z" />
          </svg>
          Continue with Google
        </button>
        <p className="text-center text-[11px] muted">Google sign-in is enabled by connecting an OAuth provider.</p>
      </div>

      <p className="mt-5 text-center text-[12.5px] muted">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-brand hover:underline">
          Sign in
        </Link>
      </p>
    </>
  );
}
