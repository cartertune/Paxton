// Mirrors server/src/services/classifier.ts DEFAULT_HINTS
// Used to pre-populate hints on the client so settings always show a prompt
export const DEFAULT_HINTS: Record<string, string> = {
  Important: 'direct messages, requests requiring action, time-sensitive items from real people',
  'Needs Reply': 'emails containing a direct question or explicit request for a response',
  'Can Wait': 'FYI updates, non-urgent notifications, low-priority info',
  Newsletter: 'curated digests, blog subscriptions, Substack posts, weekly roundups',
  'Auto-archive': 'promotions, marketing, deals, shipping notifications, automated receipts',
};

/**
 * Returns a hint for a bucket name. If no known default exists,
 * generates a generic one from the name itself.
 */
export function getDefaultHint(name: string): string {
  return DEFAULT_HINTS[name] ?? '';
}
