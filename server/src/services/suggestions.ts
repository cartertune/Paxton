import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

const client = new Anthropic();

interface ThreadSummary {
  subject: string;
  sender: string;
  snippet: string;
  buckets: string[];
}

const SuggestionSchema = z.object({
  name: z.string(),
  hint: z.string(),
  matchCount: z.number(),
  rationale: z.string(),
});

const SuggestionsResponseSchema = z.object({
  suggestions: z.array(SuggestionSchema),
});

export type BucketSuggestion = z.infer<typeof SuggestionSchema>;

export async function suggestBuckets(threads: ThreadSummary[]): Promise<BucketSuggestion[]> {
  const filtered = threads.filter(
    (t) => t.buckets.includes('Can Wait') || t.buckets.length === 0,
  );

  if (filtered.length < 10) {
    return [];
  }

  const sample = filtered.slice(0, 100);

  const userMessage = sample
    .map((t, i) => `${i + 1}. Subject: ${t.subject} | From: ${t.sender}`)
    .join('\n');

  const suggestTool = {
    name: 'suggest_buckets',
    description: 'Suggest new email bucket categories based on patterns in uncategorized emails.',
    input_schema: {
      type: 'object' as const,
      properties: {
        suggestions: {
          type: 'array' as const,
          description: 'List of suggested buckets, max 2 items',
          items: {
            type: 'object' as const,
            properties: {
              name: {
                type: 'string' as const,
                description: 'Short bucket name, 2-3 words max',
              },
              hint: {
                type: 'string' as const,
                description:
                  'One sentence describing what emails belong in this bucket, used as an AI classifier hint',
              },
              matchCount: {
                type: 'number' as const,
                description: 'Estimated number of emails in the provided list that match this bucket',
              },
              rationale: {
                type: 'string' as const,
                description: 'One sentence explaining why this bucket would be useful',
              },
            },
            required: ['name', 'hint', 'matchCount', 'rationale'] as const,
          },
        },
      },
      required: ['suggestions'] as const,
    },
  };

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system:
      "You are an inbox organization assistant. Analyze the user's uncategorized emails and identify 1-2 recurring patterns that would benefit from a dedicated bucket. Only suggest buckets where at least 5 emails clearly match. Be specific (e.g., 'Job Recruiters', 'GitHub Notifications', 'Order Confirmations') not vague (e.g., 'Work Emails'). If there are no clear patterns with 5+ matches, return an empty suggestions array.",
    messages: [
      {
        role: 'user',
        content: userMessage,
      },
    ],
    tools: [suggestTool],
    tool_choice: { type: 'any' },
  });

  const toolUse = response.content.find((c) => c.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new Error('Bucket suggestion failed');
  }

  const { suggestions } = SuggestionsResponseSchema.parse(toolUse.input);

  return suggestions
    .filter((s) => s.matchCount >= 5)
    .slice(0, 2);
}
