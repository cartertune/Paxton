/**
 * Email classifier — uses Claude to sort inbox threads into user-defined buckets.
 *
 * Flow:
 *   1. Threads are split into batches of BATCH_SIZE (10) to keep prompts within token limits.
 *   2. Each batch is sent to Claude as a single prompt. Claude is forced to respond via
 *      tool-use (structured output), which constrains bucket names to an enum and
 *      guarantees valid JSON back — no fragile string parsing.
 *   3. Claude produces a hidden "reasoning" field (chain-of-thought) per email, then
 *      assigns one or more bucket names plus a short per-bucket justification. The
 *      reasoning field is stripped before results are returned to the client.
 *   4. Cheap string-derived signals (has_unsubscribe, from_noreply, is_reply_or_fwd)
 *      are appended to each thread line so Claude doesn't burn reasoning budget on
 *      obvious cases.
 *   5. "Auto-archive" is exclusive: if a thread lands there, all other buckets are dropped.
 *   6. Batches are classified in parallel (Promise.allSettled). Failed batches fall back
 *      to the first bucket rather than crashing the whole response.
 *   7. classifyThreadsStreaming fires an onBatch callback as each batch resolves,
 *      enabling SSE progress updates to the client (used by /classify/stream).
 *      classifyThreads is the non-streaming variant used by /classify/incremental.
 */

import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import type { RawThread } from './gmail';

const client = new Anthropic();

const BATCH_SIZE = 10;

export const DEFAULT_HINTS: Record<string, string> = {
  Important: 'direct messages, requests requiring action, time-sensitive items from real people',
  'Needs Reply': 'emails containing a direct question or explicit request for a response',
  'Can Wait': 'FYI updates, non-urgent notifications, low-priority info',
  Newsletter: 'curated digests, blog subscriptions, Substack posts, weekly roundups',
  'Auto-archive': 'promotions, marketing, deals, shipping notifications, automated receipts',
};

export interface BucketDef {
  name: string;
  hint?: string;
}

const BatchResultSchema = z.array(
  z.object({
    id: z.string(),
    reasoning: z.string().optional(), // hidden CoT — stripped before returning to client
    buckets: z.array(z.string()).min(1),
    bucketReasons: z.record(z.string(), z.string()),
  }),
);

export interface ClassifiedThread {
  id: string;
  subject: string;
  sender: string;
  snippet: string;
  timestamp: number;
  unread: boolean;
  buckets: string[];
  bucketReasons: Record<string, string>;
}

function buildBucketDescriptions(bucketDefs: BucketDef[]): string {
  return bucketDefs
    .map((b) => {
      const hint = b.hint ?? DEFAULT_HINTS[b.name];
      return hint ? `- ${b.name}: ${hint}` : `- ${b.name}`;
    })
    .join('\n');
}

// If a thread is in Auto-archive, it should not appear in any other bucket
function enforceAutoArchiveExclusivity<T extends { buckets: string[]; bucketReasons: Record<string, string> }>(result: T): T {
  if (result.buckets.some((b) => b.toLowerCase() === 'auto-archive')) {
    const kept = result.buckets.filter((b) => b.toLowerCase() === 'auto-archive');
    const keptReasons: Record<string, string> = {};
    for (const b of kept) keptReasons[b] = result.bucketReasons[b] ?? '';
    return { ...result, buckets: kept, bucketReasons: keptReasons };
  }
  return result;
}

// Cheap string-derived signals to help Claude without burning reasoning budget
function getSignals(thread: RawThread): string {
  const signals: string[] = [];
  const snippetLower = thread.snippet.toLowerCase();
  const subjectLower = thread.subject.toLowerCase();
  if (snippetLower.includes('unsubscribe') || snippetLower.includes('opt out')) signals.push('has_unsubscribe');
  if (subjectLower.startsWith('re:') || subjectLower.startsWith('fwd:')) signals.push('is_reply_or_fwd');
  if (/noreply|no-reply|donotreply/.test(thread.sender.toLowerCase())) signals.push('from_noreply');
  return signals.length ? ` [${signals.join(', ')}]` : '';
}

