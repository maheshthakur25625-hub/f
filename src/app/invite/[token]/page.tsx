import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { one } from '@/lib/db';
import { acceptInviteAction } from '@/lib/actions/auth';
import { titleCase } from '@/lib/format';
import { ActionForm } from '@/components/form';
import { Card, Badge } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const session = await getSession();
  const invite = one<Record<string, any>>(
    `SELECT i.*, o.name AS org_name FROM invites i JOIN organizations o ON o.id = i.org_id WHERE i.token = ?`,
    [token],
  );

  return (
    <main className="grid min-h-screen place-items-center bg-[var(--bg)] px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-[14px] font-bold text-white">S</span>
          <span className="text-[15px] font-semibold tracking-tight">SpacePilot</span>
        </div>

        {!invite ? (
          <Card title="Invitation not found" subtitle="This link is invalid or was revoked.">
            <p className="text-[12.5px] muted">Ask your workspace administrator to send a new invitation.</p>
            <Link href="/login" className="btn btn-sm mt-4">Go to sign in</Link>
          </Card>
        ) : invite.accepted_at ? (
          <Card title="Invitation already used" subtitle={`This invite for ${invite.email} has been accepted.`}>
            <Link href="/app" className="btn btn-sm mt-2">Open workspace</Link>
          </Card>
        ) : (
          <Card
            title={`Join ${invite.org_name}`}
            subtitle={`You were invited as ${titleCase(invite.role)}.`}
            action={<Badge tone="brand">Invite</Badge>}
          >
            {!session ? (
              <div className="space-y-3">
                <p className="text-[12.5px] muted">
                  Sign in or create an account with <strong>{invite.email}</strong>, then open this link again to join.
                </p>
                <div className="flex gap-2">
                  <Link href="/login" className="btn btn-sm">Sign in</Link>
                  <Link href="/register" className="btn btn-sm btn-ghost">Create account</Link>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-[12.5px] muted">
                  Signed in as <strong>{session.email}</strong>. Accepting adds this workspace to your account.
                </p>
                <ActionForm action={acceptInviteAction} submit="Accept invitation">
                  <input type="hidden" name="token" value={token} />
                </ActionForm>
              </div>
            )}
          </Card>
        )}
      </div>
    </main>
  );
}
