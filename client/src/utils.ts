import type { Thread } from './types';

export interface SenderStats {
  count: number;
  topBuckets: string[];
  needsReplyCount: number;
}

/**
 * Compute stats for a given sender across the full thread list.
 * Returns null if the sender has no other threads (i.e. count === 0).
 */
export function getSenderStats(
  sender: string,
  threads: Thread[],
  bucketMap: Map<string, string> = new Map(),
  needsReplyId?: string,
): SenderStats | null {
  const senderThreads = threads.filter((t) => t.sender === sender);
  if (senderThreads.length === 0) return null;

  // Tally bucket frequencies by name
  const bucketCounts: Record<string, number> = {};
  for (const t of senderThreads) {
    for (const id of t.bucketIds) {
      const name = bucketMap.get(id) ?? id;
      bucketCounts[name] = (bucketCounts[name] ?? 0) + 1;
    }
  }

  // Top 2 buckets by frequency
  const topBuckets = Object.entries(bucketCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([name]) => name);

  const needsReplyCount = needsReplyId
    ? senderThreads.filter((t) => t.bucketIds.includes(needsReplyId)).length
    : 0;

  return { count: senderThreads.length, topBuckets, needsReplyCount };
}
