# Paxton — Video Script / Talking Points

Target: < 10 minutes, casual/conversational. Don't read verbatim — use these as anchors.

---

## Intro (~30s)

"Hey, I'm Carter. I built Paxton — an AI-powered Gmail triage tool for the Tenex take-home.

The problem: email is still chaos for most people. Existing tools use keyword rules or manual labels. I wanted to see what happens when you hand that job to an LLM that actually understands context.

The app is live at paxton-sooty.vercel.app with a production deployment on Railway and Vercel. Let's look at what I built."

---

## Demo (~2 min)

Walk through live:

1. **Login** — hit the app, click "Sign in with Google", complete OAuth
2. **Classification in progress** — show the progress bar animating as emails stream in batch by batch. Mention: "These are appearing in real time as Claude processes each batch — not waiting for everything to finish."
3. **Default buckets** — Important, Can Wait, Auto-archive, Newsletter. Show the tab counts (blue badge = unread count on Important)
4. **Date grouping** — scroll the list, point out Today / Yesterday / This week headers
5. **Unread treatment** — point out the left accent bar on unread rows vs. muted read rows
6. **Thread detail** — click an email, show the full body, then scroll to "Why these buckets?" — show the AI's one-sentence reasoning per bucket
7. **Search** — type a sender name, show live cross-bucket filtering
8. **Settings** — open settings, show a bucket's prompt, edit it, hit "Save & reclassify", watch the progress bar fire again

---

## Architecture Deep Dive (~3 min)

Show the code while talking through each point.

### SSE Streaming (`server/src/routes/emails.ts`, `client/src/api/client.ts`)
"I didn't want a 30-second blank screen. I use Server-Sent Events to stream each batch of results as Claude finishes it. The client merges them into state incrementally — emails appear as they're ready. `classifyThreadsStreaming` fires an `onBatch` callback per resolved batch, which the client dispatches as `BATCH_RESOLVED`.

This works seamlessly across the production deployment — frontend on Vercel, backend on Railway — using Bearer token authentication instead of cookies to avoid third-party cookie blocking."

### Batch Classification (`server/src/services/classifier.ts`)
"200 emails one-by-one = 200 API calls and 10+ minutes. Instead I batch ~10 threads per Claude prompt and run the batches concurrently with `Promise.all`. One prompt covers 10 threads, and I get back a structured JSON array. That's the core throughput win.

Show the Zod schema — `BatchResultSchema` — that validates every response. If Claude returns something malformed, I fall back gracefully rather than crashing."

### localStorage Caching (`client/src/hooks/useEmailStore.ts`)
"On refresh, classified emails are instant — no API call, no re-classify. The app hydrates from localStorage on mount. If threads exist, we skip straight to ready. A 90-second background poll then silently checks for new thread IDs and classifies only those."

### PostgreSQL + SQLite Dual Support (`server/src/services/db.ts`)
"OAuth tokens need to survive server restarts. In production on Railway, I use PostgreSQL for persistence. Locally, it falls back to SQLite — zero config. The database layer auto-detects based on `DATABASE_URL` and uses async/await for both. Two tables: `token_store` and `user_buckets`. The abstraction is clean enough that switching databases was literally one deployment."

### Per-bucket Prompt Hints (`server/src/services/classifier.ts`, Settings UI)
"This is the feature I'm most proud of. Every bucket has an editable system prompt. You can tell the classifier exactly what 'Important' means to you — 'direct asks from my manager or a paying client, not newsletters or CCs'. The AI uses that context. It makes it personalizable, not just a black box.

There's also an AI-powered bucket suggestion feature that analyzes your existing emails and recommends new buckets with pre-written prompts. Accept a suggestion and it automatically reclassifies everything."

---

## Trade-offs & Production Notes (~1.5 min)

"A few deliberate trade-offs I want to be upfront about:

**200-thread cap.** The Gmail `threads.list` API returns up to 200. That covers most inboxes for this demo. A production system would use the History API to track changes incrementally rather than re-fetching everything.

**Full reclassify on bucket change.** When you add or edit a bucket, everything reclassifies. Simple and correct, but slow for large inboxes. A v2 would queue incremental updates per bucket.

**Bearer token auth.** I initially tried session cookies but hit third-party cookie blocking when deploying frontend and backend on separate domains. The solution was Bearer tokens passed via Authorization headers — works everywhere, simpler security model for cross-domain setups.

**No automated tests.** I moved fast and verified each feature manually in the browser. The first thing I'd add with more time is Playwright e2e tests for the auth flow and classification pipeline.

**Deployment architecture:** Frontend on Vercel (auto-deploys from GitHub), backend on Railway (Dockerfile build with Node 20 + Python for better-sqlite3 fallback). PostgreSQL on Railway for production persistence. The whole stack is in the repo — you can `railway up` and `vercel deploy` to recreate it."

---

## How AI Accelerated This (~1 min)

"I used Claude Code as a pair programmer throughout — not just for boilerplate.

The things AI got me to a working draft fastest: the MIME part walker for extracting email bodies from nested multipart messages, the SSE streaming protocol on both client and server, the Zod schema design for validated LLM output, and the SQLite token store.

The discipline I held: I never accepted output without reading it. Every file Claude touched, I read. TypeScript strict mode caught type errors the AI introduced. And I tested every feature in the browser before moving on. That review loop is what keeps AI-assisted code production-quality."

---

## Next Steps (~30s)

"If I kept building:

- **Gmail History API** — true push-style detection of new mail, more precise than polling
- **One-click actions** — archive, label, or AI-draft a reply directly from the detail panel
- **Multi-account** — the OAuth layer is per-session so this is mostly a UI change
- **Expo mobile** — the classification pipeline is entirely server-side, so a React Native client would just need a new view layer"

---

## Close (~15s)

"That's Paxton. The code is on GitHub — cartertune/Paxton — with documentation covering local setup, deployment to Railway and Vercel, and the PostgreSQL migration. Live at paxton-sooty.vercel.app. Thanks for watching — happy to go deeper on any of this."
