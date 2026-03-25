# Inbox Concierge - Backend System Design

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                    CLIENT                                        │
│                         (React + Vite + TypeScript)                             │
│                                                                                  │
│  ┌────────────────┐    ┌─────────────────┐    ┌──────────────────┐            │
│  │   App.tsx      │───▶│  EmailDashboard │───▶│  SettingsPage    │            │
│  │  (State Mgmt)  │    │   (UI Display)  │    │  (Bucket Config) │            │
│  └────────┬───────┘    └─────────────────┘    └──────────────────┘            │
│           │                                                                      │
│           ▼                                                                      │
│  ┌────────────────────────────────────────────────────────────┐                │
│  │              api/client.ts (API Layer)                      │                │
│  │  • classifyStream() - SSE connection                        │                │
│  │  • getSettings() / saveSettings()                           │                │
│  │  • getMe() / logout()                                       │                │
│  └────────────────────────────────────────────────────────────┘                │
│           │                                                                      │
│           │ HTTP/SSE                                                             │
└───────────┼──────────────────────────────────────────────────────────────────────┘
            │
            │ CORS: credentials: true
            │ Session Cookie
            ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              EXPRESS SERVER (Node.js)                           │
│                          Port 3001 │ server/src/index.ts                        │
│                                                                                  │
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │                           MIDDLEWARE STACK                                │  │
│  ├──────────────────────────────────────────────────────────────────────────┤  │
│  │  1. CORS (credentials: true, origin: CLIENT_ORIGIN)                      │  │
│  │  2. express.json() - JSON body parser                                    │  │
│  │  3. express-session - Session management                                 │  │
│  │     • secret: SESSION_SECRET                                              │  │
│  │     • cookie: { httpOnly, sameSite: 'lax', maxAge: 7 days }             │  │
│  │     • session.id → used as key for token storage                         │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│                                                                                  │
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │                          ROUTE HANDLERS                                   │  │
│  ├──────────────────────────────────────────────────────────────────────────┤  │
│  │                                                                            │  │
│  │  ┌─────────────────────────────────────────────────────────────────┐    │  │
│  │  │  /api/auth (authRouter)                                          │    │  │
│  │  ├─────────────────────────────────────────────────────────────────┤    │  │
│  │  │  GET  /google     → Generate OAuth URL, redirect to Google      │    │  │
│  │  │  GET  /callback   → Exchange code for tokens, get user email    │    │  │
│  │  │  GET  /me         → Return current user email (session-based)   │    │  │
│  │  │  POST /logout     → Delete tokens, destroy session               │    │  │
│  │  └─────────────────────────────────────────────────────────────────┘    │  │
│  │           │                                                                │  │
│  │           ▼                                                                │  │
│  │  ┌─────────────────────────────────────────────────────────────────┐    │  │
│  │  │  /api/emails (emailsRouter)                                      │    │  │
│  │  ├─────────────────────────────────────────────────────────────────┤    │  │
│  │  │  POST /classify        → Non-streaming classification (legacy)  │    │  │
│  │  │  POST /classify/stream → SSE streaming classification            │    │  │
│  │  │                                                                   │    │  │
│  │  │  Rate Limit: 5 requests/minute per session                       │    │  │
│  │  │  Middleware: requireAuth (checks session has valid tokens)       │    │  │
│  │  └─────────────────────────────────────────────────────────────────┘    │  │
│  │           │                                                                │  │
│  │           ▼                                                                │  │
│  │  ┌─────────────────────────────────────────────────────────────────┐    │  │
│  │  │  /api/settings (settingsRouter)                                  │    │  │
│  │  ├─────────────────────────────────────────────────────────────────┤    │  │
│  │  │  GET /  → Fetch user's bucket definitions from DB               │    │  │
│  │  │  PUT /  → Save/update user's bucket definitions                 │    │  │
│  │  │                                                                   │    │  │
│  │  │  Middleware: requireAuth                                         │    │  │
│  │  │  Validation: Zod schemas (name, hint, max 20 buckets)           │    │  │
│  │  └─────────────────────────────────────────────────────────────────┘    │  │
│  │                                                                            │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
            │                           │                          │
            │                           │                          │
            ▼                           ▼                          ▼
