# Paxton — Production Architecture

This document describes the production deployment architecture for Paxton, including infrastructure, authentication flow, and key technical decisions.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                          User's Browser                              │
│                    https://paxton-sooty.vercel.app                   │
└────────────────┬────────────────────────────────────────────────────┘
                 │
                 │ HTTPS + Bearer Token
                 │
┌────────────────▼────────────────────────────────────────────────────┐
│                     Frontend (Vercel)                                │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  React SPA                                                    │   │
│  │  - Vite build (TypeScript + Tailwind)                        │   │
│  │  - localStorage for email cache                              │   │
│  │  - Bearer token in Authorization header                      │   │
│  │  - Auto-deploy from GitHub main branch                       │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                 │
                 │ REST API + SSE
                 │ Authorization: Bearer {token}
                 │
┌────────────────▼────────────────────────────────────────────────────┐
│              Backend API (Railway)                                   │
│         https://paxton-production.up.railway.app                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  Node.js + Express + TypeScript                              │   │
│  │  - OAuth 2.0 flow with Google                                │   │
│  │  - SSE streaming for classification results                  │   │
│  │  - Rate limiting (express-rate-limit)                        │   │
│  │  - Docker build (Node 20 + Python for SQLite)               │   │
│  │  - Auto-deploy from GitHub main branch                       │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────┬────────────────────────┬──────────────────────────────────────┘
      │                        │
      │                        │
      ▼                        ▼
┌──────────────┐      ┌──────────────────────┐
│  PostgreSQL  │      │  External APIs       │
│  (Railway)   │      │  - Gmail API         │
│              │      │  - Claude API        │
│  Tables:     │      │    (Anthropic)       │
│  - token_store     │      │                │
│  - user_buckets    │      │                │
└──────────────┘      └──────────────────────┘
```

---

## Deployment Details

### Frontend (Vercel)

**URL:** https://paxton-sooty.vercel.app  
**Repository:** GitHub `cartertune/Paxton` (main branch)  
**Framework:** Vite (React 19 + TypeScript)  
**Build Command:** `npm run build` (in `client/` directory)  
**Environment Variables:**
- `VITE_API_BASE_URL=https://paxton-production.up.railway.app`

**Key Features:**
- Auto-deploy on git push to main
- Root directory set to `client/`
- Builds TypeScript + Vite to static assets
- Version number injected from package.json

### Backend (Railway)

**URL:** https://paxton-production.up.railway.app  
**Repository:** GitHub `cartertune/Paxton` (main branch)  
**Service Root:** `server/` directory  
**Build:** Dockerfile with multi-stage build  

**Environment Variables:**
- `DATABASE_URL` — Auto-set by Railway when PostgreSQL added
- `NODE_ENV=production`
- `GOOGLE_CLIENT_ID` — OAuth client ID from Google Cloud Console
- `GOOGLE_CLIENT_SECRET` — OAuth client secret
- `GOOGLE_REDIRECT_URI=https://paxton-production.up.railway.app/api/auth/callback`
- `ANTHROPIC_API_KEY` — Claude API key
- `SESSION_SECRET` — Random secure string for session signing
- `CLIENT_ORIGIN=https://paxton-sooty.vercel.app` — Where to redirect after OAuth

**Key Features:**
- Dockerfile build (Node 20 + Python for native dependencies)
- PostgreSQL for persistent storage
- Auto-deploy on git push to main
- Health check endpoint at `/health`

### Database (PostgreSQL on Railway)

**Tables:**

**`token_store`:**
```sql
CREATE TABLE token_store (
  session_id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  tokens TEXT NOT NULL  -- JSON-serialized OAuth tokens
)
```

**`user_buckets`:**
```sql
CREATE TABLE user_buckets (
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  hint TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (email, name)
)
```

**Connection:**
- Railway automatically provisions and sets `DATABASE_URL`
- Backend uses `pg` npm package for PostgreSQL
- Fallback to SQLite for local development (auto-detected)

---

## Authentication Flow

### 1. Initial Login

