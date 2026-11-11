import Link from 'next/link';
import { requireWorkspace } from '@/lib/auth';
import { all } from '@/lib/db';
import { markAllNotificationsReadAction, markNotificationReadAction } from '@/lib/actions/notifications';
import { timeAgo } from '@/lib/format';
import { Card, PageHeader, EmptyState, Badge } from '@/components/ui';
import { GhostSubmit } from '@/components/form';

export const dynamic = 'force-dynamic';

export default async function NotificationsPage() {
  const session = await requireWorkspace();
  const items = all<Record<string, any>>(
    `SELECT * FROM notifications WHERE org_id = ? AND (user_id = ? OR user_id IS NULL)
      ORDER BY created_at DESC LIMIT 100`,
    [session.orgId!, session.userId],
  );
  const unread = items.filter((n) => !n.read_at).length;

  return (
    <div className="space-y-6">
      <PageHeader title="Notifications" eyebrow="Inbox" subtitle="Booking confirmations, payment receipts, reminders and escalations.">
        {unread > 0 && <Badge tone="warn">{unread} unread</Badge>}
        {unread > 0 && (
          <form action={markAllNotificationsReadAction}>
            <GhostSubmit label="Mark all read" className="btn btn-sm" />
          </form>
        )}
      </PageHeader>

      <Card pad={false}>
        {items.length === 0 ? (
          <div className="px-5 pb-5">
            <EmptyState title="No notifications yet" body="Automations and workspace events will appear here." />
          </div>
        ) : (
          <ul className="divide-y divide-[var(--line)]">
            {items.map((n) => (
              <li key={n.id} className={`flex items-start justify-between gap-4 px-5 py-3.5 ${n.read_at ? 'opacity-70' : ''}`}>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {!n.read_at && <span className="h-1.5 w-1.5 rounded-full bg-brand" />}
                    <p className="text-[13px] font-medium">{n.title}</p>
                    <Badge tone={n.kind === 'warning' ? 'warn' : n.kind === 'success' ? 'ok' : n.kind === 'error' ? 'bad' : 'neutral'}>
                      {n.kind ?? 'info'}
                    </Badge>
                  </div>
                  {n.body && <p className="mt-1 text-[12.5px] muted">{n.body}</p>}
                  <p className="mt-1 text-[11px] muted">{timeAgo(n.created_at)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {n.link && (
                    <Link href={n.link} className="btn btn-ghost btn-sm">
                      Open
                    </Link>
                  )}
                  {!n.read_at && (
                    <form action={markNotificationReadAction}>
                      <input type="hidden" name="id" value={n.id} />
                      <GhostSubmit label="Read" />
                    </form>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
