import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ActionForm } from '@/components/form';
import { Field } from '@/components/ui';
import { loginAction } from '@/lib/actions/auth';
import { getSession } from '@/lib/auth';

export const metadata = { title: 'Sign in · SpacePilot' };

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect(session.role === 'member' ? '/portal' : '/app');

  return (
    <>
      <h1 className="text-[24px] font-semibold tracking-[-0.02em]">Welcome back</h1>
      <p className="mt-1 text-[13px] muted">Sign in to your SpacePilot workspace.</p>

      <ActionForm action={loginAction} submit="Sign in" className="mt-6 space-y-3.5" pendingLabel="Signing in…">
        <Field label="Work email" name="email" type="email" placeholder="you@company.com" required />
        <Field label="Password" name="password" type="password" placeholder="••••••••" required />
      </ActionForm>

      <div className="mt-5 rounded-xl border border-line bg-surface2 px-3.5 py-3">
        <p className="text-[11.5px] font-semibold uppercase tracking-[0.08em] muted">Demo workspace</p>
        <p className="mt-1 text-[12.5px]">
          Owner: <span className="font-medium">avery@helix.space</span> · Manager: <span className="font-medium">marcus@helix.space</span>
        </p>
        <p className="text-[12.5px]">
          Member portal: <span className="font-medium">nina@northwind.io</span> · Password: <span className="font-medium">SpacePilot123!</span>
        </p>
      </div>

      <p className="mt-6 text-center text-[12.5px] muted">
        New to SpacePilot?{' '}
        <Link href="/register" className="font-medium text-brand hover:underline">
          Create an account
        </Link>
      </p>
    </>
  );
}