```
User                Frontend              Backend              Google OAuth         Database
  │                    │                      │                      │                 │
  │  Click "Login"     │                      │                      │                 │
  │───────────────────▶│                      │                      │                 │
  │                    │                      │                      │                 │
  │                    │  Redirect to         │                      │                 │
  │                    │  /api/auth/google    │                      │                 │
  │                    │─────────────────────▶│                      │                 │
  │                    │                      │  generateAuthUrl()   │                 │
  │                    │                      │─────────────────────▶│                 │
  │                    │                      │                      │                 │
  │  ◀──────────────────── Redirect to Google OAuth ────────────────┤                 │
  │                    │                      │                      │                 │
  │  [User authorizes] │                      │                      │                 │
  │                    │                      │                      │                 │
  │  ◀──────────────────── Redirect to /api/auth/callback with code ─┤                 │
  │                    │                      │                      │                 │
  │                    │                      │  getToken(code)      │                 │
  │                    │                      │─────────────────────▶│                 │
  │                    │                      │  ◀── tokens ─────────┤                 │
  │                    │                      │                      │                 │
  │                    │                      │  Store tokens        │                 │
  │                    │                      │────────────────────────────────────────▶│
  │                    │                      │                      │                 │
  │                    │ ◀── Redirect to      │                      │                 │
  │                    │     /?token={sessionId}                     │                 │
  │◀───────────────────┤                      │                      │                 │
  │                    │                      │                      │                 │
  │  [Frontend saves   │                      │                      │                 │
  │   token to         │                      │                      │                 │
  │   localStorage]    │                      │                      │                 │
```

### 2. Subsequent API Requests

All API requests include the Bearer token:

```http
GET /api/emails/classify/stream
Authorization: Bearer {sessionId}
Content-Type: application/json
```

The backend:
1. Extracts token from `Authorization` header
2. Looks up token in `token_store` table
3. Retrieves OAuth credentials for Gmail API calls
4. Auto-refreshes expired tokens (handled by `googleapis` library)

---

## Key Technical Decisions

### Why Bearer Tokens Instead of Cookies?

**Original Approach:** Session cookies with `express-session`

**Problem:** Third-party cookie blocking  
- Frontend on `paxton-sooty.vercel.app`
- Backend on `paxton-production.up.railway.app`
- Browsers (Chrome, Safari) block cross-domain cookies by default
- `sameSite: "none"` requires complex proxy setup and still unreliable

**Solution:** Bearer token authentication
- OAuth callback redirects to frontend with `?token={sessionId}`
- Frontend stores token in `localStorage`
- All API requests include `Authorization: Bearer {token}` header
- Works reliably across all browsers and domains
- Simpler security model for cross-domain deployments

### Why PostgreSQL + SQLite Dual Support?

**Local Development:**
- SQLite requires zero configuration
- File-based (`paxton.db`) — easy to delete and reset
- Perfect for rapid iteration

**Production (Railway):**
- PostgreSQL for persistence across deploys
- Railway provisions and manages it automatically
- Container filesystem is ephemeral — SQLite would lose data on restart

**Implementation:**
- Database layer (`server/src/services/db.ts`) auto-detects based on `DATABASE_URL`
- All functions return Promises (work with both sync SQLite and async PostgreSQL)
- Same schema, same queries (with minor syntax differences: `$1` vs `?`)

### Why Server-Sent Events for Streaming?

**Alternatives considered:**
- WebSockets: Overkill for one-way streaming
- Polling: Wasteful and higher latency
- Wait for full batch: Poor UX (30+ second blank screen)

**SSE Benefits:**
- Native browser API (`EventSource`)
- Auto-reconnect on disconnect
- Simple protocol: `data: {JSON}\n\n`
- Works over HTTP/HTTPS (no special ports)
- Perfect for one-way server → client streaming

**Implementation:**
```typescript
// Backend: server/src/routes/emails.ts
res.setHeader('Content-Type', 'text/event-stream');
res.write(`data: ${JSON.stringify(payload)}\n\n`);

// Frontend: client/src/api/client.ts
const reader = res.body.getReader();
while (true) {
  const { done, value } = await reader.read();
  // Parse SSE messages and dispatch to state
}
```

