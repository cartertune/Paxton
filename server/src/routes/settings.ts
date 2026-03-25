import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import { tokenStore } from '../services/tokenStore';
import { getBuckets, saveBuckets } from '../services/db';
import { z } from 'zod';

export const settingsRouter = Router();

const BucketsSchema = z.array(
  z.object({
    name: z.string().min(1).max(50).regex(/^[a-zA-Z0-9 _-]+$/),
    hint: z.string().max(300).optional(),
  })
).min(1).max(20);

settingsRouter.get('/', requireAuth, (req, res) => {
  const record = tokenStore.get(req.session.id);
  if (!record) { res.status(401).json({ error: 'Unauthorized' }); return; }

  try {
    const rows = getBuckets(record.email);
    res.json({ buckets: rows.map((r) => ({ name: r.name, hint: r.hint ?? undefined })) });
  } catch (err) {
    console.error('Failed to fetch buckets:', err);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

settingsRouter.put('/', requireAuth, (req, res) => {
  const parsed = BucketsSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Invalid buckets' }); return; }

  const record = tokenStore.get(req.session.id);
  if (!record) { res.status(401).json({ error: 'Unauthorized' }); return; }

  try {
    saveBuckets(record.email, parsed.data);
    res.json({ ok: true });
  } catch (err) {
    console.error('Failed to save buckets:', err);
    res.status(500).json({ error: 'Failed to save settings' });
  }
});

export default settingsRouter;
