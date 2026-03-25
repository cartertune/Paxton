import { useState, useEffect, useCallback } from 'react';
import type { Thread, DraftResult } from '../types';
import { api } from '../api/client';
import { getCachedBody, setCachedBody, getCachedDraft, setCachedDraft } from '../cache';

interface Props {
  thread: Thread;
  threads: Thread[]; // full list for prev/next navigation
  onClose: () => void;
  onNavigate: (thread: Thread) => void;
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  if (isToday) return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

const PREVIEW_LINES = 6;

export default function ThreadDetailPanel({ thread, threads, onClose, onNavigate }: Props) {
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

  const isNeedsReply = thread.buckets.includes('Needs Reply');

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

  const currentIndex = threads.findIndex((t) => t.id === thread.id);
  const prevThread = currentIndex > 0 ? threads[currentIndex - 1] : null;
  const nextThread = currentIndex < threads.length - 1 ? threads[currentIndex + 1] : null;

  useEffect(() => {
    setBody(null);
    setLoading(true);
    setError(false);
    setExpanded(false);

    const cachedDraft = getCachedDraft(thread.id);
    setDraftState(cachedDraft ? { status: 'done', result: cachedDraft } : { status: 'idle' });

    const generateDraftsIfNeeded = (bodyText: string) => {
      if (thread.buckets.includes('Needs Reply') && bodyText && !getCachedDraft(thread.id)) {
        setDraftState({ status: 'loading' });
        api.getDrafts(thread.id, thread.subject, thread.sender, bodyText)
          .then((result) => {
            setCachedDraft(thread.id, result);
            setDraftState({ status: 'done', result });
          })
          .catch(() => setDraftState({ status: 'error' }));
      }
    };

    const cachedBody = getCachedBody(thread.id);
    if (cachedBody) {
      setBody(cachedBody);
      setLoading(false);
      generateDraftsIfNeeded(cachedBody);
      return;
    }

    api.getThreadBody(thread.id)
      .then((res) => {
        setBody(res.body);
        setLoading(false);
        setCachedBody(thread.id, res.body);
        generateDraftsIfNeeded(res.body);
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

  // For collapsible body: split into lines and cap at PREVIEW_LINES
  const bodyLines = body ? body.split('\n') : [];
  const isLong = bodyLines.length > PREVIEW_LINES;
  const visibleBody = !expanded && isLong
    ? bodyLines.slice(0, PREVIEW_LINES).join('\n')
    : body ?? '';

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/20 z-30" onClick={onClose} />

      {/* Panel */}
      <div className="fixed top-0 right-0 h-full w-full max-w-lg bg-white shadow-xl z-40 flex flex-col">

        {/* Header */}
        <div className="px-5 py-3 border-b border-gray-200 shrink-0">
          {/* Top row: nav + close */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1">
              <button
                onClick={() => prevThread && onNavigate(prevThread)}
                disabled={!prevThread}
                title="Previous email (↑)"
                className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M18 15l-6-6-6 6" />
                </svg>
              </button>
              <button
                onClick={() => nextThread && onNavigate(nextThread)}
                disabled={!nextThread}
                title="Next email (↓)"
                className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
              <span className="text-xs text-gray-400 ml-1">
                {currentIndex + 1} / {threads.length}
              </span>
            </div>
            <button
              onClick={onClose}
              title="Close (Esc)"
              className="flex items-center gap-1.5 px-2 py-1 text-xs text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
              <span className="text-gray-300 font-mono text-xs border border-gray-200 rounded px-1">Esc</span>
            </button>
          </div>

          {/* Subject + sender */}
          <h2 className="text-sm font-semibold text-gray-900 leading-snug">{thread.subject}</h2>
          <p className="text-xs text-gray-500 mt-0.5">{thread.sender} · {formatTime(thread.timestamp)}</p>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">

          {/* Email body */}
          <div className="px-5 py-4 border-b border-gray-100">
            {loading && (
              <div className="space-y-2 animate-pulse">
                <div className="h-3 bg-gray-100 rounded w-3/4" />
                <div className="h-3 bg-gray-100 rounded w-full" />
                <div className="h-3 bg-gray-100 rounded w-5/6" />
                <div className="h-3 bg-gray-100 rounded w-2/3 mt-3" />
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
                    className="mt-3 text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors"
                  >
                    {expanded ? 'Show less' : `Show full email`}
                  </button>
                )}
              </>
            )}
          </div>

          {/* Classification */}
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Why these buckets?</h3>
            <div className="flex flex-col gap-2">
              {thread.buckets.map((b) => (
                <div key={b} className="flex gap-2.5 items-start">
                  <span className="mt-0.5 px-2 py-0.5 text-xs font-medium bg-blue-50 text-blue-700 rounded-full border border-blue-100 shrink-0 whitespace-nowrap">
                    {b}
                  </span>
                  <p className="text-xs text-gray-500 leading-relaxed">
                    {thread.bucketReasons[b] || 'No explanation available.'}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Draft replies — only for Needs Reply emails */}
          {isNeedsReply && (
            <div className="px-5 py-4">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Draft a reply</h3>

              {draftState.status === 'idle' && null}

              {draftState.status === 'loading' && (
                <div className="flex items-center gap-2 text-sm text-stone-400">
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Drafting replies…
                </div>
              )}

              {draftState.status === 'error' && (
                <div className="flex items-center gap-3">
                  <p className="text-xs text-red-400">Could not generate drafts.</p>
                  <button
                    onClick={handleGenerateDrafts}
                    className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                  >
                    Retry
                  </button>
                </div>
              )}

              {draftState.status === 'done' && (
                <div className="flex flex-col gap-3">
                  <p className="text-xs text-stone-400">
                    Detected: <span className="font-medium text-stone-600">{draftState.result.intentLabel}</span>
                  </p>
                  {draftState.result.drafts.map((draft, idx) => (
                    <div key={idx} className="border border-stone-200 rounded-lg overflow-hidden">
                      <div className="flex items-center justify-between px-3 py-2 bg-stone-50 border-b border-stone-200">
                        <span className="text-xs font-semibold text-stone-600">{draft.label}</span>
                        <button
                          onClick={() => handleCopy(draft.body, idx)}
                          className="flex items-center gap-1 text-xs text-stone-400 hover:text-stone-700 transition-colors"
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
                      <pre className="px-3 py-2.5 text-xs text-stone-700 whitespace-pre-wrap font-sans leading-relaxed max-h-40 overflow-y-auto">
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
