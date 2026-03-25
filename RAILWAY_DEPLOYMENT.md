# Railway Deployment Guide

This guide walks you through deploying Inbox Concierge to Railway with PostgreSQL.

## Prerequisites

- A [Railway](https://railway.app) account
- Your code pushed to a GitHub repository
- Google OAuth credentials (Client ID, Client Secret, Redirect URI)
- Anthropic API key

## Step 1: Add PostgreSQL to Your Railway Project

1. Go to your Railway project dashboard
2. Click **"New"** → **"Database"** → **"Add PostgreSQL"**
3. Railway will automatically provision a PostgreSQL database and set the `DATABASE_URL` environment variable

## Step 2: Deploy Your Application

### Option A: Deploy from GitHub (Recommended)

1. In Railway, click **"New"** → **"GitHub Repo"**
2. Select your `inbox-concierge` repository
3. Railway will automatically detect it as a Node.js app and start building

### Option B: Deploy with Railway CLI

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Link to your project
railway link

# Deploy
railway up
```

## Step 3: Set Environment Variables

In your Railway service settings, add the following environment variables:

### Required Variables

```
NODE_ENV=production
PORT=3000

# Google OAuth (from Google Cloud Console)
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=https://your-railway-domain.railway.app/api/auth/callback

# Anthropic API
ANTHROPIC_API_KEY=sk-ant-xxx

# Session Secret (generate a random string)
SESSION_SECRET=your-random-secret-string-here

# Client Origin (your Railway frontend URL)
CLIENT_ORIGIN=https://your-railway-domain.railway.app
```

### PostgreSQL Connection

Railway automatically sets `DATABASE_URL` when you add the PostgreSQL database. The app will automatically detect this and use PostgreSQL instead of SQLite.

## Step 4: Update Google OAuth Settings

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Navigate to **APIs & Services** → **Credentials**
3. Edit your OAuth 2.0 Client ID
4. Add your Railway domain to **Authorized JavaScript origins**:
   ```
   https://your-railway-domain.railway.app
   ```
5. Add your callback URL to **Authorized redirect URIs**:
   ```
   https://your-railway-domain.railway.app/api/auth/callback
   ```

## Step 5: Verify Deployment

1. Open your Railway service URL (e.g., `https://your-project.railway.app`)
2. Test the Google OAuth login flow
3. Check Railway logs for any errors:
   ```bash
   railway logs
   ```

## Database Migration Notes

The app automatically creates the necessary database tables on startup:
- `user_buckets` - Stores custom email bucket configurations per user
- `token_store` - Stores OAuth tokens and session data

### Local Development vs Production

- **Local development**: Uses SQLite (`paxton.db` file)
- **Railway production**: Uses PostgreSQL (via `DATABASE_URL`)

The app automatically detects which database to use based on the presence of the `DATABASE_URL` environment variable.

## Troubleshooting

### Build Fails with "tsc: not found"

✅ **Fixed!** TypeScript has been moved to `dependencies` in both `server/package.json` and `client/package.json`.

### Database Connection Issues

Check that:
1. PostgreSQL service is running in Railway
2. `DATABASE_URL` environment variable is set
3. Check logs: `railway logs` to see connection errors

### OAuth Redirect Issues

Verify:
1. `GOOGLE_REDIRECT_URI` matches exactly what's in Google Cloud Console
2. `CLIENT_ORIGIN` is set to your Railway domain
3. Railway domain is added to Google OAuth authorized origins

### Session Issues

Make sure `SESSION_SECRET` is set to a secure random string (not the default).

## Monitoring

- View logs: `railway logs --follow`
- Monitor metrics in Railway dashboard
- Set up alerts for database connection issues

## Scaling Considerations

The current setup uses:
- PostgreSQL for persistent data storage
- Server-side sessions stored in the database

For high-traffic scenarios, consider:
- Adding Redis for session storage
- Implementing connection pooling
- Horizontal scaling of the web service

## Cost Estimation

Railway's free tier includes:
- $5 credit per month
- PostgreSQL database included

Typical usage for this app should stay within the free tier for personal use.

---

## Support

If you encounter issues:
1. Check Railway logs: `railway logs`
2. Review environment variables in Railway dashboard
3. Verify Google OAuth settings in Cloud Console
4. Check the main [README.md](./README.md) for app-specific documentation