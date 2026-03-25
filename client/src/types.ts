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
