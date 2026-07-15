import React, { useCallback, useEffect, useMemo, useState } from 'react';

interface FeedbackRow {
  id: string;
  original_question: string;
  original_answer: string;
  correction: string;
  target_type: string;
  status: string;
  submitted_by: string;
  created_at: string;
}

interface AdminData {
  feedback: FeedbackRow[];
  knowledge: Array<Record<string, any>>;
  conversations: Array<Record<string, any>>;
  settings: Array<Record<string, any>>;
}

const emptyData: AdminData = { feedback: [], knowledge: [], conversations: [], settings: [] };
const formatDate = (value: string) => new Date(value).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' });

export const AiAgentAdminView: React.FC = () => {
  const [data, setData] = useState<AdminData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/business-agent-admin', { credentials: 'same-origin' });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Agent administration data could not be loaded.');
      setData({
        feedback: Array.isArray(result.feedback) ? result.feedback : [],
        knowledge: Array.isArray(result.knowledge) ? result.knowledge : [],
        conversations: Array.isArray(result.conversations) ? result.conversations : [],
        settings: Array.isArray(result.settings) ? result.settings : []
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Agent administration data could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  const pending = useMemo(() => data.feedback.filter((row) => row.status === 'PENDING'), [data.feedback]);

  const review = async (feedbackId: string, action: 'APPROVE_FEEDBACK' | 'REJECT_FEEDBACK') => {
    setWorkingId(feedbackId);
    setMessage('');
    try {
      const response = await fetch('/api/business-agent-admin', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, feedbackId, visibility: 'INTERNAL' })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Correction review failed.');
      setMessage(result.message || 'Review saved.');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Correction review failed.');
    } finally {
      setWorkingId('');
    }
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 p-4 md:p-6">
      <header className="rounded-xl border border-gp-border bg-gp-panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gp-red">Admin only</p>
            <h1 className="mt-1 text-2xl font-black uppercase text-gp-text-main">AI Intelligence Control</h1>
            <p className="mt-2 max-w-3xl text-sm text-gp-text-muted">Review staff corrections, approved business knowledge, conversations and active safety rules. Customer messages never update trusted knowledge directly.</p>
          </div>
          <button onClick={() => void load()} disabled={loading} className="rounded-lg border border-gp-border bg-gp-input px-4 py-2 text-xs font-black uppercase tracking-wider text-gp-text-main hover:border-gp-red disabled:opacity-50">Refresh</button>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['Pending corrections', pending.length, 'Awaiting admin decision'],
          ['Approved knowledge', data.knowledge.filter((row) => row.status === 'APPROVED').length, 'Versioned trusted records'],
          ['Recent conversations', data.conversations.length, 'Latest 40 sessions'],
          ['Active rule sets', data.settings.filter((row) => row.enabled).length, 'Pricing, fitment and response controls']
        ].map(([label, value, note]) => (
          <div key={String(label)} className="rounded-xl border border-gp-border bg-gp-panel p-4">
            <p className="text-[10px] font-black uppercase tracking-wider text-gp-text-muted">{label}</p>
            <p className="mt-2 text-3xl font-black text-gp-text-main">{value}</p>
            <p className="mt-1 text-[10px] text-gp-text-muted">{note}</p>
          </div>
        ))}
      </div>

      {message && <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-3 text-sm font-bold text-blue-300">{message}</div>}

      <section className="overflow-hidden rounded-xl border border-gp-border bg-gp-panel">
        <div className="border-b border-gp-border p-4">
          <h2 className="text-sm font-black uppercase tracking-wider text-gp-text-main">Pending staff corrections</h2>
          <p className="mt-1 text-xs text-gp-text-muted">Approve only corrections that should become reusable internal business knowledge.</p>
        </div>
        {loading ? (
          <div className="p-8 text-center text-sm text-gp-text-muted">Loading AI controls...</div>
        ) : pending.length === 0 ? (
          <div className="p-8 text-center text-sm text-gp-text-muted">No corrections are waiting for approval.</div>
        ) : (
          <div className="divide-y divide-gp-border">
            {pending.map((row) => (
              <article key={row.id} className="p-4">
                <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-gp-text-muted">
                  <span className="rounded bg-amber-500/15 px-2 py-1 text-amber-300">{row.target_type.replace(/_/g, ' ')}</span>
                  <span>{row.submitted_by}</span>
                  <span>{formatDate(row.created_at)}</span>
                </div>
                <div className="mt-3 grid gap-3 lg:grid-cols-3">
                  <div className="rounded-lg border border-gp-border bg-gp-black/30 p-3"><p className="text-[9px] font-black uppercase tracking-wider text-gp-text-muted">Question</p><p className="mt-1 text-xs text-gp-text-main">{row.original_question}</p></div>
                  <div className="rounded-lg border border-gp-border bg-gp-black/30 p-3"><p className="text-[9px] font-black uppercase tracking-wider text-gp-text-muted">Original answer</p><p className="mt-1 line-clamp-5 text-xs text-gp-text-main">{row.original_answer}</p></div>
                  <div className="rounded-lg border border-green-500/25 bg-green-500/5 p-3"><p className="text-[9px] font-black uppercase tracking-wider text-green-400">Proposed correction</p><p className="mt-1 text-xs text-gp-text-main">{row.correction}</p></div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button disabled={workingId === row.id} onClick={() => void review(row.id, 'APPROVE_FEEDBACK')} className="rounded-lg bg-green-600 px-4 py-2 text-[10px] font-black uppercase tracking-wider text-white disabled:opacity-50">Approve as knowledge</button>
                  <button disabled={workingId === row.id} onClick={() => void review(row.id, 'REJECT_FEEDBACK')} className="rounded-lg border border-red-500/40 px-4 py-2 text-[10px] font-black uppercase tracking-wider text-red-400 disabled:opacity-50">Reject</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="rounded-xl border border-gp-border bg-gp-panel p-4">
          <h2 className="text-sm font-black uppercase tracking-wider text-gp-text-main">Approved knowledge</h2>
          <div className="mt-3 max-h-80 space-y-2 overflow-y-auto">
            {data.knowledge.filter((row) => row.status === 'APPROVED').map((row) => (
              <div key={row.id} className="rounded-lg border border-gp-border bg-gp-black/25 p-3">
                <div className="flex items-start justify-between gap-3"><p className="text-xs font-bold text-gp-text-main">{row.title}</p><span className="shrink-0 text-[9px] text-gp-text-muted">v{row.version}</span></div>
                <p className="mt-1 text-[10px] uppercase tracking-wider text-gp-text-muted">{row.category} · {row.visibility}</p>
              </div>
            ))}
          </div>
        </section>
        <section className="rounded-xl border border-gp-border bg-gp-panel p-4">
          <h2 className="text-sm font-black uppercase tracking-wider text-gp-text-main">Recent conversations</h2>
          <div className="mt-3 max-h-80 space-y-2 overflow-y-auto">
            {data.conversations.map((row) => (
              <div key={row.id} className="flex items-center justify-between gap-3 rounded-lg border border-gp-border bg-gp-black/25 p-3">
                <div><p className="text-xs font-bold text-gp-text-main">{row.terminal_id}{row.staff_name ? ` · ${row.staff_name}` : ''}</p><p className="mt-1 text-[10px] uppercase tracking-wider text-gp-text-muted">{row.mode} · {row.status}</p></div>
                <p className="shrink-0 text-[9px] text-gp-text-muted">{formatDate(row.updated_at)}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};

