import { Router } from "express";
import rateLimit from "express-rate-limit";
import { requireAuth, getSessionToken } from "../middleware/requireAuth";
import {
  fetchThreads,
  fetchThreadBody,
  fetchThreadIds,
  fetchThreadsByIds,
  markThreadRead,
  archiveThread,
} from "../services/gmail";
import {
  classifyThreads,
  classifyThreadsStreaming,
} from "../services/classifier";
import type { BucketDef } from "../services/classifier";
import { generateDraftReplies } from "../services/drafts";
import { generateSummary } from "../services/summary";
import { suggestBuckets } from "../services/suggestions";
import { z } from "zod";

export const emailsRouter = Router();

const classifyLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5,
  keyGenerator: (req) => getSessionToken(req) || "anonymous",
  message: {
    error: "Too many requests — please wait before classifying again.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const pollLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  keyGenerator: (req) => getSessionToken(req) || "anonymous",
  message: { error: "Too many poll requests." },
  standardHeaders: true,
  legacyHeaders: false,
});

const ClassifyBodySchema = z.object({
  buckets: z
    .array(
      z
        .string()
        .min(1)
        .max(50)
        .regex(/^[a-zA-Z0-9 _&'(),.!?-]+$/),
    )
    .min(1)
    .max(20),
  bucketHints: z.record(z.string(), z.string().max(200)).optional(),
});

// Non-streaming endpoint (kept for compatibility)
emailsRouter.post(
  "/classify",
  classifyLimiter,
  requireAuth,
  async (req, res) => {
    const parsed = ClassifyBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request body" });
      return;
    }

    const { buckets, bucketHints = {} } = parsed.data;
    const bucketDefs: BucketDef[] = buckets.map((name) => ({
      name,
      hint: bucketHints[name],
    }));

    try {
      const token = getSessionToken(req);
      if (!token) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      const threads = await fetchThreads(token);
      const classified = await classifyThreads(threads, bucketDefs);
      res.json({ threads: classified });
    } catch (err) {
      console.error("Classification error:", err);
      res.status(500).json({ error: "Classification failed" });
    }
  },
);

// SSE streaming endpoint — emits batch results as they resolve
emailsRouter.post(
  "/classify/stream",
  classifyLimiter,
  requireAuth,
  async (req, res) => {
    const parsed = ClassifyBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request body" });
      return;
    }

    const { buckets, bucketHints = {} } = parsed.data;
    const bucketDefs: BucketDef[] = buckets.map((name) => ({
      name,
      hint: bucketHints[name],
    }));

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    function send(payload: object) {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    }

    try {
      const token = getSessionToken(req);
      if (!token) {
        send({ error: "Unauthorized" });
        res.end();
        return;
      }
      const threads = await fetchThreads(token);

      if (threads.length === 0) {
        send({ done: true, threads: [] });
        res.end();
        return;
      }

      await classifyThreadsStreaming(
        threads,
        bucketDefs,
        (batchThreads, completedBatches, totalBatches) => {
          send({ threads: batchThreads, completedBatches, totalBatches });
        },
      );

      send({ done: true });
    } catch (err) {
      console.error("Streaming classification error:", err);
      send({ error: "Classification failed" });
    } finally {
      res.end();
    }
  },
);

emailsRouter.get("/threads/ids", pollLimiter, requireAuth, async (req, res) => {
  try {
    const token = getSessionToken(req);
    if (!token) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const ids = await fetchThreadIds(token);
    res.json({ ids });
  } catch (err) {
    console.error("Thread IDs fetch error:", err);
    res.status(500).json({ error: "Failed to fetch thread IDs" });
  }
});