┌─────────────────────┐   ┌──────────────────────┐   ┌──────────────────────────┐
│   SERVICES LAYER    │   │   SERVICES LAYER     │   │    SERVICES LAYER        │
│                     │   │                      │   │                          │
│  ┌───────────────┐ │   │  ┌────────────────┐ │   │  ┌────────────────────┐ │
│  │ tokenStore.ts │ │   │  │  gmail.ts      │ │   │  │  classifier.ts     │ │
│  └───────┬───────┘ │   │  └────────┬───────┘ │   │  └──────────┬─────────┘ │
│          │         │   │           │          │   │             │            │
│  ┌───────▼───────┐ │   │  ┌────────▼───────┐ │   │  ┌──────────▼─────────┐ │
│  │  db.ts        │ │   │  │ Google OAuth2  │ │   │  │  Anthropic SDK     │ │
│  │               │ │   │  │ Client         │ │   │  │  (@anthropic-ai)   │ │
│  │ better-sqlite3│ │   │  └────────┬───────┘ │   │  └──────────┬─────────┘ │
│  └───────┬───────┘ │   │           │          │   │             │            │
└──────────┼─────────┘   └───────────┼──────────┘   └─────────────┼────────────┘
           │                         │                             │
           ▼                         ▼                             ▼
┌─────────────────────┐   ┌──────────────────────┐   ┌──────────────────────────┐
│   SQLite Database   │   │   Gmail API          │   │   Claude API             │
│   (paxton.db)       │   │   (Google Cloud)     │   │   (Anthropic)            │
│                     │   │                      │   │                          │
│  Tables:            │   │  Endpoints Used:     │   │  Model: claude-sonnet-4-6│
│  • token_store      │   │  • users.threads.list│   │  Max Tokens: 2048        │
│  • user_buckets     │   │  • users.threads.get │   │                          │
│                     │   │                      │   │  Input:                  │
│  Schema:            │   │  Scopes Required:    │   │  • System prompt         │
│  ┌────────────────┐│   │  • gmail.readonly    │   │  • User prompt           │
│  │ token_store    ││   │  • userinfo.email    │   │  • Thread batch (≤25)    │
│  ├────────────────┤│   │                      │   │                          │
│  │ session_id PK  ││   │  Data Fetched:       │   │  Output:                 │
│  │ email          ││   │  • Thread IDs (200)  │   │  JSON array:             │
│  │ tokens (JSON)  ││   │  • Subject           │   │  [{id, buckets[],        │
│  └────────────────┘│   │  • From (sender)     │   │    confidence, reason}]  │
│                     │   │  • Snippet           │   │                          │
│  ┌────────────────┐│   │  • Timestamp         │   └──────────────────────────┘
│  │ user_buckets   ││   │                      │
│  ├────────────────┤│   │  Rate Limits:        │
│  │ email, name PK ││   │  • 20 threads/batch  │
│  │ hint           ││   │  • Parallel requests │
│  │ sort_order     ││   │                      │
│  └────────────────┘│   └──────────────────────┘
│                     │
└─────────────────────┘
```

---

## Data Flow Diagrams

### 1. Authentication Flow

```
┌────────┐                ┌────────┐               ┌─────────┐              ┌──────────┐
│ Client │                │ Server │               │ Google  │              │ Database │
└───┬────┘                └───┬────┘               │  OAuth  │              └────┬─────┘
    │                         │                    └────┬────┘                   │
    │  GET /api/auth/google   │                         │                        │
    │────────────────────────▶│                         │                        │
    │                         │  generateAuthUrl()      │                        │
    │                         │────────────────────────▶│                        │
    │                         │                         │                        │
    │  ◀─ Redirect to Google ─┤                         │                        │
    │                         │                         │                        │
    │  User grants permission │                         │                        │
    │────────────────────────────────────────────────▶  │                        │
    │                         │                         │                        │
    │  ◀─ Redirect /callback ─┼─────────────────────────┤                        │
    │                         │                         │                        │
    │  GET /api/auth/callback?code=XXX                  │                        │
    │────────────────────────▶│                         │                        │
    │                         │  getToken(code)         │                        │
    │                         │────────────────────────▶│                        │
    │                         │  ◀─── access_token ─────┤                        │
    │                         │       refresh_token     │                        │
    │                         │                         │                        │
    │                         │  userinfo.get()         │                        │
    │                         │────────────────────────▶│                        │
    │                         │  ◀─── email ────────────┤                        │
    │                         │                         │                        │
    │                         │  tokenStore.set(session_id, {tokens, email})     │
    │                         │─────────────────────────────────────────────────▶│
    │                         │                         │                        │
    │  ◀─ Set-Cookie: session_id                        │                        │
    │  ◀─ Redirect to client  │                         │                        │
    │────────────────────────▶│                         │                        │
    │                         │                         │                        │
    │  Subsequent requests    │                         │                        │
    │  Cookie: session_id     │                         │                        │
    │────────────────────────▶│  tokenStore.get(session_id)                      │
    │                         │─────────────────────────────────────────────────▶│
    │                         │  ◀─── {tokens, email} ──────────────────────────┤
    │                         │                         │                        │
