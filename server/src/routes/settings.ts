import { Router } from "express";
import { requireAuth, getSessionToken } from "../middleware/requireAuth";
import { tokenStore } from "../services/tokenStore";
import { getBuckets, saveBuckets } from "../services/db";
import { DEFAULT_BUCKETS } from "../services/classifier";
import { z } from "zod";

export const settingsRouter = Router();

const BucketsSchema = z
  .array(
    z.object({
      id: z.string().optional(),
      name: z
        .string()
        .min(1)
        .max(50)
        .regex(/^[a-zA-Z0-9 _&'(),.!?-]+$/),
      hint: z.string().max(300).optional(),
    }),
  )
  .min(1)
  .max(20);

settingsRouter.get("/", requireAuth, async (req, res) => {
  const token = getSessionToken(req);
  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const record = await tokenStore.get(token);
  if (!record) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const rows = await getBuckets(record.email);
    const buckets = rows.length > 0
      ? rows.map((r) => ({ id: r.id, name: r.name, hint: r.hint ?? undefined }))
      : DEFAULT_BUCKETS;
    res.json({ buckets });
  } catch (err) {
    console.error("Failed to fetch buckets:", err);
    res.status(500).json({ error: "Failed to fetch settings" });
  }
});

settingsRouter.put("/", requireAuth, async (req, res) => {
  const parsed = BucketsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid buckets" });
    return;
  }

  const token = getSessionToken(req);
  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const record = await tokenStore.get(token);
  if (!record) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const rows = await saveBuckets(record.email, parsed.data);
    res.json({ buckets: rows.map((r) => ({ id: r.id, name: r.name, hint: r.hint ?? undefined })) });
  } catch (err) {
    console.error("Failed to save buckets:", err);
    res.status(500).json({ error: "Failed to save settings" });
  }
});

export default settingsRouter;
