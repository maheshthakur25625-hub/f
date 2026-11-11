import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { one } from '@/lib/db';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.orgId) return new NextResponse('Unauthorized', { status: 401 });
  const { id } = await params;

  const doc = one<{ name: string; mime: string; data: Uint8Array }>(
    `SELECT name, mime, data FROM documents WHERE id = ? AND org_id = ?`,
    [id, session.orgId],
  );
  if (!doc) return new NextResponse('Not found', { status: 404 });

  return new NextResponse(new Uint8Array(doc.data), {
    headers: {
      'Content-Type': doc.mime,
      'Content-Disposition': `inline; filename="${doc.name.replace(/"/g, '')}"`,
      'Cache-Control': 'private, max-age=300',
    },
  });
}
