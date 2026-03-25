import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

const client = new Anthropic();

const SummarySchema = z.object({
  summary: z.string(),
  actionRequired: z.boolean(),
});

export type SummaryResult = z.infer<typeof SummarySchema>;

export async function generateSummary(
  subject: string,
  sender: string,
  body: string,
): Promise<SummaryResult> {
  const summaryTool = {
    name: 'summarize_email',
    description: 'Summarize an email and determine if action is required.',
    input_schema: {
      type: 'object' as const,
      properties: {
        summary: {
          type: 'string' as const,
          description:
            'Two-3 sentence plain-language summary: what the email is about, what is being asked, and who sent it. Be direct and specific.',
        },
        actionRequired: {
          type: 'boolean' as const,
          description:
            'true if the recipient needs to do something (reply, review, approve, etc.), false if it is informational',
        },
      },
      required: ['summary', 'actionRequired'] as const,
    },
  };

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    system:
      'You are a concise email assistant. Summarize emails in 2-3 sentences. Focus on: what the email is about, who sent it, and what action (if any) the recipient needs to take. Be specific and direct — avoid vague language like \'this email discusses\'.',
    messages: [
      {
        role: 'user',
        content: `Subject: ${subject}\nFrom: ${sender}\n\n${body.slice(0, 4000)}`,
      },
    ],
    tools: [summaryTool],
    tool_choice: { type: 'any' },
  });

  const toolUse = response.content.find((c) => c.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new Error('Summary generation failed');
  }

  return SummarySchema.parse(toolUse.input);
}
