# Paxton — Q&A Prep

Likely questions from Tenex reviewers. Know these cold.

---

## How did AI accelerate this project?

Used Claude Code as a pair programmer throughout — not just for boilerplate but for architectural decisions and complex implementations.

**What AI drafted that I then reviewed and refined:**
- The SSE streaming protocol on both client and server
- The MIME part walker for extracting email bodies from nested multipart messages
- Zod validation schemas for LLM output
- The SQLite token store and migration from in-memory
- The batch classification logic and concurrency pattern

**My discipline throughout:**
- Read every file Claude touched before accepting it
- TypeScript strict mode (`"strict": true` in both tsconfigs) to catch type errors
- Manual browser testing after every feature
- Pushed back on AI output when it over-engineered (e.g., it suggested WebSockets; I made the case for SSE and it agreed)

**Honest estimate:** 3–4x faster than writing solo. Not 10x, because careful review is non-negotiable for production code.

---

## What are the main trade-offs you made?

1. **200-thread cap** — Gmail's `threads.list` API returns up to 200. Covers the demo use case. Production would use the History API for incremental change detection.

2. **Full reclassify on bucket change** — When you add/edit a bucket, everything reclassifies (~30s for a full inbox). Simple and correct. A v2 would queue incremental per-bucket updates.

3. **No automated tests** — Accepted the speed trade-off. Verified manually. First thing I'd add: Playwright e2e for auth flow and classification pipeline.

4. **SQLite over Postgres** — Right for a single-server demo. The `db.ts` interface is intentionally thin; Postgres swap is one file change.

5. **Client-side classification state** — Using localStorage + a reducer pattern instead of a server-side DB for thread state. Means classifications are per-browser, not per-account. Acceptable for the scope of this project.

---

## Walk me through the classification pipeline.

1. **Fetch** — `fetchThreads()` calls `gmail.users.threads.list` (1 API call for 200 IDs), then batches `threads.get` calls in chunks of 20 to get metadata (subject, sender, snippet, timestamp, unread status).

2. **Batch** — `classifyThreadsStreaming()` groups threads into batches of ~10 (`BATCH_SIZE`). Batches run concurrently with `Promise.all`.

3. **Prompt** — Each batch sends one Claude prompt with all thread subjects/senders/snippets. The system prompt includes bucket definitions and any custom hints the user configured. Claude returns a JSON array validated by `BatchResultSchema` (Zod).

4. **Stream** — As each batch resolves, an `onBatch` callback fires, which sends an SSE event to the client. Client dispatches `BATCH_RESOLVED` — threads appear progressively in the UI.

5. **Post-process** — `enforceAutoArchiveExclusivity` strips threads from all other buckets if they're classified as Auto-archive. This is a business rule, not a prompt instruction.

Total time: ~20–30 seconds for 200 threads.

---

## Why SSE instead of WebSockets?

SSE is unidirectional (server → client), which is exactly what progressive classification needs — the server pushes results, the client never needs to send anything mid-stream. Benefits:

- Simpler to implement (plain HTTP `text/event-stream`)
- Works through standard reverse proxies without special config
- Browser reconnects automatically on disconnect
- No handshake overhead

WebSockets are the right choice when you need true bidirectional communication. Here, that complexity would add nothing.

---

## Why SQLite instead of Postgres?

This is a single-user-per-deployment app for the demo. SQLite is:

- Zero ops — no separate service to manage
- File-based — persists across Railway deploys with a mounted volume
- Fast enough — all queries are O(1) key lookups on session ID or email

The `db.ts` module exports a clean interface (`getBuckets`, `saveBuckets`, `dbGetToken`, etc.). If Paxton became multi-tenant, the swap to Postgres is confined to that one file — no changes to routes or services.

---

## What's the "wow" factor / most impressive feature?

**Per-bucket prompt hints.** Every bucket has an editable system-prompt snippet in Settings. You can write:

> "Only include emails that are a direct action request from my manager or a paying client. Exclude newsletters, automated notifications, and emails where I'm CC'd."

The classifier uses that exact language when deciding whether to put a thread in that bucket. It makes the AI personalizable and auditable — you can see why it made a decision in the thread detail panel ("Why these buckets?").

This goes beyond the spec requirement of "create custom buckets." It makes the classification engine user-configurable without touching code.

---

## What would you do differently with more time?

1. **Gmail History API** — for precise, incremental new-mail detection rather than polling thread IDs
2. **Playwright e2e tests** — auth flow, classification pipeline, bucket CRUD
3. **Action layer** — archive, label, or AI-draft reply from the detail panel
4. **Queue-based reclassification** — when a bucket changes, only reclassify affected threads rather than full-inbox
5. **Multi-account** — OAuth is already per-session; mainly a UI + data model change
6. **Structured logging** — replace `console.error` with Pino/Winston for production observability

---

## How does the unread/read state work?

Gmail's `threads.get` API with `format: 'metadata'` returns `labelIds` on each message at runtime, even though the TypeScript types mark it optional. I check whether any message in the thread has `UNREAD` in its label IDs:

```ts
const unread = thread.messages.some((m) => {
  const labels = (m as { labelIds?: string[] }).labelIds;
  return Array.isArray(labels) && labels.includes('UNREAD');
});
```

The cast is intentional — the runtime data is richer than the SDK types. This drives the left accent bar on unread email rows and the blue unread badge on the Important tab.

---

## How does authentication work?

Standard Google OAuth 2.0 PKCE flow:

1. User hits `/api/auth/google` → redirected to Google consent screen
2. Google redirects to `/api/auth/callback` with an authorization code
3. Server exchanges code for access + refresh tokens
4. Tokens stored in SQLite `token_store` keyed by `express-session` session ID
5. `requireAuth` middleware checks `tokenStore.get(req.session.id)` on every protected route
6. Google's OAuth client fires a `tokens` event on refresh — we persist updated tokens via `tokenStore.updateTokens()`

Sessions are 7-day expiry, HttpOnly, SameSite: lax, Secure in production.