```

### 2. Email Classification Flow (Streaming)

```
┌────────┐           ┌────────┐           ┌─────────┐        ┌────────┐        ┌─────────┐
│ Client │           │ Server │           │  Gmail  │        │  DB    │        │ Claude  │
└───┬────┘           └───┬────┘           │   API   │        └───┬────┘        │   API   │
    │                    │                └────┬────┘            │             └────┬────┘
    │ POST /classify/stream                   │                 │                  │
    │ {buckets, bucketHints}                  │                 │                  │
    │───────────────────▶│                    │                 │                  │
    │                    │                    │                 │                  │
    │                    │ requireAuth                          │                  │
    │                    │ Check session & tokens               │                  │
    │                    │──────────────────────────────────────▶                  │
    │                    │ ◀─ {tokens, email} ──────────────────┤                  │
    │                    │                    │                 │                  │
    │ ◀─ Content-Type:   │                    │                 │                  │
    │    text/event-stream                    │                 │                  │
    │                    │                    │                 │                  │
    │                    │ fetchThreads()     │                 │                  │
    │                    │───────────────────▶│                 │                  │
    │                    │  users.threads.list(maxResults: 200) │                  │
    │                    │───────────────────▶│                 │                  │
    │                    │ ◀─ thread IDs[] ───┤                 │                  │
    │                    │                    │                 │                  │
    │                    │  Batch into chunks of 20             │                  │
    │                    │  users.threads.get() x20 (parallel)  │                  │
    │                    │───────────────────▶│                 │                  │
    │                    │ ◀─ thread details ─┤                 │                  │
    │                    │    (subject, sender, snippet)        │                  │
    │                    │                    │                 │                  │
    │                    │ classifyThreadsStreaming()           │                  │
    │                    │ Split into batches of 25             │                  │
    │                    │                    │                 │                  │
    │                    │ classifyBatch() x N (parallel)       │                  │
    │                    │─────────────────────────────────────────────────────────▶│
    │                    │  Batch 1: 25 threads                 │                  │
    │                    │─────────────────────────────────────────────────────────▶│
    │                    │  Batch 2: 25 threads                 │                  │
    │                    │─────────────────────────────────────────────────────────▶│
    │                    │  Batch 3: 25 threads                 │                  │
    │                    │                    │                 │                  │
    │                    │ ◀── Batch 1 results (async) ────────────────────────────┤
    │                    │     [{id, buckets[], confidence, reason}]                │
    │                    │                    │                 │                  │
    │ data: {threads: [...],                  │                 │                  │
    │  completedBatches: 1,                   │                 │                  │
    │  totalBatches: 8}  │                    │                 │                  │
    │◀───────────────────┤                    │                 │                  │
    │                    │                    │                 │                  │
    │                    │ ◀── Batch 3 results (async) ────────────────────────────┤
    │                    │                    │                 │                  │
    │ data: {threads: [...],                  │                 │                  │
    │  completedBatches: 2,                   │                 │                  │
    │  totalBatches: 8}  │                    │                 │                  │
    │◀───────────────────┤                    │                 │                  │
    │                    │                    │                 │                  │
    │                    │ ◀── Batch 2 results (async) ────────────────────────────┤
    │                    │                    │                 │                  │
    │ data: {threads: [...],                  │                 │                  │
    │  completedBatches: 3,                   │                 │                  │
    │  totalBatches: 8}  │                    │                 │                  │
    │◀───────────────────┤                    │                 │                  │
    │                    │                    │                 │                  │
    │      ... (more batches resolve)         │                 │                  │
    │                    │                    │                 │                  │
    │ data: {done: true} │                    │                 │                  │
    │◀───────────────────┤                    │                 │                  │
    │                    │                    │                 │                  │
    │ Connection closed  │                    │                 │                  │
    │                    │                    │                 │                  │
