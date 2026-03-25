# Paxton

AI-powered Gmail triage. Connects to your Gmail account, classifies your last 200 threads into configurable buckets using Claude, and streams results to the UI in real time.

---

## Features

- **Google OAuth** — sign in with any Google/Gmail account
- **AI classification** — Claude classifies threads into buckets (Important, Can Wait, Auto-archive, Newsletter, + custom)
- **Real-time streaming** — results appear progressively as each batch finishes, no waiting
- **Custom buckets** — create buckets with custom prompt hints that guide the classifier
- **Per-bucket reasoning** — click any email to see why it was placed in each bucket
- **Read/unread state** — live from Gmail label data, with visual indicators
- **Search** — cross-bucket search across sender, subject, and snippet
- **Auto-sync** — silent background poll every 90 seconds for new threads
- **Persistent settings** — bucket configs saved to SQLite, survive server restarts
- **localStorage cache** — classified threads persist across browser refreshes

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite, TypeScript, Tailwind CSS |
| Backend | Node.js, Express, TypeScript |
| AI | Anthropic Claude (`claude-sonnet-4-6`) |
| Auth | Google OAuth 2.0 via `googleapis` |
| Database | SQLite via `better-sqlite3` |
| Streaming | Server-Sent Events (SSE) |
| Validation | Zod |

---

## Prerequisites

- Node.js 18+
- A [Google Cloud Console](https://console.cloud.google.com) project with:
  - Gmail API enabled
  - OAuth 2.0 credentials (Web application type)
- An [Anthropic API key](https://console.anthropic.com)

---

## Setup

### 1. Install dependencies

```bash
npm run install:all
```

### 2. Configure environment variables

**Server:**
```bash
cp server/.env.example server/.env
```

Edit `server/.env`:
```
GOOGLE_CLIENT_ID=        # From Google Cloud Console
GOOGLE_CLIENT_SECRET=    # From Google Cloud Console
GOOGLE_REDIRECT_URI=http://localhost:3001/api/auth/callback
ANTHROPIC_API_KEY=       # From Anthropic Console
SESSION_SECRET=          # Any random string (use: openssl rand -hex 32)
PORT=3001
CLIENT_ORIGIN=http://localhost:5173
```

**Client:**
```bash
cp client/.env.example client/.env
```

`client/.env` can be left as-is for local development (leave `VITE_API_BASE_URL` empty).

### 3. Configure Google OAuth

In Google Cloud Console → APIs & Services → Credentials → your OAuth 2.0 Client:

- Add `http://localhost:3001/api/auth/callback` to **Authorized redirect URIs**
- Add `http://localhost:5173` to **Authorized JavaScript origins**

### 4. Run locally

```bash
npm run dev
```

This starts both the server (`:3001`) and client (`:5173`) concurrently. Open `http://localhost:5173`.

---

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start server + client in development mode |
| `npm run build` | Build both server and client for production |
| `npm start` | Start the built server (`node server/dist/index.js`) |
| `npm run install:all` | Install dependencies for root, server, and client |

---

## Architecture

### Classification Pipeline

1. **Fetch** — `fetchThreads()` calls `gmail.users.threads.list` (1 API call for up to 200 thread IDs), then batches `threads.get` calls in chunks of 20 to retrieve metadata.
2. **Batch** — `classifyThreadsStreaming()` groups threads into batches of ~10 and runs them concurrently with `Promise.all`. Each batch is one Claude API call.
3. **Prompt** — Each batch sends all thread subjects/senders/snippets in a single prompt. Bucket definitions and any user-configured hints are included in the system prompt. Claude returns a validated JSON array via Zod schema.
4. **Stream** — As each batch resolves, an SSE event is sent to the client. The client dispatches `BATCH_RESOLVED` to merge threads into state progressively.
5. **Post-process** — `enforceAutoArchiveExclusivity` removes Auto-archive threads from all other buckets.

### State Management

Client state lives in a `useReducer` hook with localStorage persistence. On mount, if classified threads exist in localStorage, they're shown immediately — no API call needed. A 90-second background poll checks for new thread IDs and classifies only the delta.

### Persistence

SQLite (`paxton.db`) stores two tables:
- `token_store` — OAuth tokens keyed by session ID, so users stay logged in across server restarts
- `user_buckets` — per-user bucket names and prompt hints

---

## Environment Variables

### Server (`server/.env`)

| Variable | Required | Description |
|---|---|---|
| `GOOGLE_CLIENT_ID` | Yes | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Yes | Google OAuth client secret |
| `GOOGLE_REDIRECT_URI` | Yes | OAuth callback URL (must match Google Console) |
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key for Claude |
| `SESSION_SECRET` | Yes | Secret for signing session cookies |
| `PORT` | No | Server port (default: 3001) |
| `CLIENT_ORIGIN` | No | CORS allowed origin (default: http://localhost:5173) |

### Client (`client/.env`)

| Variable | Required | Description |
|---|---|---|
| `VITE_API_BASE_URL` | No | Base URL of the server (empty = same origin, for local dev) |
