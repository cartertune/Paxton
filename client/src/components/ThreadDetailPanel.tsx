import { useState, useEffect, useCallback } from 'react';
import type { Thread } from '../types';
import { api } from '../api/client';

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

  const currentIndex = threads.findIndex((t) => t.id === thread.id);
  const prevThread = currentIndex > 0 ? threads[currentIndex - 1] : null;
  const nextThread = currentIndex < threads.length - 1 ? threads[currentIndex + 1] : null;

  useEffect(() => {
    setBody(null);
    setLoading(true);
    setError(false);
    setExpanded(false);
    api.getThreadBody(thread.id)
      .then((res) => { setBody(res.body); setLoading(false); })
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

          {/* Actions */}
          <div className="px-5 py-4">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Actions</h3>
            <div className="border border-dashed border-gray-200 rounded-lg px-4 py-5 text-center text-xs text-gray-300">
              Actions coming soon
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
