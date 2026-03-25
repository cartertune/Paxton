import type { Thread } from '../types';

interface Props {
  thread: Thread;
  onClick: () => void;
  showBucket?: boolean;
}

function unescapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&#x27;': "'",
    '&nbsp;': ' ',
  };
  return text.replace(/&[a-z0-9#]+;/gi, (entity) => map[entity] ?? entity);
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const isThisYear = date.getFullYear() === now.getFullYear();

  if (isToday) {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  }
  if (isThisYear) {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function EmailRow({ thread, onClick, showBucket }: Props) {
  const snippet = unescapeHtml(thread.snippet);
  const { unread } = thread;
  const primaryBucket = thread.buckets[0];

  return (
    <div
      onClick={onClick}
      className={`group px-4 py-3 border-b cursor-pointer transition-colors ${
        unread
          ? 'bg-white hover:bg-blue-50/30 border-stone-150'
          : 'bg-stone-50/50 hover:bg-stone-100/60 border-stone-100'
      }`}
    >
      {/* Row 1: unread dot + sender + timestamp */}
      <div className="flex items-center justify-between gap-2 mb-0.5">
        <div className="flex items-center gap-2 min-w-0">
          {/* Unread dot */}
          <div
            className={`w-1.5 h-1.5 rounded-full shrink-0 transition-all ${
              unread ? 'bg-blue-500' : 'bg-transparent'
            }`}
          />
          {/* Sender */}
          <span
            className={`text-sm truncate ${
              unread ? 'font-semibold text-stone-900' : 'font-normal text-stone-400'
            }`}
          >
            {thread.sender}
          </span>
        </div>
        {/* Timestamp */}
        <span
          className={`text-xs shrink-0 tabular-nums ${
            unread ? 'font-medium text-stone-600' : 'text-stone-400'
          }`}
        >
          {formatTime(thread.timestamp)}
        </span>
      </div>

      {/* Row 2: subject + snippet + optional bucket pill */}
      <div className="flex items-baseline gap-1.5 pl-3.5 min-w-0">
        <span
          className={`text-sm truncate shrink-0 max-w-[45%] ${
            unread ? 'font-medium text-stone-800' : 'text-stone-500'
          }`}
        >
          {thread.subject}
        </span>
        <span className="text-xs text-stone-400 truncate min-w-0 flex-1">
          {snippet}
        </span>
        {showBucket && primaryBucket && (
          <span className="ml-1 shrink-0 text-[10px] px-1.5 py-0.5 rounded-full border bg-stone-50 text-stone-400 border-stone-200 leading-none">
            {primaryBucket}
          </span>
        )}
      </div>
    </div>
  );
}
