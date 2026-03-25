# Paxton — Submission Plan

## Submission Requirements (Tenex)

1. **Video** — unlisted YouTube, < 10 min (see video-script.md)
2. **Ashby** — use submission link from initial instructions
3. **Email** — alex@tenex.co, arman@tenex.co, dean@tenex.co, dan@tenex.co, brett@tenex.co
   - Subject: `Carter Tune | Engineering Take-Home Assignment`
   - Body: YouTube link, GitHub link, live deployed URL

---

## Deployment Steps

### Server → Railway

1. Push repo to GitHub (ensure `server/.env` is gitignored — never committed)
2. Go to railway.app → New Project → Deploy from GitHub
3. Select repo → set root directory to `server/`
4. Build command: `npm run build`
5. Start command: `node dist/index.js`
6. Add environment variables in Railway dashboard (copy from local `server/.env`):
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `GOOGLE_REDIRECT_URI` → update to `https://<your-railway-domain>/api/auth/callback`
   - `ANTHROPIC_API_KEY`
   - `SESSION_SECRET` → generate a new random string for production
   - `PORT` → Railway sets this automatically, can omit
   - `CLIENT_ORIGIN` → set after Vercel deploy
   - `NODE_ENV=production`
7. Note your Railway URL (e.g. `https://paxton-server-production.up.railway.app`)

**Important:** Update `GOOGLE_REDIRECT_URI` in Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client → Authorized redirect URIs. Add the Railway callback URL.

### Client → Vercel

1. Go to vercel.com → New Project → Import from GitHub
2. Select repo → set root directory to `client/`
3. Build command: `npm run build`
4. Output directory: `dist`
5. Add environment variable:
   - `VITE_API_BASE_URL` = your Railway URL (e.g. `https://paxton-server-production.up.railway.app`)
6. Deploy → note your Vercel URL

**After Vercel deploys:**
- Go back to Railway → update `CLIENT_ORIGIN` env var to your Vercel URL
- Redeploy Railway service for the CORS change to take effect

### SQLite on Railway

Railway doesn't persist the filesystem between deploys by default. For the SQLite DB:
- Add a Railway volume (Storage → Add Volume → mount at `/app/data`)
- Update `server/src/services/db.ts` to use `/app/data/paxton.db` when `NODE_ENV=production`

Or simpler: use Railway's ephemeral storage and accept that tokens reset on redeploy (users re-login). For a demo submission, this is acceptable.

---

## Pre-Submission Checklist

### Code
- [ ] `git status` — `server/.env` and `client/.env` NOT listed
- [ ] `npm run build` passes (both packages)
- [ ] `npx tsc --noEmit` clean in `client/` and `server/`
- [ ] App loads at live URL without errors

### Deployment
- [ ] Railway server health check: `GET https://<railway-url>/health` returns `{ ok: true }`
- [ ] Vercel client loads and shows login page
- [ ] Google OAuth completes successfully at production URL
- [ ] Classification runs and emails appear
- [ ] Settings page saves and triggers reclassify

### Video
- [ ] Recorded, < 10 min
- [ ] Covers: demo, architecture, trade-offs, AI usage, next steps
- [ ] Uploaded to YouTube as unlisted

### GitHub
- [ ] Repo is public
- [ ] README.md is complete and accurate
- [ ] No secrets committed (check with `git log --all -p | grep -i "sk-ant\|secret\|password"`)

### Email
- [ ] Draft email ready with correct subject line
- [ ] YouTube link included
- [ ] GitHub repo link included
- [ ] Live Vercel URL included
- [ ] Sent to all 5 addresses

---

## Email Template

```
Subject: Carter Tune | Engineering Take-Home Assignment

Hi team,

Please find my Paxton submission below.

Demo video: [YouTube unlisted link]
GitHub: [https://github.com/...]
Live app: [https://your-vercel-url.vercel.app]

Happy to answer any questions. Thanks for the opportunity.

Carter
```
