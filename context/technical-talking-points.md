# Paxton — Technical Talking Points for Code Walkthrough

Quick reference for discussing specific code sections during the video or interviews.

---

## 1. Server-Sent Events (SSE) Implementation

**File:** `server/src/routes/emails.ts` (lines ~100-140)

**Key Points:**
- Sets `Content-Type: text/event-stream` header
- Uses `res.write()` to send incremental JSON chunks
- Each message format: `data: {JSON}\n\n`
- Client receives via `fetch()` + `ReadableStream` reader (not EventSource API)
- Allows us to send Authorization headers (EventSource doesn't support custom headers)

**Code Snippet:**
```typescript
res.setHeader("Content-Type", "text/event-stream");
res.setHeader("Cache-Control", "no-cache");

function send(payload: object) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

await classifyThreadsStreaming(threads, bucketDefs, 
  (batchThreads, completedBatches, totalBatches) => {
    send({ threads: batchThreads, completedBatches, totalBatches });
  }
);
```

**Why This Matters:**
- Real-time feedback without WebSockets complexity
- Works across separate domains (Vercel frontend, Railway backend)
- Progress bar updates as each batch completes

---

## 2. Batch Classification with Concurrent Processing

**File:** `server/src/services/classifier.ts` (lines ~80-150)

**Key Points:**
- Splits 200 emails into batches of ~10 threads each
- Runs 5 batches concurrently with `Promise.all`
- Each batch = 1 Claude API call covering 10 threads
- Zod schema validates structured JSON response
- Graceful fallback if Claude returns malformed data

**Code Snippet:**
```typescript
// Create batches of ~10 threads
const BATCH_SIZE = Math.ceil(threads.length / 20);
const batches: RawThread[][] = [];
for (let i = 0; i < threads.length; i += BATCH_SIZE) {
  batches.push(threads.slice(i, i + BATCH_SIZE));
}

// Process batches concurrently (5 at a time)
for (let i = 0; i < batches.length; i += 5) {
  const chunk = batches.slice(i, i + 5);
  await Promise.all(chunk.map(batch => classifyBatch(batch, bucketDefs)));
}
```

**Why This Matters:**
- 200 sequential calls = 400 seconds (unacceptable)
- 20 batches × 5 concurrent = ~40 seconds (acceptable)
- Token efficiency: system prompt shared across 10 threads per batch
- Rate limit friendly: 5 concurrent max

---

## 3. Zod Schema for LLM Output Validation

**File:** `server/src/services/classifier.ts` (lines ~40-60)

**Key Points:**
- Claude sometimes returns invalid JSON or wrong structure
- Zod validates and type-checks every response
- If validation fails, that batch gets fallback assignments
- TypeScript infers types from schema (type safety)

**Code Snippet:**
```typescript
const BatchResultSchema = z.array(
  z.object({
    threadId: z.string(),
    buckets: z.array(z.string()),
    reasoning: z.record(z.string()),
  })
);

// Parse and validate
const parsed = BatchResultSchema.safeParse(JSON.parse(content));
if (!parsed.success) {
  console.error('Invalid batch result:', parsed.error);
  // Fallback: assign to first bucket
  return batch.map(t => ({ 
    threadId: t.id, 
    buckets: [bucketDefs[0].name] 
  }));
}
```

**Why This Matters:**
- LLMs are probabilistic — output format isn't guaranteed
- Zod catches schema violations before they corrupt state
- Fail gracefully instead of crashing the classification pipeline

---

## 4. Bearer Token Authentication Flow

**Files:** 
- `server/src/routes/auth.ts` (OAuth callback)
- `server/src/middleware/requireAuth.ts` (token validation)
- `client/src/App.tsx` (token extraction from URL)

**Key Points:**
- OAuth callback redirects to frontend with `?token={sessionId}`
- Frontend extracts token, saves to `localStorage`
- All API requests include `Authorization: Bearer {token}` header
- Backend looks up token in PostgreSQL to get OAuth credentials

**Code Snippet (Backend):**
```typescript
// OAuth callback - redirect with token
const sessionToken = req.session.id;
await tokenStore.set(sessionToken, { tokens, email });

const redirectUrl = new URL(process.env.CLIENT_ORIGIN);
redirectUrl.searchParams.set("token", sessionToken);
res.redirect(redirectUrl.toString());
```

**Code Snippet (Frontend):**
```typescript
// Extract token from URL
const urlParams = new URLSearchParams(window.location.search);
const tokenFromUrl = urlParams.get("token");
if (tokenFromUrl) {
  setAuthToken(tokenFromUrl);
  localStorage.setItem("authToken", tokenFromUrl);
  window.history.replaceState({}, document.title, window.location.pathname);
}

// Add to all requests
headers["Authorization"] = `Bearer ${authToken}`;
```

**Why This Matters:**
- Cross-domain deployments (Vercel + Railway) block third-party cookies
- Bearer tokens work everywhere, no browser restrictions
- Simpler security model than cookie-based sessions across domains

---

## 5. PostgreSQL + SQLite Dual Database Support

**File:** `server/src/services/db.ts` (lines ~1-100)

**Key Points:**
- Auto-detects database based on `DATABASE_URL` env var
- If `DATABASE_URL` exists → use PostgreSQL (production)
- If missing → use SQLite (local development)
- All functions return Promises (work with both sync/async)
- Same queries, minor syntax differences (`$1` vs `?`)

**Code Snippet:**
```typescript
const DATABASE_URL = process.env.DATABASE_URL;
const usePostgres = !!DATABASE_URL;

let pool: Pool | null = null;
if (usePostgres) {
  pool = new Pool({ connectionString: DATABASE_URL });
  console.log("✓ Using PostgreSQL database");
}

let sqlite: Database.Database | null = null;
if (!usePostgres) {
  sqlite = new Database(path.join(process.cwd(), "paxton.db"));
  console.log("✓ Using SQLite database (local dev)");
}

// All functions check which DB to use
export async function getBuckets(email: string): Promise<BucketRow[]> {
  if (usePostgres && pool) {
    const result = await pool.query(
      "SELECT * FROM user_buckets WHERE email = $1 ORDER BY sort_order ASC",
      [email]
    );
    return result.rows;
  } else if (sqlite) {
    return sqlite.prepare(
      "SELECT * FROM user_buckets WHERE email = ? ORDER BY sort_order ASC"
    ).all(email) as BucketRow[];
  }
  return [];
}
```

**Why This Matters:**
- Zero config local dev (SQLite)
- Production persistence (PostgreSQL on Railway)
- Same code works in both environments
- Easy to migrate between databases (single file change)

---

## 6. localStorage Caching + Background Polling

**File:** `client/src/hooks/useEmailStore.ts` (localStorage persistence)  
**File:** `client/src/App.tsx` (lines ~90-115, background poll)

**Key Points:**
- `useEmailStore` automatically saves state to `localStorage` on every change
- On mount, hydrate state from `localStorage` (instant load)
- Background `setInterval` polls every 90 seconds for new thread IDs
- Only classify new threads (incremental update)
- No re-fetch of already-classified emails

**Code Snippet:**
```typescript
// Auto-save to localStorage
useEffect(() => {
  localStorage.setItem('emailStoreState', JSON.stringify(state));
}, [state]);

// Hydrate on mount
const [state, dispatch] = useReducer(reducer, initialState, (initial) => {
  const cached = localStorage.getItem('emailStoreState');
  return cached ? JSON.parse(cached) : initial;
});

// Background polling
useEffect(() => {
  const poll = async () => {
    const { ids } = await api.getThreadIds();
    const knownIds = new Set(state.threads.map(t => t.id));
    const newIds = ids.filter(id => !knownIds.has(id));
    
    if (newIds.length > 0) {
      const { threads } = await api.classifyIncremental(newIds, ...);
      dispatch({ type: 'BATCH_RESOLVED', payload: threads });
    }
  };
  
  const intervalId = setInterval(poll, 90_000);
  return () => clearInterval(intervalId);
}, []);
```

**Why This Matters:**
- Page refresh = instant load (no API call)
- Background sync keeps data fresh without user action
- Only fetches what changed (efficient)
- Graceful handling of network failures (silent)

---

## 7. Per-Bucket Custom Prompts

**File:** `server/src/services/classifier.ts` (lines ~200-250)  
**UI:** Settings page, editable prompts per bucket

**Key Points:**
- Each bucket has a `hint` field (optional text)
- Hint injected into Claude system prompt per bucket
- Example: "Important = direct asks from my manager, not CCs"
- Saved to database per user (persists across sessions)
- Reclassifies all emails when hint changes

**Code Snippet:**
```typescript
// Build system prompt with hints
const bucketDescriptions = bucketDefs.map(b => {
  const hint = b.hint ? ` — ${b.hint}` : '';
  return `- "${b.name}"${hint}`;
}).join('\n');

const systemPrompt = `
You are an email classifier. For each email, assign it to one or more of these buckets:
${bucketDescriptions}

Rules:
- Assign to all relevant buckets (multiple OK)
- Use the bucket descriptions as guidance
- Provide brief reasoning for each assignment
`;
```

**Why This Matters:**
- Makes classification personalizable (not black box)
- Users teach the AI what matters to them
- Same bucket name ("Important") means different things to different people
- Most impactful feature for accuracy

---

## 8. AI Bucket Suggestions

**File:** `server/src/services/suggestions.ts` (analyze emails, suggest buckets)  
**File:** `client/src/App.tsx` (lines ~287-310, accept suggestion handler)

**Key Points:**
- Analyzes existing classified emails
- Claude suggests new bucket names + prompts
- Shows count of matching emails per suggestion
- Accepting suggestion → auto-adds bucket → reclassifies everything

**Code Snippet:**
```typescript
// Backend: analyze email patterns
export async function suggestBuckets(
  threads: Array<{ subject: string; sender: string; snippet: string; buckets: string[] }>
): Promise<BucketSuggestion[]> {
  const prompt = `
Analyze these ${threads.length} emails and their current bucket assignments.
Suggest 3-5 new buckets that would help organize emails better.
For each suggestion, provide:
- name: short bucket name
- hint: classification prompt
- matchingCount: estimated # of emails that would match
`;
  
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4',
    messages: [{ role: 'user', content: prompt }],
  });
  
  return BucketSuggestionSchema.parse(JSON.parse(response.content));
}

// Frontend: accept suggestion
onAcceptSuggestion={(suggestion) => {
  // Add bucket
  dispatch({ type: "ADD_BUCKET", payload: suggestion });
  
  // Save to DB
  api.saveSettings(updatedBuckets);
  
  // Reclassify with new bucket
  classify(updatedBuckets, updatedHints);
}}
```

**Why This Matters:**
- Solves "blank canvas" problem (what buckets should I create?)
- AI learns from user's email patterns
- Auto-generates prompts that match user's inbox
- Reduces setup time from minutes to seconds

---

## 9. Rate Limiting

**File:** `server/src/routes/emails.ts` (lines ~24-42)

**Key Points:**
- Classification endpoint: 5 requests/minute per user
- Poll endpoint: 20 requests/minute per user
- Keyed by Bearer token (not IP address)
- Returns 429 with retry-after header

**Code Snippet:**
```typescript
const classifyLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5,
  keyGenerator: (req) => getSessionToken(req) || "anonymous",
  message: { error: "Too many requests — please wait before classifying again." },
});

app.post('/api/emails/classify/stream', classifyLimiter, requireAuth, ...);
```

**Why This Matters:**
- Prevents abuse of expensive Claude API calls
- Per-user limits (not global)
- Protects against accidental infinite loops
- Standard HTTP 429 response (client can handle gracefully)

---

## 10. Dockerfile Multi-Stage Build

**File:** `server/Dockerfile`

**Key Points:**
- Stage 1 (builder): Node 20 + Python + build tools
- Installs all dependencies (including `better-sqlite3` native)
- Compiles TypeScript
- Stage 2 (production): Node 20 slim
- Copies only built artifacts + production node_modules
- Smaller final image (~200MB vs ~800MB)

**Code Snippet:**
```dockerfile
# Build stage
FROM node:20-slim AS builder
RUN apt-get update && apt-get install -y python3 make g++
COPY server/package*.json ./server/
RUN cd server && npm ci
COPY server ./server
RUN cd server && npm run build

# Production stage
FROM node:20-slim
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/server/node_modules ./server/node_modules
CMD ["node", "server/dist/index.js"]
```

**Why This Matters:**
- Build dependencies (TypeScript, Python) not in production image
- Faster deploys (smaller image)
- Better security (fewer attack surfaces)
- Railway auto-detects and builds Dockerfile

---

## Key Metrics to Mention

- **Classification speed:** ~30-40 seconds for 200 emails (vs 6+ minutes naive)
- **API efficiency:** 20 Claude API calls (vs 200 naive)
- **Cache hit rate:** 100% on page refresh (0 API calls)
- **Token cost:** ~$0.10-0.20 per full inbox classification
- **Concurrent batches:** 5 batches in parallel
- **Batch size:** ~10 threads per batch
- **Poll interval:** 90 seconds (configurable)
- **Rate limits:** 5 classifications/min, 20 polls/min per user

---

## Common Questions & Answers

**Q: Why not use Gmail filters/labels?**  
A: Filters are keyword-based. "From: boss@company.com" works, but "emails about project deadlines from anyone" requires understanding context. LLMs read the full email body and reason about intent.

**Q: Why SSE instead of WebSockets?**  
A: One-way streaming only (server → client). SSE is simpler, auto-reconnects, works over HTTP. WebSockets are overkill for this use case.

**Q: Why not cache classifications server-side?**  
A: Classifications are personalized per user and bucket config. Caching would require cache invalidation on bucket changes. localStorage is simpler and works offline.

**Q: How do you handle Gmail API rate limits?**  
A: Currently not an issue (200 emails = 1-2 API calls). For larger inboxes, would batch Gmail API calls and use exponential backoff on 429 errors.

**Q: What about email privacy?**  
A: OAuth is read-only. Email bodies sent to Claude API (encrypted in transit). No long-term storage of email content. Tokens stored encrypted in PostgreSQL.

**Q: Why React 19?**  
A: Wanted to use latest features (esp. `useOptimistic` for future features). No breaking changes from React 18 in this codebase. Concurrent rendering helps with large thread lists.

---

## Demo Flow Checklist

1. ✅ Show login page with version number
2. ✅ Complete OAuth flow
3. ✅ Watch progress bar stream in real-time
4. ✅ Show bucket tabs with unread counts
5. ✅ Open thread detail → show AI reasoning
6. ✅ Search across buckets (instant)
7. ✅ Open settings → show/edit bucket prompts
8. ✅ Save bucket → watch reclassification
9. ✅ Show bucket suggestion chip → accept it
10. ✅ Show version number updating after deploy

---

## Gotchas to Avoid

- **Don't say "AI does everything"** — be specific about what Claude does (classification) vs what's deterministic (search, caching, routing)
- **Don't oversell accuracy** — mention that LLMs can be wrong, that's why reasoning is shown per email
- **Don't skip trade-offs** — acknowledge 200-email cap, full reclassify limitation, no automated tests
- **Don't forget to mention Bearer tokens** — it's a key architectural decision that solved a real problem

---

**Remember:** Show the code, not just the UI. The video is for engineers who want to understand *how* it works, not just *what* it does.