### Why Batch Classification?

**Naive approach:** 1 API call per email = 200 calls for 200 emails

**Problems:**
- 200 × 2 seconds = 6+ minutes total time
- Rate limits (Anthropic: 5 req/sec on free tier)
- Inefficient token usage

**Batch approach:** ~10 emails per API call
- 200 emails ÷ 10 = 20 API calls
- Run 5 batches in parallel via `Promise.all`
- Total time: ~30-40 seconds (depends on email length)
- Better token efficiency (system prompt shared across batch)

**JSON Structure Validation:**
- Every batch response validated with Zod schema
- If Claude returns invalid JSON, batch fails gracefully
- Individual thread errors don't crash entire classification

---

## Performance Optimizations

### 1. localStorage Caching
- Classified emails persist across page refreshes
- No API call on reload if cache is fresh
- 90-second background poll for new emails only

### 2. Incremental Classification
- Background poll fetches only new thread IDs
- Classifies only emails not already in cache
- Updates state without full page reload

### 3. Concurrent Batch Processing
- Multiple classification batches run in parallel
- Limits: 5 concurrent batches to avoid rate limits
- Each batch completes ~2-4 seconds

### 4. Debounced Search
- Client-side search filters already-loaded threads
- No backend API call for search queries
- Instant results across all buckets

### 5. Rate Limiting
- Classification endpoint: 5 requests/minute per user
- Poll endpoint: 20 requests/minute per user
- Keyed by Bearer token (not IP)

---

## Security Considerations

### OAuth Token Storage
- Tokens stored server-side in PostgreSQL
- Never sent to frontend (only session ID)
- Auto-refresh handled server-side
- Tokens encrypted at rest by PostgreSQL

### Bearer Token Authentication
- Session ID acts as Bearer token
- Stored in `localStorage` (XSS risk mitigated by HTTPS-only)
- No cookies = no CSRF vulnerability
- Logout invalidates token in database

### CORS Configuration
```typescript
cors({
  origin: process.env.CLIENT_ORIGIN, // Whitelist only Vercel frontend
  credentials: true // Not actually used (no cookies) but kept for future
})
```

### Environment Variables
- All secrets in Railway/Vercel env vars (not in code)
- `SESSION_SECRET` is cryptographically random
- API keys never logged or exposed to client

### Rate Limiting
- Prevents abuse of expensive Claude API calls
- Per-user limits (keyed by Bearer token)
- Returns 429 with retry-after header

---

## Monitoring & Debugging

### Health Check
```bash
curl https://paxton-production.up.railway.app/health
# {"ok":true}
```

### Logs
```bash
railway logs  # View Railway backend logs
```

**Key log patterns:**
- `[AUTH]` — OAuth flow steps
- `[AUTH /me]` — Token validation requests
- `✓ Using PostgreSQL database` — DB connection confirmed

### Version Display
- Bottom right corner of UI shows `vX.Y.Z`
- Confirms frontend deployment version
- Helps verify latest code is deployed

---

## Deployment Checklist

### Initial Setup

1. **Create Railway Project**
   - Add PostgreSQL database
   - Deploy from GitHub repo
   - Set root directory to `server/`

2. **Configure Railway Environment Variables**
   - `DATABASE_URL` (auto-set by Railway)
   - `NODE_ENV=production`
   - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`
   - `ANTHROPIC_API_KEY`
   - `SESSION_SECRET` (generate with `openssl rand -hex 32`)
   - `CLIENT_ORIGIN` (Vercel URL)

3. **Create Vercel Project**
   - Link to GitHub repo
   - Set root directory to `client/`
   - Framework preset: Vite

4. **Configure Vercel Environment Variables**
   - `VITE_API_BASE_URL` (Railway backend URL)

5. **Update Google OAuth Credentials**
   - Add Railway and Vercel URLs to authorized origins
   - Add callback URL: `https://{railway-domain}/api/auth/callback`

