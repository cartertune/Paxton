export interface Thread {
  id: string;
  subject: string;
  sender: string;
  snippet: string;
  timestamp: number;
  unread: boolean;
  bucketIds: string[];
  bucketReasons: Record<string, string>; // keyed by bucket ID
}

export interface Bucket {
  id: string;
  name: string;
  hint?: string;
}

export interface DraftReply {
  label: string;
  body: string;
}

export interface DraftResult {
  intent: string;
  intentLabel: string;
  drafts: DraftReply[];
}

export interface SummaryResult {
  summary: string;
  actionRequired: boolean;
}

export interface BucketSuggestion {
  name: string;
  hint: string;
  matchCount: number;
  rationale: string;
}
