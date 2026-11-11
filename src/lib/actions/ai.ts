'use server';

import { redirect } from 'next/navigation';
import { allowed, requireWorkspace } from '../auth';
import { answer } from '../ai';

/** Plain form action: the question travels in the URL so the answer renders server-side. */
export async function askAction(fd: FormData): Promise<void> {
  const session = await requireWorkspace();
  const question = String(fd.get('question') ?? '').trim();
  if (!allowed(session, 'ai.use') || !question) redirect('/app/ai');
  redirect(`/app/ai?q=${encodeURIComponent(question.slice(0, 400))}`);
}

export async function answerFor(orgId: string, orgName: string, currency: string, locale: string, question: string) {
  return answer(question, { orgId, orgName, currency, locale });
}