const IncrementalClassifySchema = z.object({
  threadIds: z.array(z.string().min(1)).min(1).max(50),
  buckets: z
    .array(
      z
        .string()
        .min(1)
        .max(50)
        .regex(/^[a-zA-Z0-9 _&'(),.!?-]+$/),
    )
    .min(1)
    .max(20),
  bucketHints: z.record(z.string(), z.string().max(200)).optional(),
});

emailsRouter.post(
  "/classify/incremental",
  pollLimiter,
  requireAuth,
  async (req, res) => {
    const parsed = IncrementalClassifySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request body" });
      return;
    }

    const { threadIds, buckets, bucketHints = {} } = parsed.data;
    const bucketDefs: BucketDef[] = buckets.map((name) => ({
      name,
      hint: bucketHints[name],
    }));

    try {
      const token = getSessionToken(req);
      if (!token) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      const threads = await fetchThreadsByIds(token, threadIds);
      if (threads.length === 0) {
        res.json({ threads: [] });
        return;
      }
      const classified = await classifyThreads(threads, bucketDefs);
      res.json({ threads: classified });
    } catch (err) {
      console.error("Incremental classification error:", err);
      res.status(500).json({ error: "Incremental classification failed" });
    }
  },
);

emailsRouter.get("/thread/:id", requireAuth, async (req, res) => {
  const { id } = req.params;
  if (!id || typeof id !== "string") {
    res.status(400).json({ error: "Invalid thread ID" });
    return;
  }
  try {
    const token = getSessionToken(req);
    if (!token) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const body = await fetchThreadBody(token, id);
    res.json({ id, body });
  } catch (err) {
    console.error("Thread body fetch error:", err);
    res.status(500).json({ error: "Failed to fetch thread" });
  }
});

const DraftsBodySchema = z.object({
  subject: z.string().max(500),
  sender: z.string().max(500),
  body: z.string().max(10000),
});

emailsRouter.post(
  "/thread/:id/drafts",
  pollLimiter,
  requireAuth,
  async (req, res) => {
    const parsed = DraftsBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request body" });
      return;
    }
    const { subject, sender, body } = parsed.data;
    try {
      const result = await generateDraftReplies(subject, sender, body);
      res.json(result);
    } catch (err) {
      console.error("Draft generation error:", err);
      res.status(500).json({ error: "Failed to generate drafts" });
    }
  },
);

const SummaryBodySchema = z.object({
  subject: z.string().max(500),
  sender: z.string().max(200),
  body: z.string().max(50000),
});

emailsRouter.post(
  "/thread/:id/summary",
  pollLimiter,
  requireAuth,
  async (req, res) => {
    const parsed = SummaryBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request body" });
      return;
    }
    const { subject, sender, body } = parsed.data;
    try {
      const result = await generateSummary(subject, sender, body);
      res.json(result);
    } catch (err) {
      console.error("Summary generation error:", err);
      res.status(500).json({ error: "Failed to generate summary" });
    }
  },
);

emailsRouter.post(
  "/thread/:id/mark-read",
  pollLimiter,
  requireAuth,
  async (req, res) => {
    try {
      const token = getSessionToken(req);
      if (!token) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      await markThreadRead(token, req.params.id as string);
      res.json({ ok: true });
    } catch (err) {
      console.error("Mark read error:", err);
      res.status(500).json({ error: "Failed to mark thread as read" });
    }
  },
);

emailsRouter.post(
  "/thread/:id/archive",
  pollLimiter,
  requireAuth,
  async (req, res) => {
    try {
      const token = getSessionToken(req);
      if (!token) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      await archiveThread(token, req.params.id as string);
      res.json({ ok: true });
    } catch (err) {
      console.error("Archive error:", err);
      res.status(500).json({ error: "Failed to archive thread" });
    }
  },
);

const SuggestBucketsSchema = z.object({
  threads: z
    .array(
      z.object({
        subject: z.string(),
        sender: z.string(),
        snippet: z.string(),
        buckets: z.array(z.string()),
      }),
    )
    .max(500),
});

emailsRouter.post(
  "/suggest-buckets",
  pollLimiter,
  requireAuth,
  async (req, res) => {
    const parsed = SuggestBucketsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request body" });
      return;
    }
    const threads = parsed.data.threads.map(
      ({ subject, sender, snippet, buckets }) => ({
        subject,
        sender,
        snippet,
        buckets,
      }),
    );
    try {
      const suggestions = await suggestBuckets(threads);
      res.json({ suggestions });
    } catch (err) {
      console.error("Bucket suggestion error:", err);
      res.status(500).json({ error: "Failed to suggest buckets" });
    }
  },
);