```

### 3. Settings Management Flow

```
┌────────┐              ┌────────┐              ┌──────────┐
│ Client │              │ Server │              │ Database │
└───┬────┘              └───┬────┘              └────┬─────┘
    │                       │                        │
    │ GET /api/settings     │                        │
    │──────────────────────▶│                        │
    │                       │ requireAuth            │
    │                       │ tokenStore.get()       │
    │                       │───────────────────────▶│
    │                       │ ◀─ {email} ────────────┤
    │                       │                        │
    │                       │ getBuckets(email)      │
    │                       │───────────────────────▶│
    │                       │ ◀─ bucket rows[] ──────┤
    │                       │                        │
    │ ◀─ {buckets: [...]}  │                        │
    │                       │                        │
    │                       │                        │
    │ PUT /api/settings     │                        │
    │ {buckets: [{name, hint}]}                      │
    │──────────────────────▶│                        │
    │                       │ Validate with Zod      │
    │                       │ • Max 20 buckets       │
    │                       │ • Name regex           │
    │                       │ • Hint max 300 chars   │
    │                       │                        │
    │                       │ saveBuckets(email, buckets)
    │                       │───────────────────────▶│
    │                       │  Transaction:          │
    │                       │  • UPSERT each bucket  │
    │                       │  • DELETE old buckets  │
    │                       │  • Set sort_order      │
    │                       │                        │
    │ ◀─ {ok: true} ────────┤                        │
    │                       │                        │
    │ POST /classify/stream │                        │
    │ (reclassify with new buckets)                  │
    │──────────────────────▶│                        │
    │                       │                        │
```

---

## Component Interaction Details

### Token Store & Session Management

```
┌─────────────────────────────────────────────────────────────────────┐
│                         TOKEN LIFECYCLE                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  1. OAuth Callback (Initial)                                        │
│     ┌─────────────────────────────────────────────────────────┐   │
│     │ tokenStore.set(session_id, {                             │   │
│     │   tokens: {                                              │   │
│     │     access_token: "ya29.xxx...",                         │   │
│     │     refresh_token: "1//xxx...",                          │   │
│     │     scope: "gmail.readonly userinfo.email",              │   │
│     │     token_type: "Bearer",                                │   │
│     │     expiry_date: 1234567890000                           │   │
│     │   },                                                      │   │
│     │   email: "user@example.com"                              │   │
│     │ })                                                        │   │
│     └─────────────────────────────────────────────────────────┘   │
│                                                                       │
│  2. Token Refresh (Automatic)                                       │
│     ┌─────────────────────────────────────────────────────────┐   │
│     │ OAuth2Client.on('tokens', (newTokens) => {              │   │
│     │   tokenStore.updateTokens(session_id, newTokens)        │   │
│     │   // Merges new tokens with existing refresh_token      │   │
│     │ })                                                        │   │
│     └─────────────────────────────────────────────────────────┘   │
│                                                                       │
│  3. Token Retrieval (Every Request)                                 │
│     ┌─────────────────────────────────────────────────────────┐   │
│     │ const record = tokenStore.get(session_id)                │   │
│     │ if (!record) throw Unauthorized                          │   │
│     │ oauth2Client.setCredentials(record.tokens)               │   │
│     └─────────────────────────────────────────────────────────┘   │
│                                                                       │
│  4. Logout                                                           │
│     ┌─────────────────────────────────────────────────────────┐   │
│     │ tokenStore.delete(session_id)                            │   │
│     │ session.destroy()                                        │   │
│     └─────────────────────────────────────────────────────────┘   │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

### Classification Algorithm Details

