import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

const client = new Anthropic();

export type EmailIntent = 'question' | 'request' | 'meeting' | 'feedback' | 'fyi' | 'other';

export interface DraftReply {
  label: string;
  body: string;
}

export interface DraftResult {
  intent: EmailIntent;
  intentLabel: string;
  drafts: DraftReply[];
}

const INTENT_LABELS: Record<EmailIntent, string> = {
  question: 'Question',
  request: 'Action request',
  meeting: 'Meeting request',
  feedback: 'Feedback request',
  fyi: 'FYI / informational',
  other: 'General',
};

const DRAFT_VARIANTS: Record<EmailIntent, string[]> = {
  question:  ['Direct answer', 'Ask for clarification', 'Acknowledge and defer'],
  request:   ['Accept with timeline', 'Decline with reason', 'Partial accept'],
  meeting:   ['Accept', 'Decline politely', 'Propose alternative time'],
  feedback:  ['Positive response', 'Constructive pushback', 'Request more context'],
  fyi:       ['Acknowledge', 'Acknowledge with follow-up question'],
  other:     ['Reply option 1', 'Reply option 2'],
};

const IntentSchema = z.object({
  intent: z.enum(['question', 'request', 'meeting', 'feedback', 'fyi', 'other']),
  context: z.string(),
});

const DraftsSchema = z.object({
  drafts: z.array(
    z.object({
      label: z.string(),
      body: z.string(),
    })
  ).min(2).max(3),
});

export async function generateDraftReplies(
  subject: string,
  sender: string,
  body: string,
): Promise<DraftResult> {
  // Stage 1: detect intent
  const intentTool = {
    name: 'detect_intent',
    description: 'Detect the intent of an incoming email that needs a reply.',
    input_schema: {
      type: 'object' as const,
      properties: {
        intent: {
          type: 'string' as const,
          enum: ['question', 'request', 'meeting', 'feedback', 'fyi', 'other'],
          description: 'The primary intent of the email.',
        },
        context: {
          type: 'string' as const,
          description: '1-2 sentences summarizing what exactly the sender is asking for or needs.',
        },
      },
      required: ['intent', 'context'] as const,
    },
  };

  const intentMessage = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    system: 'You are an email assistant. Analyze the incoming email and detect its primary intent.',
    messages: [{
      role: 'user',
      content: `From: ${sender}\nSubject: ${subject}\n\n${body.slice(0, 2000)}`,
    }],
    tools: [intentTool],
    tool_choice: { type: 'any' },
  });

  const intentToolUse = intentMessage.content.find((c) => c.type === 'tool_use');
  if (!intentToolUse || intentToolUse.type !== 'tool_use') {
    throw new Error('Intent detection failed');
  }
  const { intent, context } = IntentSchema.parse(intentToolUse.input);
  const variants = DRAFT_VARIANTS[intent];

  // Stage 2: generate drafts for detected intent
  const draftsTool = {
    name: 'generate_drafts',
    description: 'Generate reply draft options for the email.',
    input_schema: {
      type: 'object' as const,
      properties: {
        drafts: {
          type: 'array' as const,
          items: {
            type: 'object' as const,
            properties: {
              label: { type: 'string' as const, description: 'Short label for this draft option (e.g. "Accept", "Decline politely")' },
              body: { type: 'string' as const, description: 'Full reply email body text, ready to send' },
            },
            required: ['label', 'body'] as const,
            additionalProperties: false,
          },
          minItems: variants.length,
          maxItems: variants.length,
        },
      },
      required: ['drafts'] as const,
    },
  };

  const variantDescriptions = variants.map((v, i) => `${i + 1}. ${v}`).join('\n');

  const draftsMessage = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: `You are a professional email assistant. Write concise, natural-sounding reply drafts.
Each draft should be substantively different — not just different wording, but a different approach or answer.
Write in first person. Do not include a subject line. Do not add "[Your Name]" placeholders — end cleanly.`,
    messages: [{
      role: 'user',
      content: `Original email:
From: ${sender}
Subject: ${subject}

${body.slice(0, 2000)}

---
Context: ${context}

Generate exactly ${variants.length} reply drafts with these distinct approaches:
${variantDescriptions}`,
    }],
    tools: [draftsTool],
    tool_choice: { type: 'any' },
  });

  const draftsToolUse = draftsMessage.content.find((c) => c.type === 'tool_use');
  if (!draftsToolUse || draftsToolUse.type !== 'tool_use') {
    throw new Error('Draft generation failed');
  }
  const { drafts } = DraftsSchema.parse(draftsToolUse.input);

  return {
    intent,
    intentLabel: INTENT_LABELS[intent],
    drafts,
  };
}
