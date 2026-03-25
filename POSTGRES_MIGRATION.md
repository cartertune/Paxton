# PostgreSQL Migration Summary

This document summarizes the migration from SQLite to PostgreSQL for Railway deployment.

## What Changed

### 1. Database Service (`server/src/services/db.ts`)

**Before:** Used only SQLite with synchronous operations
```typescript
const db = new Database(path.join(process.cwd(), 'paxton.db'));
export function getBuckets(email: string): BucketRow[] { ... }
```

**After:** Dual database support with async operations
```typescript
// Auto-detect database based on DATABASE_URL environment variable
const usePostgres = !!process.env.DATABASE_URL;
export async function getBuckets(email: string): Promise<BucketRow[]> { ... }
```

**Key Features:**
- Automatically uses PostgreSQL when `DATABASE_URL` is set
- Falls back to SQLite for local development
- All database functions are now async
- Supports both SQL dialects (PostgreSQL uses `$1` placeholders, SQLite uses `?`)

### 2. Token Store (`server/src/services/tokenStore.ts`)

**Changes:**
- All methods converted to async: `get()`, `set()`, `updateTokens()`, `delete()`
- Returns Promises instead of synchronous results

### 3. Middleware (`server/src/middleware/requireAuth.ts`)

**Changes:**
- Function signature updated to `async`
- Uses `await tokenStore.get()`

### 4. Routes

All route handlers updated to handle async database calls:

**`server/src/routes/auth.ts`:**
- `/callback` - await tokenStore.set()
- `/me` - await tokenStore.get()
- `/logout` - await tokenStore.delete()

**`server/src/routes/settings.ts`:**
- `GET /` - await getBuckets()
- `PUT /` - await saveBuckets()

**`server/src/routes/emails.ts`:**
- Type safety fix for `req.params.id`

### 5. Gmail Service (`server/src/services/gmail.ts`)

**Changes:**
- `createOAuthClient()` now async
- Uses `await tokenStore.get()` and `tokenStore.updateTokens()`

### 6. Package Dependencies

**`server/package.json`:**
- Added: `pg` (PostgreSQL client)
- Added: `@types/pg` (TypeScript types)
- Moved `typescript` from devDependencies to dependencies (for Railway builds)

**`client/package.json`:**
- Moved `typescript` and `vite` to dependencies (for Railway builds)

### 7. Configuration Files

**New: `railway.json`**
```json
{
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "npm start",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

## Database Schema

Both SQLite and PostgreSQL use the same schema:

### `user_buckets` table
```sql
CREATE TABLE IF NOT EXISTS user_buckets (
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  hint TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (email, name)
)
```

### `token_store` table
```sql
CREATE TABLE IF NOT EXISTS token_store (
  session_id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  tokens TEXT NOT NULL
)
```

## Environment Variables

### Local Development
No `DATABASE_URL` → Uses SQLite automatically

### Railway Production
Set `DATABASE_URL` → Uses PostgreSQL automatically

Railway sets this automatically when you add a PostgreSQL database.

## Benefits of This Approach

1. **Zero Config Local Dev**: Developers don't need PostgreSQL installed locally
2. **Production Ready**: Persistent storage on Railway with PostgreSQL
3. **Automatic Detection**: No manual switching between databases
4. **Type Safety**: Full TypeScript support for both databases
5. **Backward Compatible**: Existing SQLite data structure preserved

## Testing the Migration

### Local (SQLite)
```bash
cd inbox-concierge
npm run dev
# Should see: "✓ Using SQLite database (local dev)"
```

### Railway (PostgreSQL)
```bash
railway logs
# Should see: "✓ Using PostgreSQL database"
```

## Common Issues & Solutions

### Issue: Build fails with "tsc: not found"
**Solution:** TypeScript moved to dependencies ✅

### Issue: Database not connecting on Railway
**Solution:** 
1. Verify PostgreSQL service is running
2. Check `DATABASE_URL` environment variable is set
3. Review Railway logs for connection errors

### Issue: Data not persisting between deploys
**Solution:** Make sure you're using the PostgreSQL database (check for `DATABASE_URL`)

### Issue: Async/await errors in existing code
**Solution:** All database calls must use `await` now:
```typescript
// ❌ Old (won't work anymore)
const buckets = getBuckets(email);

// ✅ New (required)
const buckets = await getBuckets(email);
```

## Files Modified

```
inbox-concierge/
├── railway.json                           (NEW)
├── RAILWAY_DEPLOYMENT.md                  (NEW)
├── POSTGRES_MIGRATION.md                  (NEW - this file)
├── server/
│   ├── package.json                       (MODIFIED - added pg, moved typescript)
│   └── src/
│       ├── services/
│       │   ├── db.ts                      (MODIFIED - dual database support)
│       │   ├── tokenStore.ts              (MODIFIED - async methods)
│       │   └── gmail.ts                   (MODIFIED - async oauth client)
│       ├── middleware/
│       │   └── requireAuth.ts             (MODIFIED - async middleware)
│       └── routes/
│           ├── auth.ts                    (MODIFIED - async tokenStore calls)
│           ├── settings.ts                (MODIFIED - async DB calls)
│           └── emails.ts                  (MODIFIED - type safety fixes)
└── client/
    └── package.json                       (MODIFIED - moved typescript & vite)
```

## Deployment Checklist

- [x] PostgreSQL support implemented
- [x] SQLite fallback for local dev
- [x] All database calls converted to async
- [x] TypeScript compilation working
- [x] Build dependencies moved to production
- [x] Railway configuration added
- [x] Documentation created

## Next Steps

1. **Commit and push changes**:
   ```bash
   git add .
   git commit -m "feat: add PostgreSQL support for Railway deployment"
   git push
   ```

2. **Deploy to Railway**:
   - Add PostgreSQL database in Railway dashboard
   - Set environment variables (see RAILWAY_DEPLOYMENT.md)
   - Deploy your app

3. **Verify deployment**:
   - Check logs for "✓ Using PostgreSQL database"
   - Test OAuth login flow
   - Verify data persists between deploys

## Rollback Plan

If you need to revert:
1. The SQLite functionality is preserved and still works locally
2. To use SQLite in production, simply remove `DATABASE_URL` from environment variables
3. Original SQLite data file is at `server/paxton.db` (not deployed to Railway)

---

**Migration completed**: All changes are backward compatible and the app automatically detects which database to use based on the environment.