```
┌─────────────────────────────────────────────────────────────────────┐
│               CLASSIFIER BATCH PROCESSING LOGIC                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  Input: 200 threads, 5 buckets with hints                           │
│                                                                       │
│  Step 1: Split into batches                                         │
│  ┌──────────────────────────────────────────────────────────┐      │
│  │ const BATCH_SIZE = 25                                     │      │
│  │ batches = [                                               │      │
│  │   [thread1...thread25],   // Batch 0                     │      │
│  │   [thread26...thread50],  // Batch 1                     │      │
│  │   ...                                                     │      │
│  │   [thread176...thread200] // Batch 7                     │      │
│  │ ]                                                         │      │
│  └──────────────────────────────────────────────────────────┘      │
│                                                                       │
│  Step 2: Process in parallel                                        │
│  ┌──────────────────────────────────────────────────────────┐      │
│  │ await Promise.allSettled(                                 │      │
│  │   batches.map(async (batch) => {                          │      │
│  │     const results = await classifyBatch(batch, buckets)   │      │
│  │     onBatch(results, ++completed, total) // Stream back   │      │
│  │   })                                                       │      │
│  │ )                                                          │      │
│  └──────────────────────────────────────────────────────────┘      │
│                                                                       │
│  Step 3: Per-batch Claude API call                                  │
│  ┌──────────────────────────────────────────────────────────┐      │
│  │ System Prompt:                                            │      │
│  │   "You are an email triage assistant..."                 │      │
│  │   + Bucket descriptions with hints                        │      │
│  │   + "Important rule: confidence >= 0.85"                  │      │
│  │                                                            │      │
│  │ User Prompt:                                              │      │
│  │   "Bucket names: [Important, Needs Reply, ...]"          │      │
│  │   + Thread data (25 lines):                               │      │
│  │     "<id:abc> From: John | Subject: ... | Snippet: ..."  │      │
│  │   + "Return ONLY JSON array"                              │      │
│  │                                                            │      │
│  │ Response (JSON):                                          │      │
│  │   [                                                        │      │
│  │     {                                                      │      │
│  │       id: "abc",                                          │      │
│  │       buckets: ["Important", "Needs Reply"],             │      │
│  │       confidence: 0.92,                                   │      │
│  │       reason: "Direct question from colleague"           │      │
│  │     },                                                     │      │
│  │     ...                                                    │      │
│  │   ]                                                        │      │
│  └──────────────────────────────────────────────────────────┘      │
│                                                                       │
│  Step 4: Apply business rules                                       │
│  ┌──────────────────────────────────────────────────────────┐      │
│  │ For each result:                                          │      │
│  │   • enforceImportantThreshold()                           │      │
│  │     if confidence < 0.85:                                 │      │
│  │       remove "Important" from buckets                     │      │
│  │                                                            │      │
│  │   • enforceAutoArchiveExclusivity()                       │      │
│  │     if "Auto-archive" in buckets:                         │      │
│  │       buckets = ["Auto-archive"]                          │      │
│  └──────────────────────────────────────────────────────────┘      │
│                                                                       │
│  Step 5: Stream to client                                           │
│  ┌──────────────────────────────────────────────────────────┐      │
│  │ res.write(`data: ${JSON.stringify({                       │      │
│  │   threads: classifiedBatch,                               │      │
│  │   completedBatches: 3,                                    │      │
│  │   totalBatches: 8                                         │      │
│  │ })}\n\n`)                                                  │      │
│  └──────────────────────────────────────────────────────────┘      │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Database Schema

```sql
-- Token Storage (Session-based OAuth tokens)
CREATE TABLE token_store (
    session_id TEXT PRIMARY KEY,        -- Express session ID
    email TEXT NOT NULL,                -- User's Gmail address
    tokens TEXT NOT NULL                -- JSON: {access_token, refresh_token, expiry_date, ...}
);

-- User Bucket Configuration
CREATE TABLE user_buckets (
    email TEXT NOT NULL,                -- User's Gmail address
    name TEXT NOT NULL,                 -- Bucket name (e.g., "Important")
    hint TEXT,                          -- Classification hint/prompt (max 300 chars)
    sort_order INTEGER NOT NULL DEFAULT 0,  -- Display order
    PRIMARY KEY (email, name)
);

-- Indexes (implicit from PRIMARY KEY)
-- token_store: INDEX on session_id
-- user_buckets: COMPOSITE INDEX on (email, name)
```

---

## External API Dependencies

### 1. Google OAuth2 & Gmail API

**Authentication:**
- **Scopes Required:**
  - `https://www.googleapis.com/auth/gmail.readonly`
  - `https://www.googleapis.com/auth/userinfo.email`

**API Endpoints Used:**
- `oauth2.userinfo.get()` - Get user email after authentication
- `gmail.users.threads.list()` - Fetch thread IDs (max 200)
- `gmail.users.threads.get()` - Fetch thread details (metadata format)

**Rate Limits:**
- Gmail API: 250 quota units per user per second
- Our usage: ~200 threads × 1 unit = 200 units per classification
- Parallel batching respects Gmail's limits

**Token Management:**
- Access tokens expire after ~1 hour
- Refresh tokens used to get new access tokens automatically
- OAuth2Client emits 'tokens' event on refresh → updates DB

### 2. Anthropic Claude API

**Model:** `claude-sonnet-4-6`

**Configuration:**
- Max tokens: 2048
- System prompt: Email triage instructions + bucket definitions
- User prompt: Thread data batch (25 threads max)

**Input Format:**
```typescript
{
  model: 'claude-sonnet-4-6',
  max_tokens: 2048,
  system: "You are an email triage assistant...",
  messages: [
    {
      role: 'user',
      content: "Bucket names: [...]\n\nThreads:\n<id:...> From: ... | Subject: ... | Snippet: ..."
    }
  ]
}
```