### Continuous Deployment

Both Railway and Vercel auto-deploy on `git push` to `main`:

```bash
git add .
git commit -m "Feature: something awesome"
git push origin main
# Railway rebuilds backend (~90 seconds)
# Vercel rebuilds frontend (~30 seconds)
```

---

## Local Development

### Environment Setup

**Backend** (`server/.env`):
```bash
NODE_ENV=development
PORT=3001
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:3001/api/auth/callback
ANTHROPIC_API_KEY=sk-ant-...
SESSION_SECRET=local-dev-secret
CLIENT_ORIGIN=http://localhost:5173
# No DATABASE_URL = auto-uses SQLite
```

**Frontend** (`client/.env`):
```bash
VITE_API_BASE_URL=http://localhost:3001
```

### Run Locally

```bash
# Terminal 1: Backend
cd server
npm install
npm run dev  # tsx watch src/index.ts

# Terminal 2: Frontend
cd client
npm install
npm run dev  # vite dev server

# Terminal 3: Run both (from root)
npm run dev  # concurrently runs both
```

**Access:** http://localhost:5173

---

## Cost Breakdown (Production)

### Railway
- Free tier: $5/month credit
- PostgreSQL database included
- Typical usage: ~$2-3/month (well within free tier)

### Vercel
- Hobby plan (free)
- Unlimited bandwidth
- Auto-deployments included

### Anthropic Claude API
- Pay-per-token pricing
- ~200 emails × 5 classifications each = ~$0.10-0.20 per full inbox
- Cost scales with email volume and bucket count

### Google Cloud (Gmail API)
- Free quota: 1 billion requests/day
- OAuth 2.0 free (no quota limits)

**Total:** Effectively $0-5/month for personal use

---

## Scaling Considerations

### Current Bottlenecks
1. **Single Railway instance** — No horizontal scaling
2. **200 email cap** — Gmail API `threads.list` pagination limit
3. **Full reclassify on bucket change** — Inefficient for large inboxes

### Future Scaling Path
1. **Gmail History API** — Incremental sync instead of full fetch
2. **Background job queue** — Redis + Bull for async classification
3. **Horizontal scaling** — Multiple Railway instances behind load balancer
4. **Caching layer** — Redis for frequently accessed classifications
5. **Database sharding** — Partition `user_buckets` by email hash

---

## Troubleshooting

### "401 Unauthorized" on all requests
- **Check:** Token in `localStorage` (DevTools → Application → Local Storage)
- **Fix:** Logout and re-login to get fresh token
- **Verify:** Railway logs show `[AUTH /me] Token: present`

### Emails not loading after classification
- **Check:** Browser console for errors
- **Check:** Railway logs for API errors
- **Fix:** Clear `localStorage` and refresh

### "Invalid request body" error
- **Check:** Bucket name contains only allowed characters: `a-z A-Z 0-9 _&'(),.!?-`
- **Fix:** Remove invalid characters from bucket name

### OAuth redirect loops
- **Check:** `GOOGLE_REDIRECT_URI` matches exactly in Railway env vars and Google Cloud Console
- **Check:** `CLIENT_ORIGIN` is set correctly in Railway
- **Fix:** Update environment variables and redeploy

### Database connection errors (Railway)
- **Check:** `DATABASE_URL` is set (Railway auto-sets this)
- **Check:** PostgreSQL service is running
- **Verify:** Logs show `✓ Using PostgreSQL database`

---

## Documentation Links

- [Main README](../README.md) — Setup and usage
- [System Design](./system-design.md) — Original architectural overview
- [Classification Process](./classification-process.md) — How AI classification works
- [PostgreSQL Migration](../POSTGRES_MIGRATION.md) — SQLite → PostgreSQL migration details
- [Railway Deployment Guide](../RAILWAY_DEPLOYMENT.md) — Step-by-step Railway setup

---

**Production URL:** https://paxton-sooty.vercel.app  
**GitHub:** https://github.com/cartertune/Paxton  
**Version:** 1.0.4