async function classifyBatch(
  batch: RawThread[],
  bucketDefs: BucketDef[],
): Promise<Array<{ id: string; buckets: string[]; bucketReasons: Record<string, string> }>> {
  const bucketNames = bucketDefs.map((b) => b.name);
  const bucketDescriptions = buildBucketDescriptions(bucketDefs);

  const threadLines = batch
    .map((t) => {
      const snippet = t.snippet.replace(/\n/g, ' ').slice(0, 120);
      const signals = getSignals(t);
      return `<id:${t.id}> From: ${t.sender} | Subject: ${t.subject} | Snippet: ${snippet}${signals}`;
    })
    .join('\n');

  const systemPrompt = `You are an email triage assistant. Classify each email thread into one or more of the provided buckets.

Buckets:
${bucketDescriptions}

Rules:
- An email can belong to multiple buckets if it genuinely fits more than one.
- Only include "Important" if you are highly confident this is a direct, personal email requiring action from a real person.
- Signals in brackets (has_unsubscribe, from_noreply, is_reply_or_fwd) are strong classification hints — use them.

For each email:
1. First write a brief "reasoning" capturing your overall read of the email.
2. Then assign "buckets" (array of matching bucket names).
3. Then write "bucketReasons" — one short sentence per assigned bucket explaining why.`;

  const userPrompt = `Classify these email threads into buckets: [${bucketNames.join(', ')}]

Threads:
${threadLines}`;

  // Tool-use structured output: enum-constrained bucket names, guaranteed valid JSON
  const tool = {
    name: 'classify_emails',
    description: 'Output classification results for all emails in the batch.',
    input_schema: {
      type: 'object' as const,
      properties: {
        results: {
          type: 'array' as const,
          items: {
            type: 'object' as const,
            properties: {
              id: { type: 'string' as const },
              reasoning: { type: 'string' as const },
              buckets: { type: 'array' as const, items: { type: 'string' as const, enum: bucketNames } },
              bucketReasons: { type: 'object' as const, additionalProperties: { type: 'string' as const } },
            },
            required: ['id', 'reasoning', 'buckets', 'bucketReasons'] as const,
            additionalProperties: false,
          },
        },
      },
      required: ['results'] as const,
    },
  };

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
    tools: [tool],
    tool_choice: { type: 'any' },
  });

  const toolUse = message.content.find((c) => c.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use') throw new Error('No tool call in response');

  const parsed = BatchResultSchema.parse((toolUse.input as { results: unknown }).results);
  // Strip the hidden reasoning field — client never sees it
  return parsed
    .map(({ reasoning: _reasoning, ...rest }) => rest)
    .map(enforceAutoArchiveExclusivity);
}

export async function classifyThreads(
  threads: RawThread[],
  bucketDefs: BucketDef[],
): Promise<ClassifiedThread[]> {
  if (threads.length === 0) return [];

  const batches: RawThread[][] = [];
  for (let i = 0; i < threads.length; i += BATCH_SIZE) {
    batches.push(threads.slice(i, i + BATCH_SIZE));
  }

  const settledResults = await Promise.allSettled(
    batches.map((batch) => classifyBatch(batch, bucketDefs)),
  );

  const bucketMap = new Map<string, { buckets: string[]; bucketReasons: Record<string, string> }>();

  settledResults.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      for (const item of result.value) {
        bucketMap.set(item.id, { buckets: item.buckets, bucketReasons: item.bucketReasons });
      }
    } else {
      for (const t of batches[i]) {
        bucketMap.set(t.id, { buckets: [bucketDefs[0].name], bucketReasons: { [bucketDefs[0].name]: 'Classification unavailable' } });
      }
    }
  });

  return threads.map((t) => {
    const result = bucketMap.get(t.id) ?? { buckets: [bucketDefs[0].name], bucketReasons: { [bucketDefs[0].name]: 'Classification unavailable' } };
    return { ...t, ...result };
  });
}

// Streaming variant: classifies batches and calls onBatch as each one resolves
export async function classifyThreadsStreaming(
  threads: RawThread[],
  bucketDefs: BucketDef[],
  onBatch: (results: ClassifiedThread[], completedBatches: number, totalBatches: number) => void,
): Promise<void> {
  if (threads.length === 0) return;

  const batches: RawThread[][] = [];
  for (let i = 0; i < threads.length; i += BATCH_SIZE) {
    batches.push(threads.slice(i, i + BATCH_SIZE));
  }

  const totalBatches = batches.length;
  let completedBatches = 0;

  await Promise.allSettled(
    batches.map(async (batch) => {
      let items: Array<{ id: string; buckets: string[]; bucketReasons: Record<string, string> }>;
      try {
        items = await classifyBatch(batch, bucketDefs);
      } catch {
        items = batch.map((t) => ({ id: t.id, buckets: [bucketDefs[0].name], bucketReasons: { [bucketDefs[0].name]: 'Classification unavailable' } }));
      }

      const batchMap = new Map(items.map((item) => [item.id, item]));
      const classifiedBatch: ClassifiedThread[] = batch.map((t) => {
        const r = batchMap.get(t.id) ?? { buckets: [bucketDefs[0].name], bucketReasons: { [bucketDefs[0].name]: 'Classification unavailable' } };
        return { ...t, ...r };
      });

      completedBatches++;
      onBatch(classifiedBatch, completedBatches, totalBatches);
    }),
  );
}