**Output Format:**
```json
[
  {
    "id": "thread123",
    "buckets": ["Important", "Needs Reply"],
    "confidence": 0.92,
    "reason": "Direct question requiring response"
  }
]
```

**Rate Limits:**
- Anthropic API: Model-dependent (check dashboard)
- Our parallel processing: Up to 8 concurrent requests for 200 threads

---

## Security Considerations

### 1. Session Management
- HttpOnly cookies prevent XSS access to session ID
- SameSite: 'lax' prevents CSRF attacks
- 7-day expiration with server-side validation
- Secure flag enabled in production (HTTPS only)

### 2. Token Storage
- OAuth tokens stored server-side (never sent to client)
- Session ID is only client-side identifier
- Tokens encrypted in DB (via better-sqlite3 defaults)
- Refresh tokens never expire (but can be revoked by user)

### 3. API Security
- CORS restricted to CLIENT_ORIGIN only
- Rate limiting: 5 classifications per minute per session
- Input validation: Zod schemas on all endpoints
- RequireAuth middleware checks session validity

### 4. Environment Variables
```
GOOGLE_CLIENT_ID          - OAuth2 client credentials
GOOGLE_CLIENT_SECRET      - OAuth2 client credentials
GOOGLE_REDIRECT_URI       - Callback URL
ANTHROPIC_API_KEY         - Claude API key
SESSION_SECRET            - Session encryption key
CLIENT_ORIGIN             - CORS allowed origin
```

---

## Error Handling Strategy

### 1. Gmail API Errors
- **Token expiry:** Auto-refresh via OAuth2Client event handler
- **Rate limit exceeded:** Graceful degradation, user notification
- **Thread fetch failure:** Return empty array, log error
- **Network timeout:** Retry logic in individual thread.get() calls

### 2. Claude API Errors
- **Classification failure:** Fall back to first bucket (confidence 0.5)
- **Invalid JSON response:** Fall back to first bucket
- **Rate limit:** Queue batches (future enhancement)
- **Timeout:** Individual batch failure, other batches continue

### 3. Database Errors
- **Connection failure:** App fails to start (fail-fast)
- **Write failure:** Return 500, user retries
- **Schema migration:** Manual (no auto-migrations)

### 4. Session Errors
- **Expired session:** Return 401 Unauthorized
- **Missing tokens:** Redirect to login
- **Token refresh failure:** Clear session, require re-auth

---

## Performance Optimizations

### 1. Parallel Processing
- Gmail thread fetching: Batches of 20 in parallel
- Claude classification: All batches sent simultaneously
- SSE streaming: Results sent as soon as available

### 2. Caching Strategy
- **Client-side:** LocalStorage caches classified threads
- **Server-side:** No caching (always fresh from Gmail)
- **Token caching:** Tokens cached in DB, refreshed as needed

### 3. Batch Sizing
- **Gmail batches:** 20 threads (API optimal)
- **Claude batches:** 25 threads (prompt size vs latency tradeoff)
- **Total processing time:** ~10-30 seconds for 200 threads

### 4. Database Optimization
- Composite indexes on user_buckets (email, name)
- Transactions for multi-row operations
- Better-sqlite3 for synchronous, fast queries

---

## Monitoring & Observability

### Current Logging
- Console.error for classification failures
- Console.error for OAuth callback errors
- Console.error for streaming classification errors
- Console.log for server startup

### Future Enhancements
- [ ] Structured logging (Winston/Pino)
- [ ] Request ID tracking across services
- [ ] Classification accuracy metrics
- [ ] API latency monitoring
- [ ] Error rate dashboards
- [ ] User activity analytics

---

## Scalability Considerations

### Current Bottlenecks
1. **Single SQLite database** - Not suitable for horizontal scaling
2. **In-memory token store** - Lost on server restart
3. **No request queuing** - Rate limit rejections instead
4. **No caching layer** - Every classification fetches fresh Gmail data

### Future Scaling Path
1. **Database:** Migrate to PostgreSQL with connection pooling
2. **Token storage:** Redis for distributed sessions
3. **Queue system:** Bull/BullMQ for classification job queue
4. **Caching:** Redis for bucket definitions, Gmail thread metadata
5. **Load balancing:** Multiple server instances behind nginx/ALB
6. **Worker separation:** Dedicated workers for Gmail fetching vs classification

---

**Last Updated:** March 2024
**Maintainer:** Update this document when backend architecture changes