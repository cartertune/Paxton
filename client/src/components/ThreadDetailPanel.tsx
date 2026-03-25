import { useState, useEffect, useCallback, useMemo } from 'react';
import type { Thread, Bucket, DraftResult, SummaryResult } from '../types';
import { api } from '../api/client';
import { getCachedBody, setCachedBody, getCachedDraft, setCachedDraft, getCachedSummary, setCachedSummary } from '../cache';
import { getSenderStats } from '../utils';

interface Props {
  thread: Thread;
  threads: Thread[]; // full list for prev/next navigation
  buckets: Bucket[];
  onClose: () => void;
  onNavigate: (thread: Thread) => void;
  onArchive: (threadId: string) => void;
  onMarkRead: (threadId: string) => void;
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  if (isToday) return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

const PREVIEW_LINES = 8;

// Bucket color map — consistent pill colors per bucket type
function bucketColor(name: string): string {
  const map: Record<string, string> = {
    'Important': 'bg-violet-50 text-violet-700 border-violet-200',
    'Needs Reply': 'bg-sky-50 text-sky-700 border-sky-200',
    'Can Wait': 'bg-stone-100 text-stone-600 border-stone-200',
    'Newsletter': 'bg-emerald-50 text-emerald-700 border-emerald-200',
    'Auto-archive': 'bg-stone-100 text-stone-400 border-stone-200',
  };
  return map[name] ?? 'bg-blue-50 text-blue-700 border-blue-100';
}

export default function ThreadDetailPanel({ thread, threads, buckets, onClose, onNavigate, onArchive, onMarkRead }: Props) {
  const bucketMap = useMemo(() => new Map(buckets.map((b) => [b.id, b.name])), [buckets]);
  const needsReplyId = useMemo(() => buckets.find((b) => b.name === 'Needs Reply')?.id, [buckets]);
  const [body, setBody] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [expanded, setExpanded] = useState(false);

  type DraftState =
    | { status: 'idle' }
    | { status: 'loading' }
    | { status: 'done'; result: DraftResult }
    | { status: 'error' };
  const [draftState, setDraftState] = useState<DraftState>({ status: 'idle' });
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  type SummaryState =
    | { status: 'idle' }
    | { status: 'loading' }
    | { status: 'done'; result: SummaryResult }
    | { status: 'error' };
  const [summaryState, setSummaryState] = useState<SummaryState>({ status: 'idle' });

  const [archiving, setArchiving] = useState(false);
  const [markingRead, setMarkingRead] = useState(false);

  const senderStats = useMemo(
    () => getSenderStats(thread.sender, threads, bucketMap, needsReplyId),
    [thread.sender, threads, bucketMap, needsReplyId]
  );

  const isNeedsReply = needsReplyId ? thread.bucketIds.includes(needsReplyId) : false;

  const handleGenerateDrafts = async () => {
    if (!body) return;
    setDraftState({ status: 'loading' });
    try {
      const result = await api.getDrafts(thread.id, thread.subject, thread.sender, body);
      setCachedDraft(thread.id, result);
      setDraftState({ status: 'done', result });
    } catch {
      setDraftState({ status: 'error' });
    }
  };

  const handleCopy = (text: string, idx: number) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 2000);
    });
  };

  const handleArchive = async () => {
    setArchiving(true);
    try {
      await api.archive(thread.id);
      onArchive(thread.id);
    } catch {
      setArchiving(false);
    }
  };

  const handleMarkRead = async () => {
    if (!thread.unread) return;
    setMarkingRead(true);
    try {
      await api.markRead(thread.id);
      onMarkRead(thread.id);
    } catch {
      setMarkingRead(false);
    }
  };

  const currentIndex = threads.findIndex((t) => t.id === thread.id);
  const prevThread = currentIndex > 0 ? threads[currentIndex - 1] : null;
  const nextThread = currentIndex < threads.length - 1 ? threads[currentIndex + 1] : null;

  useEffect(() => {
    setBody(null);
    setLoading(true);
    setError(false);
    setExpanded(false);
    setSummaryState({ status: 'idle' });

    const cachedDraft = getCachedDraft(thread.id);
    setDraftState(cachedDraft ? { status: 'done', result: cachedDraft } : { status: 'idle' });

    const cachedSummary = getCachedSummary(thread.id);
    if (cachedSummary) setSummaryState({ status: 'done', result: cachedSummary });

    const generateDraftsIfNeeded = (bodyText: string) => {
      if (isNeedsReply && bodyText && !getCachedDraft(thread.id)) {
        setDraftState({ status: 'loading' });
        api.getDrafts(thread.id, thread.subject, thread.sender, bodyText)
          .then((result) => {
            setCachedDraft(thread.id, result);
            setDraftState({ status: 'done', result });
          })
          .catch(() => setDraftState({ status: 'error' }));
      }
    };

    const generateSummaryIfNeeded = (bodyText: string) => {
      if (!getCachedSummary(thread.id)) {
        setSummaryState({ status: 'loading' });
        api.getSummary(thread.id, thread.subject, thread.sender, bodyText)
          .then((result) => {
            setCachedSummary(thread.id, result);
            setSummaryState({ status: 'done', result });
          })
          .catch(() => setSummaryState({ status: 'error' }));
      }
    };

    const cachedBody = getCachedBody(thread.id);
    if (cachedBody) {
      setBody(cachedBody);
      setLoading(false);
      generateDraftsIfNeeded(cachedBody);
      generateSummaryIfNeeded(cachedBody);
      return;
    }

    api.getThreadBody(thread.id)
      .then((res) => {
        setBody(res.body);
        setLoading(false);
        setCachedBody(thread.id, res.body);
        generateDraftsIfNeeded(res.body);
        generateSummaryIfNeeded(res.body);
      })
      .catch(() => { setError(true); setLoading(false); });
  }, [thread.id]);

  // Keyboard: Esc to close, arrow keys to navigate
  const handleKey = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') { onClose(); return; }
    if (e.key === 'ArrowUp' && prevThread) { onNavigate(prevThread); return; }
    if (e.key === 'ArrowDown' && nextThread) { onNavigate(nextThread); return; }
  }, [onClose, onNavigate, prevThread, nextThread]);

  useEffect(() => {
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [handleKey]);

  // For collapsible body
  const bodyLines = body ? body.split('\n') : [];
  const isLong = bodyLines.length > PREVIEW_LINES;
  const visibleBody = !expanded && isLong
    ? bodyLines.slice(0, PREVIEW_LINES).join('\n')
    : body ?? '';

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/25 z-30" onClick={onClose} />

      {/* Panel — wider: max-w-2xl */}
      <div className="fixed top-0 right-0 h-full w-full max-w-2xl bg-white shadow-2xl z-40 flex flex-col">

        {/* ── Toolbar ── */}
        <div className="flex items-center justify-between px-5 py-2.5 border-b border-gray-100 shrink-0 bg-gray-50/80">
          {/* Left: nav + actions */}
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => prevThread && onNavigate(prevThread)}
              disabled={!prevThread}
              title="Previous email (↑)"
              className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-200/60 rounded-md transition-colors disabled:opacity-25 disabled:cursor-not-allowed"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M18 15l-6-6-6 6" />
              </svg>
            </button>
            <button
              onClick={() => nextThread && onNavigate(nextThread)}
              disabled={!nextThread}
              title="Next email (↓)"
              className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-200/60 rounded-md transition-colors disabled:opacity-25 disabled:cursor-not-allowed"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            <span className="text-xs text-gray-400 mx-2 tabular-nums">
              {currentIndex + 1} / {threads.length}
            </span>

            <div className="w-px h-4 bg-gray-200 mx-1" />

            <button
              onClick={handleMarkRead}
              disabled={!thread.unread || markingRead}
              title="Mark as read"
              className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-200/60 rounded-md transition-colors disabled:opacity-25 disabled:cursor-not-allowed"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </button>
            <button
              onClick={handleArchive}
              disabled={archiving}
              title="Archive"
              className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-200/60 rounded-md transition-colors disabled:opacity-25 disabled:cursor-not-allowed"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <polyline points="21 8 21 21 3 21 3 8" />
                <rect x="1" y="3" width="22" height="5" />
                <line x1="10" y1="12" x2="14" y2="12" />
              </svg>
            </button>
          </div>

          {/* Right: Gmail link + close */}
          <div className="flex items-center gap-0.5">
            <a
              href={`https://mail.google.com/mail/u/0/#all/${thread.id}`}
              target="_blank"
              rel="noopener noreferrer"
              title="Open in Gmail"
              className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-200/60 rounded-md transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </a>
            <button
              onClick={onClose}
              title="Close (Esc)"
              className="flex items-center gap-1.5 pl-1.5 pr-2 py-1 text-xs text-gray-400 hover:text-gray-700 hover:bg-gray-200/60 rounded-md transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
              <span className="text-gray-300 font-mono text-[10px] border border-gray-200 rounded px-1">Esc</span>
            </button>
          </div>
        </div>

        {/* ── Identity header ── */}
        <div className="px-6 pt-5 pb-4 border-b border-gray-100 shrink-0">
          {/* Bucket pills */}
          <div className="flex flex-wrap gap-1.5 mb-3">
            {thread.bucketIds.map((id) => {
              const name = bucketMap.get(id) ?? id;
              return (
                <span
                  key={id}
                  className={`text-xs font-medium px-2.5 py-0.5 rounded-full border ${bucketColor(name)}`}
                >
                  {name}
                </span>
              );
            })}
          </div>

          {/* Subject — large and prominent */}
          <h2 className="text-xl font-semibold text-gray-900 leading-snug mb-2">
            {thread.subject}
          </h2>

          {/* Sender + time row */}
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-stone-200 flex items-center justify-center shrink-0">
              <span className="text-xs font-semibold text-stone-600 leading-none">
                {thread.sender.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-800 truncate">{thread.sender}</p>
              {senderStats ? (
                <p className="text-xs text-stone-400 leading-tight">
                  {formatTime(thread.timestamp)}
                  {` · ${senderStats.count} threads`}
                  {senderStats.topBuckets.length > 0 && ` · Usually: ${senderStats.topBuckets.join(', ')}`}
                </p>
              ) : (
                <p className="text-xs text-stone-400">{formatTime(thread.timestamp)}</p>
              )}
            </div>
          </div>
        </div>

        {/* ── Scrollable content ── */}
        <div className="flex-1 overflow-y-auto">

          {/* AI Summary */}
          {summaryState.status === 'loading' && !loading && (
            <div className="mx-6 mt-5 p-4 bg-stone-50 border border-stone-200 rounded-xl animate-pulse">
              <div className="h-2.5 bg-stone-200 rounded w-20 mb-3" />
              <div className="h-3.5 bg-stone-200 rounded w-full mb-2" />
              <div className="h-3.5 bg-stone-200 rounded w-5/6 mb-2" />
              <div className="h-3.5 bg-stone-200 rounded w-3/4" />
            </div>
          )}
          {summaryState.status === 'done' && (
            <div className="mx-6 mt-5 p-4 bg-stone-50 border border-stone-200 rounded-xl">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">AI Summary</span>
                {summaryState.result.actionRequired && (
                  <span className="text-[10px] font-semibold bg-amber-100 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5 uppercase tracking-wide">
                    Action required
                  </span>
                )}
              </div>
              <p className="text-sm text-stone-700 leading-relaxed">{summaryState.result.summary}</p>
            </div>
          )}

          {/* Email body */}
          <div className="px-6 py-5 border-b border-gray-100">
            {loading && (
              <div className="space-y-2.5 animate-pulse">
                <div className="h-3 bg-gray-100 rounded w-3/4" />
                <div className="h-3 bg-gray-100 rounded w-full" />
                <div className="h-3 bg-gray-100 rounded w-5/6" />
                <div className="h-3 bg-gray-100 rounded w-2/3 mt-4" />
                <div className="h-3 bg-gray-100 rounded w-full" />
                <div className="h-3 bg-gray-100 rounded w-4/5" />
              </div>
            )}
            {error && (
              <p className="text-sm text-gray-400 italic">Could not load message body.</p>
            )}
            {!loading && !error && (
              <>
                <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">
                  {visibleBody || '(No content)'}
                </pre>
                {isLong && (
                  <button
                    onClick={() => setExpanded((v) => !v)}
                    className="mt-4 text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors"
                  >
                    {expanded ? 'Show less' : 'Show full email'}
                  </button>
                )}
              </>
            )}
          </div>

          {/* Classification reasons */}
          <div className="px-6 py-5 border-b border-gray-100">
            <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Why these buckets?</h3>
            <div className="flex flex-col gap-3">
              {thread.bucketIds.map((id) => {
                const name = bucketMap.get(id) ?? id;
                return (
                <div key={id} className="flex gap-3 items-start">
                  <span className={`mt-0.5 px-2.5 py-0.5 text-xs font-medium rounded-full border shrink-0 whitespace-nowrap ${bucketColor(name)}`}>
                    {name}
                  </span>
                  <p className="text-sm text-gray-500 leading-relaxed">
                    {thread.bucketReasons[id] || 'No explanation available.'}
                  </p>
                </div>
                );
              })}
            </div>
          </div>

          {/* Draft replies — only for Needs Reply */}
          {isNeedsReply && (
            <div className="px-6 py-5">
              <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">Draft a reply</h3>

              {draftState.status === 'idle' && null}

              {draftState.status === 'loading' && (
                <div className="flex items-center gap-2.5 text-sm text-stone-400 py-2">
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Drafting replies…
                </div>
              )}

              {draftState.status === 'error' && (
                <div className="flex items-center gap-3">
                  <p className="text-sm text-red-400">Could not generate drafts.</p>
                  <button
                    onClick={handleGenerateDrafts}
                    className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                  >
                    Retry
                  </button>
                </div>
              )}

              {draftState.status === 'done' && (
                <div className="flex flex-col gap-4">
                  <p className="text-xs text-stone-400">
                    Detected intent: <span className="font-semibold text-stone-600">{draftState.result.intentLabel}</span>
                  </p>
                  {draftState.result.drafts.map((draft, idx) => (
                    <div key={idx} className="border border-stone-200 rounded-xl overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-2.5 bg-stone-50 border-b border-stone-200">
                        <span className="text-xs font-semibold text-stone-700">{draft.label}</span>
                        <button
                          onClick={() => handleCopy(draft.body, idx)}
                          className="flex items-center gap-1.5 text-xs text-stone-400 hover:text-stone-700 transition-colors"
                        >
                          {copiedIdx === idx ? (
                            <>
                              <svg className="w-3.5 h-3.5 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                                <path d="M20 6 9 17l-5-5" />
                              </svg>
                              <span className="text-green-600 font-medium">Copied</span>
                            </>
                          ) : (
                            <>
                              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                              </svg>
                              Copy
                            </>
                          )}
                        </button>
                      </div>
                      {/* No max-h cap — show full draft */}
                      <pre className="px-4 py-3 text-sm text-stone-700 whitespace-pre-wrap font-sans leading-relaxed">
                        {draft.body}
                      </pre>
                    </div>
                  ))}
                  <button
                    onClick={handleGenerateDrafts}
                    className="text-xs text-stone-400 hover:text-stone-600 self-start transition-colors"
                  >
                    Regenerate
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
