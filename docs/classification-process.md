# Inbox Concierge - Classification Process

## Overview

This document describes how the email classification system works in Inbox Concierge. The system uses Claude AI to automatically categorize Gmail threads into user-defined buckets.

**Important: This document should be updated whenever the classification process is modified.**

---

## High-Level Flow

1. **Authentication & Initialization** → User logs in with Gmail OAuth
2. **Thread Fetching** → Server retrieves email threads from Gmail API
3. **Batch Classification** → Threads are sent to Claude in batches for classification
4. **Streaming Results** → Classification results stream back to the client as they complete
5. **Display & Interaction** → User sees emails organized into buckets

---

## Detailed Process Breakdown

### 1. Authentication & Setup

**Location:** `server/src/routes/auth.ts`, `client/src/App.tsx`

- User authenticates via Google OAuth 2.0
- Access tokens are stored server-side in `tokenStore`
- Client loads bucket definitions from the database (or falls back to defaults)
- Default buckets: `Important`, `Needs Reply`, `Can Wait`, `Newsletter`, `Auto-archive`

### 2. Thread Fetching

**Location:** `server/src/services/gmail.ts` → `fetchThreads()`

When classification starts, the server:

1. Creates an OAuth client with the user's stored tokens
2. Calls Gmail API `users.threads.list` to get up to **200 thread IDs**
3. Batches thread IDs into chunks of **20** to avoid rate limits
4. For each thread, calls `users.threads.get` with format `metadata` to retrieve:
   - Subject
   - From (sender name/email)
   - Date
   - Snippet (preview text)
   - Internal timestamp

**Output:** Array of `RawThread` objects with `id`, `subject`, `sender`, `snippet`, `timestamp`

### 3. Classification Batching

**Location:** `server/src/services/classifier.ts` → `classifyThreadsStreaming()`

Threads are divided into batches for efficient parallel processing:

- **Batch size:** 25 threads per batch (configurable via `BATCH_SIZE`)
- **Processing:** All batches are sent to Claude **in parallel** using `Promise.allSettled()`
- **Streaming:** As each batch completes, results are immediately sent to the client

### 4. AI Classification (Per Batch)

**Location:** `server/src/services/classifier.ts` → `classifyBatch()`

For each batch of 25 threads:

#### A. Prompt Construction

**System Prompt:**
```
You are an email triage assistant. Classify each email thread into one or more 
of the provided buckets. An email can belong to multiple buckets if it fits 
more than one category.

Buckets:
- Important: <hint from user or default>
- Needs Reply: <hint from user or default>
- Can Wait: <hint from user or default>
- Newsletter: <hint from user or default>
- Auto-archive: <hint from user or default>

Important rule: only include "Important" in the buckets array if your 
confidence is >= 0.85.
```

**User Prompt:**
- Lists bucket names
- Explains that emails can appear in multiple buckets
- Provides thread data in format: `<id:threadId> From: sender | Subject: subject | Snippet: snippet`
- Requests JSON array response with: `id`, `buckets`, `confidence`, `reason`

#### B. API Call

- **Model:** `claude-sonnet-4-6`
- **Max tokens:** 2048
- **Response:** JSON array of classification results

#### C. Response Parsing & Validation

1. Strip markdown fences if present (```json)
2. Parse JSON and validate with Zod schema (`BatchResultSchema`)
3. Apply **business rules:**
   - **Important Threshold:** If confidence < 0.85, remove "Important" from buckets
   - **Auto-archive Exclusivity:** If "Auto-archive" is present, remove all other buckets

#### D. Error Handling

If classification fails for a batch:
- Fall back to first bucket with confidence 0.5
- Reason: "Classification unavailable"

### 5. Streaming Results to Client

**Location:** `server/src/routes/emails.ts` → `/classify/stream` endpoint

- **Protocol:** Server-Sent Events (SSE)
- **Content-Type:** `text/event-stream`
- As each batch completes classification:
  ```json
  {
    "threads": [...],
    "completedBatches": 3,
    "totalBatches": 8
  }
  ```
- When all batches complete:
  ```json
  { "done": true }
  ```

**Rate Limiting:** 5 requests per minute per session

### 6. Client-Side Processing

**Location:** `client/src/App.tsx`, `client/src/api/client.ts`

1. Client opens SSE connection to `/classify/stream`
2. As batch events arrive:
   - Merges classified threads into state via `BATCH_RESOLVED` action
   - Updates progress bar: `completedBatches / totalBatches`
3. Threads are **deduplicated** by ID in the store
4. Results are **persisted to localStorage** for instant display on refresh

### 7. Display & Organization

**Location:** `client/src/components/EmailDashboard.tsx`

- Threads are grouped by bucket
- Each thread can appear in multiple buckets simultaneously
- User can:
  - Add new buckets (triggers reclassification)
  - Edit bucket hints (triggers reclassification)
  - Delete buckets (triggers reclassification)

---

## Key Configuration Constants

| Constant | Value | Location | Purpose |
|----------|-------|----------|---------|
| `BATCH_SIZE` | 25 | `classifier.ts` | Threads per Claude API call |
| `IMPORTANT_THRESHOLD` | 0.85 | `classifier.ts` | Minimum confidence for "Important" |
| Max Gmail threads | 200 | `gmail.ts` | Maximum threads fetched per session |
| Gmail batch size | 20 | `gmail.ts` | Thread IDs per Gmail API request |
| Rate limit | 5/min | `emails.ts` | Classification requests per session |
| Model | `claude-sonnet-4-6` | `classifier.ts` | Claude model version |

---

## Business Rules

### 1. Important Threshold
Only threads with **confidence ≥ 0.85** can be marked as "Important". This prevents false positives for critical emails.

### 2. Auto-archive Exclusivity
If a thread is classified as "Auto-archive", it **cannot** appear in any other bucket. This ensures promotional/automated emails are cleanly separated.

### 3. Multi-bucket Classification
Threads can belong to multiple buckets simultaneously (except when Auto-archive is present). For example, a thread can be both "Important" and "Needs Reply".

### 4. Bucket Hints
Each bucket has a customizable hint that guides Claude's classification:
- Default hints are defined in `DEFAULT_HINTS` in `classifier.ts`
- Users can override hints via the Settings page
- Custom hints persist to the database and sync across sessions

---

## Error Handling & Fallbacks

1. **Classification API failure:** Thread falls back to first bucket with confidence 0.5
2. **Invalid JSON response:** Entire batch falls back to first bucket
3. **Gmail API failure:** Empty threads array returned
4. **Token expiry:** OAuth client auto-refreshes tokens via event handler
5. **Network issues:** SSE connection errors bubble up to client error banner

---

## Performance Characteristics

- **Parallel processing:** All batches sent to Claude simultaneously
- **Progressive rendering:** UI updates as each batch completes (no wait for all)
- **Caching:** Results stored in localStorage for instant subsequent loads
- **Rate limiting:** Prevents API abuse (5 classifications per minute)

For a system with 200 threads:
- Batches: 8 (200 ÷ 25)
- Processing time: ~10-30 seconds (depending on Claude API latency)
- First results visible: Usually within 2-5 seconds

---

## Future Enhancement Ideas

- [ ] Incremental classification (only new threads since last sync)
- [ ] User feedback loop (thumbs up/down on classifications)
- [ ] Custom bucket ordering/priority
- [ ] Smart batching based on sender/subject clustering
- [ ] Caching classification hints in Claude's context

---

**Last Updated:** Initial version - March 2024
**Maintainer:** Update this file when modifying classification logic