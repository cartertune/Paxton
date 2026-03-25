export interface Thread {
  id: string;
  subject: string;
  sender: string;
  snippet: string;
  timestamp: number;
  unread: boolean;
  buckets: string[];
  bucketReasons: Record<string, string>;
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
