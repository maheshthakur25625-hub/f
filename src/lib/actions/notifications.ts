'use server';

import { revalidatePath } from 'next/cache';
import { one, run } from '../db';
import { getSession, requireWorkspace } from '../auth';

export async function markNotificationReadAction(fd: FormData): Promise<void> {
  const session = await getSession();
  if (!session?.orgId) return;
  const id = String(fd.get('id') ?? '');
  if (!id) return;
  run(`UPDATE notifications SET read_at = ? WHERE id = ? AND org_id = ? AND (user_id = ? OR user_id IS NULL)`, [
    new Date().toISOString(),
    id,
    session.orgId,
    session.userId,
  ]);
  revalidatePath('/app/notifications');
}

export async function markAllNotificationsReadAction(): Promise<void> {
  const session = await requireWorkspace();
  run(`UPDATE notifications SET read_at = ? WHERE org_id = ? AND read_at IS NULL AND (user_id = ? OR user_id IS NULL)`, [
    new Date().toISOString(),
    session.orgId!,
    session.userId,
  ]);
  revalidatePath('/app/notifications');
}
