import type { Thread } from '../types';

interface Props {
  thread: Thread;
  onClick: () => void;
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

export default function EmailRow({ thread, onClick }: Props) {
  const snippet = unescapeHtml(thread.snippet);
  const { unread } = thread;

  return (
    <div
      onClick={onClick}
      className={`group flex items-center gap-3 px-4 py-2.5 border-b cursor-pointer transition-colors ${
        unread
          ? 'bg-white border-stone-150 hover:bg-blue-50/40'
          : 'bg-stone-50/60 border-stone-100 hover:bg-stone-100/70'
      }`}
    >
      {/* Unread indicator — left accent bar */}
      <div className="w-1 shrink-0 self-stretch flex items-center">
        <div className={`w-1 rounded-full transition-all ${unread ? 'h-full bg-blue-500' : 'h-0'}`} />
      </div>

      {/* Sender */}
      <span
        className={`w-40 shrink-0 text-sm truncate ${
          unread ? 'font-semibold text-stone-900' : 'font-normal text-stone-500'
        }`}
      >
        {thread.sender}
      </span>

      {/* Subject + snippet */}
      <span className="flex-1 text-sm truncate min-w-0">
        <span className={unread ? 'font-semibold text-stone-900' : 'font-normal text-stone-700'}>
          {thread.subject}
        </span>
        <span className="text-stone-400 font-normal text-[0.8rem]">
          &ensp;{snippet}
        </span>
      </span>

      {/* Timestamp */}
      <span
        className={`text-xs shrink-0 tabular-nums ${
          unread ? 'font-medium text-stone-700' : 'text-stone-400'
        }`}
      >
        {formatTime(thread.timestamp)}
      </span>
    </div>
  );
}
