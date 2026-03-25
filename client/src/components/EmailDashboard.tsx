import { useState, useEffect, useRef, useMemo } from 'react';
import type { Thread, BucketSuggestion } from '../types';
import EmailRow from './EmailRow';
import AddBucketModal from './AddBucketModal';
import ThreadDetailPanel from './ThreadDetailPanel';

function groupThreadsByDate(threads: Thread[]): { label: string; threads: Thread[] }[] {
  const now = new Date();
  const todayStr = now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toDateString();

  const today: Thread[] = [];
  const yesterdayGroup: Thread[] = [];
  const thisWeek: Thread[] = [];
  const older: Thread[] = [];

  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);

  for (const t of threads) {
    const d = new Date(t.timestamp);
    const ds = d.toDateString();
    if (ds === todayStr) today.push(t);
    else if (ds === yesterdayStr) yesterdayGroup.push(t);
    else if (d >= weekAgo) thisWeek.push(t);
    else older.push(t);
  }

  const groups: { label: string; threads: Thread[] }[] = [];
  if (today.length) groups.push({ label: 'Today', threads: today });
  if (yesterdayGroup.length) groups.push({ label: 'Yesterday', threads: yesterdayGroup });
  if (thisWeek.length) groups.push({ label: 'This week', threads: thisWeek });
  if (older.length) groups.push({ label: 'Older', threads: older });
  return groups;
}

interface Props {
  threads: Thread[];
  buckets: string[];
  userEmail: string | null;
  onAddBucket: (name: string, hint?: string) => void;
  onSync: () => void;
  onLogout: () => void;
  onOpenSettings: () => void;
  isClassifying: boolean;
  lastSyncedAt: Date | null;
  bucketSuggestions: BucketSuggestion[];
  onDismissSuggestion: (name: string) => void;
  onAcceptSuggestion: (suggestion: BucketSuggestion) => void;
  onRemoveThread: (id: string) => void;
  onMarkThreadRead: (id: string) => void;
}

const ALL_TAB = 'All';

