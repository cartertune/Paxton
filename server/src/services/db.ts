import { Pool } from "pg";
import Database from "better-sqlite3";
import path from "path";

// Determine which database to use based on DATABASE_URL environment variable
const DATABASE_URL = process.env.DATABASE_URL;
const usePostgres = !!DATABASE_URL;

// PostgreSQL client (Railway production)
let pool: Pool | null = null;
if (usePostgres) {
  pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: DATABASE_URL.includes("railway.app")
      ? { rejectUnauthorized: false }
      : undefined,
  });
  console.log("✓ Using PostgreSQL database");
}

// SQLite client (local development)
let sqlite: Database.Database | null = null;
if (!usePostgres) {
  sqlite = new Database(path.join(process.cwd(), "paxton.db"));
  console.log("✓ Using SQLite database (local dev)");
}

// Initialize schema
async function initSchema() {
  if (usePostgres && pool) {
    // PostgreSQL schema
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_buckets (
        email TEXT NOT NULL,
        name TEXT NOT NULL,
        hint TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (email, name)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS token_store (
        session_id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        tokens TEXT NOT NULL
      )
    `);
  } else if (sqlite) {
    // SQLite schema
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS user_buckets (
        email TEXT NOT NULL,
        name TEXT NOT NULL,
        hint TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (email, name)
      )
    `);

    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS token_store (
        session_id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        tokens TEXT NOT NULL
      )
    `);
  }
}

// Initialize on module load
initSchema().catch(console.error);

export interface BucketRow {
  email: string;
  name: string;
  hint: string | null;
  sort_order: number;
}

export async function getBuckets(email: string): Promise<BucketRow[]> {
  if (usePostgres && pool) {
    const result = await pool.query(
      "SELECT * FROM user_buckets WHERE email = $1 ORDER BY sort_order ASC",
      [email],
    );
    return result.rows;
  } else if (sqlite) {
    return sqlite
      .prepare(
        "SELECT * FROM user_buckets WHERE email = ? ORDER BY sort_order ASC",
      )
      .all(email) as BucketRow[];
  }
  return [];
}

export async function saveBuckets(
  email: string,
  buckets: Array<{ name: string; hint?: string }>,
): Promise<void> {
  if (usePostgres && pool) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Upsert each bucket
      for (let i = 0; i < buckets.length; i++) {
        const bucket = buckets[i];
        await client.query(
          `INSERT INTO user_buckets (email, name, hint, sort_order)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (email, name)
           DO UPDATE SET hint = EXCLUDED.hint, sort_order = EXCLUDED.sort_order`,
          [email, bucket.name, bucket.hint ?? null, i],
        );
      }

      // Delete buckets not in the list
      const bucketNames = buckets.map((b) => b.name);
      if (bucketNames.length > 0) {
        await client.query(
          "DELETE FROM user_buckets WHERE email = $1 AND name NOT IN (" +
            bucketNames.map((_, i) => `$${i + 2}`).join(", ") +
            ")",
          [email, ...bucketNames],
        );
      } else {
        await client.query("DELETE FROM user_buckets WHERE email = $1", [
          email,
        ]);
      }

      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  } else if (sqlite) {
    const upsert = sqlite.prepare(
      "INSERT INTO user_buckets (email, name, hint, sort_order) VALUES (?, ?, ?, ?) ON CONFLICT(email, name) DO UPDATE SET hint = excluded.hint, sort_order = excluded.sort_order",
    );
    const deleteOld = sqlite.prepare(
      "DELETE FROM user_buckets WHERE email = ? AND name NOT IN (SELECT value FROM json_each(?))",
    );

    const tx = sqlite.transaction(() => {
      buckets.forEach((b, i) => upsert.run(email, b.name, b.hint ?? null, i));
      deleteOld.run(email, JSON.stringify(buckets.map((b) => b.name)));
    });
    tx();
  }
}

export async function deleteBucket(email: string, name: string): Promise<void> {
  if (usePostgres && pool) {
    await pool.query(
      "DELETE FROM user_buckets WHERE email = $1 AND name = $2",
      [email, name],
    );
  } else if (sqlite) {
    sqlite
      .prepare("DELETE FROM user_buckets WHERE email = ? AND name = ?")
      .run(email, name);
  }
}

export async function dbGetToken(
  sessionId: string,
): Promise<{ email: string; tokens: any } | undefined> {
  if (usePostgres && pool) {
    const result = await pool.query(
      "SELECT email, tokens FROM token_store WHERE session_id = $1",
      [sessionId],
    );
    if (result.rows.length === 0) return undefined;
    const row = result.rows[0];
    return { email: row.email, tokens: JSON.parse(row.tokens) };
  } else if (sqlite) {
    const row = sqlite
      .prepare("SELECT email, tokens FROM token_store WHERE session_id = ?")
      .get(sessionId) as { email: string; tokens: string } | undefined;
    if (!row) return undefined;
    return { email: row.email, tokens: JSON.parse(row.tokens) };
  }
  return undefined;
}

export async function dbSetToken(
  sessionId: string,
  email: string,
  tokens: any,
): Promise<void> {
  if (usePostgres && pool) {
    await pool.query(
      `INSERT INTO token_store (session_id, email, tokens)
       VALUES ($1, $2, $3)
       ON CONFLICT(session_id)
       DO UPDATE SET email = EXCLUDED.email, tokens = EXCLUDED.tokens`,
      [sessionId, email, JSON.stringify(tokens)],
    );
  } else if (sqlite) {
    sqlite
      .prepare(
        "INSERT INTO token_store (session_id, email, tokens) VALUES (?, ?, ?) ON CONFLICT(session_id) DO UPDATE SET email = excluded.email, tokens = excluded.tokens",
      )
      .run(sessionId, email, JSON.stringify(tokens));
  }
}

export async function dbUpdateTokens(
  sessionId: string,
  tokens: any,
): Promise<void> {
  const existing = await dbGetToken(sessionId);
  if (!existing) return;
  const merged = { ...existing.tokens, ...tokens };

  if (usePostgres && pool) {
    await pool.query(
      "UPDATE token_store SET tokens = $1 WHERE session_id = $2",
      [JSON.stringify(merged), sessionId],
    );
  } else if (sqlite) {
    sqlite
      .prepare("UPDATE token_store SET tokens = ? WHERE session_id = ?")
      .run(JSON.stringify(merged), sessionId);
  }
}

export async function dbDeleteToken(sessionId: string): Promise<void> {
  if (usePostgres && pool) {
    await pool.query("DELETE FROM token_store WHERE session_id = $1", [
      sessionId,
    ]);
  } else if (sqlite) {
    sqlite
      .prepare("DELETE FROM token_store WHERE session_id = ?")
      .run(sessionId);
  }
}

// Export the database instances for direct access if needed
export { pool, sqlite };
