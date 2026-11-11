import Link from 'next/link';
import { requireWorkspace, allowed } from '@/lib/auth';
import { answerFor, askAction, SUGGESTED_QUESTIONS } from '@/lib/actions/ai';
import { Badge, Card, EmptyState, PageHeader } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function AiPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const session = await requireWorkspace();
  const { q } = await searchParams;

  if (!allowed(session, 'ai.use')) {
    return (
      <div className="space-y-6">
        <PageHeader title="AI assistant" subtitle="Your role does not include AI insights." />
        <EmptyState title="No access" body="Ask a workspace owner for AI permissions on your role." icon="lock" />
      </div>
    );
  }

  const question = (q ?? '').trim();
  const result = question
    ? await answerFor(session.orgId!, session.orgName ?? 'your organization', session.currency, session.locale, question)
    : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI property assistant"
        eyebrow="Live data only"
        subtitle={`Answers are computed from ${session.orgName ?? 'your workspace'} records you are authorized to see.`}
      >
        <Badge tone="brand">Org-scoped</Badge>
        <Badge tone="neutral">Figures vs. projections labelled</Badge>
      </PageHeader>

      <Card title="Ask a question" subtitle="Natural language over your own portfolio, leases, bookings and billing.">
        <form action={askAction} className="flex flex-col gap-3 sm:flex-row">
          <input
            name="question"
            defaultValue={question}
            placeholder="Which property generated the highest revenue?"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            required
          />
          <button
            type="submit"
            className="inline-flex shrink-0 items-center justify-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700"
          >
            Ask assistant
          </button>
        </form>
        <div className="mt-4 flex flex-wrap gap-2">
          {SUGGESTED_QUESTIONS.map((s) => (
            <Link
              key={s}
              href={`/app/ai?q=${encodeURIComponent(s)}`}
              className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600 transition hover:border-brand-400 hover:text-brand-700 dark:border-slate-700 dark:text-slate-300 dark:hover:text-brand-300"
            >
              {s}
            </Link>
          ))}
        </div>
      </Card>

      {result && (
        <Card
          title="Answer"
          subtitle={question}
          action={<Badge tone="success">Computed from live records</Badge>}
        >
          <p className="text-base leading-relaxed text-slate-800 dark:text-slate-100">{result.answer}</p>
          {result.bullets.length > 0 && (
            <ul className="mt-4 space-y-2 text-sm text-slate-600 dark:text-slate-300">
              {result.bullets.map((b, i) => (
                <li key={`${b}-${i}`} className="flex gap-2">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          )}
          {result.prediction && (
            <div className="mt-5 rounded-xl border border-dashed border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide">Projection — not a recorded figure</div>
              {result.prediction}
            </div>
          )}
          <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
            Source: {result.source.replace('_', ' ')} · intent {result.kind.replace(/_/g, ' ')}. Ask another question to
            compare.
          </p>
        </Card>
      )}

      {!result && (
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { title: 'Revenue analysis', body: 'Rank properties by collected revenue and see who still owes you money.' },
            { title: 'Occupancy trends', body: 'Vacancy, desk utilisation and booking velocity across the last six months.' },
            { title: 'Renewals & follow-ups', body: 'Memberships and leases expiring soon, plus leads waiting on a reply.' },
          ].map((c) => (
            <div key={c.title} className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
              <div className="text-sm font-semibold text-slate-900 dark:text-white">{c.title}</div>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{c.body}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