export default function EmailDashboard({ threads, buckets, userEmail, onAddBucket, onSync, onLogout, onOpenSettings, isClassifying, lastSyncedAt, bucketSuggestions, onDismissSuggestion, onAcceptSuggestion, onRemoveThread, onMarkThreadRead }: Props) {
  const [activeTab, setActiveTab] = useState<string>('Important');
  const [showAddBucket, setShowAddBucket] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedThread, setSelectedThread] = useState<Thread | null>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
    }
    if (showUserMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showUserMenu]);

  const resolvedTab = activeTab === ALL_TAB || buckets.includes(activeTab) ? activeTab : ALL_TAB;

  const countFor = (bucketName: string) =>
    bucketName === ALL_TAB
      ? threads.length
      : threads.filter((t) => t.buckets.includes(bucketName)).length;

  const unreadCountFor = (bucketName: string) =>
    bucketName === ALL_TAB
      ? threads.filter((t) => t.unread).length
      : threads.filter((t) => t.buckets.includes(bucketName) && t.unread).length;

  const activeThreads = (
    resolvedTab === ALL_TAB
      ? threads
      : threads.filter((t) => t.buckets.includes(resolvedTab))
  ).slice().sort((a, b) => b.timestamp - a.timestamp);

  const displayedThreads = searchQuery.trim()
    ? threads.filter((t) => {
        const q = searchQuery.toLowerCase();
        return (
          t.sender.toLowerCase().includes(q) ||
          t.subject.toLowerCase().includes(q) ||
          t.snippet.toLowerCase().includes(q)
        );
      }).slice().sort((a, b) => b.timestamp - a.timestamp)
    : activeThreads;

  const threadGroups = useMemo(() => groupThreadsByDate(displayedThreads), [displayedThreads]);

  const handleAddBucket = (name: string, hint?: string) => {
    onAddBucket(name, hint);
    setActiveTab(name);
  };

  // Keep the bar visible at 100% for a moment after classification finishes
  const [showProgress, setShowProgress] = useState(false);
  const [displayPct, setDisplayPct] = useState(0);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isClassifying) {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      setDisplayPct(50);
      setShowProgress(true);
    } else if (showProgress) {
      // Classification just finished — hold at 100%, then fade out
      setDisplayPct(100);
      hideTimerRef.current = setTimeout(() => setShowProgress(false), 800);
    }
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isClassifying]);

  return (
    <div className="flex flex-col h-screen bg-stone-50">
      {/* Top nav */}
      <nav className="h-14 bg-white border-b border-stone-200 flex items-center justify-between px-5 shrink-0 z-10">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
              <rect x="2" y="4" width="20" height="16" rx="2" stroke="#EA4335" strokeWidth="1.5" />
              <path d="M2 7l10 7 10-7" stroke="#EA4335" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <span className="font-semibold text-base text-stone-900">Paxton</span>
          </div>
          {showProgress ? (
            <div className="w-32 h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-500"
                style={{ width: `${displayPct}%` }}
              />
            </div>
          ) : (
            <div className="flex items-center gap-2">
              {lastSyncedAt && (
                <span className="text-xs text-stone-400">
                  Synced {lastSyncedAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                </span>
              )}
              <button
                onClick={onSync}
                disabled={isClassifying}
                title="Sync & reclassify"
                className="flex items-center gap-1 px-2 py-1 text-xs text-stone-500 hover:text-stone-800 hover:bg-stone-100 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                  <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                  <path d="M16 21h5v-5" />
                </svg>
                Sync
              </button>
            </div>
          )}
        </div>

        {/* Search */}
        <div className="flex-1 flex justify-center px-4">
          <div className="relative w-full max-w-sm">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search emails…"
              className="w-full pl-9 pr-8 py-1.5 text-sm bg-stone-100 border border-transparent rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-colors placeholder-stone-400"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        <div className="relative" ref={userMenuRef}>
          <button
            onClick={() => setShowUserMenu((v) => !v)}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-stone-700 bg-white border border-stone-300 hover:bg-stone-50 rounded-lg transition-colors"
          >
            {userEmail && (
              <span className="w-6 h-6 rounded-full bg-stone-200 text-stone-700 text-xs font-semibold flex items-center justify-center shrink-0">
                {userEmail[0].toUpperCase()}
              </span>
            )}
            <span className="hidden sm:block max-w-[160px] truncate">{userEmail ?? 'Account'}</span>
            <svg className="w-3.5 h-3.5 text-stone-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>

          {showUserMenu && (
            <div className="absolute right-0 mt-1 w-48 bg-white border border-stone-200 rounded-lg shadow-md z-50 overflow-hidden">
              <button
                onClick={() => { setShowUserMenu(false); onSync(); }}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-stone-700 hover:bg-stone-50 transition-colors text-left"
              >
                <svg className="w-4 h-4 text-stone-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                  <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                  <path d="M16 21h5v-5" />
                </svg>
                Sync & reclassify
              </button>
              <button
                onClick={() => { setShowUserMenu(false); onOpenSettings(); }}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-stone-700 hover:bg-stone-50 transition-colors text-left"
              >
                <svg className="w-4 h-4 text-stone-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
                Settings
              </button>
              <button
                onClick={() => { setShowUserMenu(false); onLogout(); }}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-stone-700 hover:bg-stone-50 transition-colors text-left"
              >
                <svg className="w-4 h-4 text-stone-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                Logout
              </button>
            </div>
          )}
        </div>
      </nav>

      {/* Bucket suggestion banners */}
      {bucketSuggestions.length > 0 && (
        <div className="border-b border-blue-100 bg-blue-50">
          {bucketSuggestions.map((s) => (
            <div key={s.name} className="flex items-center gap-3 px-4 py-2.5">
              <svg className="w-4 h-4 text-blue-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" />
              </svg>
              <p className="text-xs text-blue-800 flex-1">
                <span className="font-medium">Suggestion:</span> Create a &ldquo;{s.name}&rdquo; bucket ({s.matchCount} matching emails)
              </p>
              <button
                onClick={() => onAcceptSuggestion(s)}
                className="text-xs font-medium text-blue-700 hover:text-blue-900 px-2 py-1 bg-white border border-blue-200 rounded-md hover:bg-blue-50 transition-colors shrink-0"
              >
                Add bucket
              </button>
              <button
                onClick={() => onDismissSuggestion(s.name)}
                className="text-xs text-blue-400 hover:text-blue-600 transition-colors shrink-0"
              >
                Dismiss
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Horizontal tab bar */}
      <div className="bg-white border-b border-stone-200 shrink-0 shadow-sm">
        <div className="flex items-center px-4 overflow-x-auto">
          {[ALL_TAB, ...buckets].map((tab) => {
            const count = countFor(tab);
            const unreadCount = unreadCountFor(tab);
            const isActive = tab === resolvedTab;
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex items-center gap-1.5 px-3 py-3 text-sm whitespace-nowrap border-b-2 transition-colors ${
                  isActive
                    ? 'border-blue-600 text-blue-600 font-medium'
                    : 'border-transparent text-stone-500 hover:text-stone-900 hover:border-stone-300'
                }`}
              >
                <span>{tab}</span>
                {unreadCount > 0 && tab === 'Important' ? (
                  <span className="text-xs font-bold rounded-full px-1.5 py-0.5 min-w-[1.25rem] text-center bg-blue-500 text-white">
                    {unreadCount}
                  </span>
                ) : count > 0 ? (
                  <span
                    className={`text-xs font-medium rounded-full px-1.5 py-0.5 min-w-[1.25rem] text-center ${
                      isActive ? 'bg-blue-50 text-blue-500' : 'bg-stone-100 text-stone-400'
                    }`}
                  >
                    {count}
                  </span>
                ) : null}
              </button>
            );
          })}

          {/* Add bucket button at end of tab bar */}
          <button
            onClick={() => setShowAddBucket(true)}
            className="flex items-center gap-1 px-3 py-3 text-sm text-stone-400 hover:text-stone-700 whitespace-nowrap border-b-2 border-transparent transition-colors ml-1"
          >
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            <span>Add bucket</span>
          </button>
        </div>

      </div>

      {searchQuery && (
        <div className="px-4 py-2 text-xs text-stone-400 border-b border-stone-100">
          {displayedThreads.length} result{displayedThreads.length !== 1 ? 's' : ''} for "{searchQuery}"
        </div>
      )}

      {/* Thread list */}
      <main className="flex-1 overflow-y-auto">
        {activeThreads.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-stone-400">
            {isClassifying ? (
              <>
                <svg className="w-7 h-7 animate-spin text-blue-400" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <p className="text-sm text-stone-500">Classifying your emails…</p>
                <p className="text-xs text-stone-400">Results will appear as each batch completes</p>
              </>
            ) : (
              <>
                <svg className="w-8 h-8 opacity-40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="2" y="4" width="20" height="16" rx="2" />
                  <path d="M2 7l10 7 10-7" />
                </svg>
                <p className="text-sm">No emails here</p>
              </>
            )}
          </div>
        ) : (
          threadGroups.map((group) => (
            <div key={group.label}>
              <div className="px-5 py-1.5 bg-stone-50 border-b border-stone-100">
                <span className="text-[0.7rem] font-semibold uppercase tracking-widest text-stone-400 select-none">
                  {group.label}
                </span>
              </div>
              {group.threads.map((t) => (
                <EmailRow key={t.id} thread={t} onClick={() => setSelectedThread(t)} showBucket={resolvedTab === ALL_TAB} />
              ))}
            </div>
          ))
        )}
      </main>

      {showAddBucket && (
        <AddBucketModal
          existingBuckets={buckets}
          onAdd={(name, hint) => handleAddBucket(name, hint)}
          onClose={() => setShowAddBucket(false)}
        />
      )}

      {selectedThread && (
        <ThreadDetailPanel
          thread={selectedThread}
          threads={displayedThreads}
          onClose={() => setSelectedThread(null)}
          onNavigate={(t) => setSelectedThread(t)}
          onArchive={(id) => { onRemoveThread(id); setSelectedThread(null); }}
          onMarkRead={(id) => onMarkThreadRead(id)}
        />
      )}
    </div>
  );
}
