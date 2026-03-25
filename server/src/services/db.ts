import Database from 'better-sqlite3';
import path from 'path';

const db = new Database(path.join(process.cwd(), 'paxton.db'));

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS user_buckets (
    email TEXT NOT NULL,
    name TEXT NOT NULL,
    hint TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (email, name)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS token_store (
    session_id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    tokens TEXT NOT NULL  -- JSON-serialized Credentials object
  )
`);

export interface BucketRow {
  email: string;
  name: string;
  hint: string | null;
  sort_order: number;
}

export function getBuckets(email: string): BucketRow[] {
  return db.prepare('SELECT * FROM user_buckets WHERE email = ? ORDER BY sort_order ASC').all(email) as BucketRow[];
}

export function saveBuckets(email: string, buckets: Array<{ name: string; hint?: string }>): void {
  const upsert = db.prepare(
    'INSERT INTO user_buckets (email, name, hint, sort_order) VALUES (?, ?, ?, ?) ON CONFLICT(email, name) DO UPDATE SET hint = excluded.hint, sort_order = excluded.sort_order'
  );
  const deleteOld = db.prepare('DELETE FROM user_buckets WHERE email = ? AND name NOT IN (SELECT value FROM json_each(?))');

  const tx = db.transaction(() => {
    buckets.forEach((b, i) => upsert.run(email, b.name, b.hint ?? null, i));
    deleteOld.run(email, JSON.stringify(buckets.map((b) => b.name)));
  });
  tx();
}

export function deleteBucket(email: string, name: string): void {
  db.prepare('DELETE FROM user_buckets WHERE email = ? AND name = ?').run(email, name);
}

export function dbGetToken(sessionId: string): { email: string; tokens: any } | undefined {
  const row = db.prepare('SELECT email, tokens FROM token_store WHERE session_id = ?').get(sessionId) as { email: string; tokens: string } | undefined;
  if (!row) return undefined;
  return { email: row.email, tokens: JSON.parse(row.tokens) };
}

export function dbSetToken(sessionId: string, email: string, tokens: any): void {
  db.prepare(
    'INSERT INTO token_store (session_id, email, tokens) VALUES (?, ?, ?) ON CONFLICT(session_id) DO UPDATE SET email = excluded.email, tokens = excluded.tokens'
  ).run(sessionId, email, JSON.stringify(tokens));
}

export function dbUpdateTokens(sessionId: string, tokens: any): void {
  const existing = dbGetToken(sessionId);
  if (!existing) return;
  const merged = { ...existing.tokens, ...tokens };
  db.prepare('UPDATE token_store SET tokens = ? WHERE session_id = ?').run(JSON.stringify(merged), sessionId);
}

export function dbDeleteToken(sessionId: string): void {
  db.prepare('DELETE FROM token_store WHERE session_id = ?').run(sessionId);
}

export default db;
