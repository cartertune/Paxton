import type {
  Thread,
  DraftResult,
  SummaryResult,
  BucketSuggestion,
} from "../types";

const BASE = import.meta.env.VITE_API_BASE_URL ?? "";

// Token storage
let authToken: string | null = localStorage.getItem("authToken");

export function setAuthToken(token: string | null) {
  authToken = token;
  if (token) {
    localStorage.setItem("authToken", token);
  } else {
    localStorage.removeItem("authToken");
  }
}

export function getAuthToken(): string | null {
  return authToken;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...init?.headers,
  };

  // Add Bearer token if available
  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }

  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status}: ${text}`);
  }

  return res.json() as Promise<T>;
}

export interface StreamCallbacks {
  onProgress: (completedBatches: number, totalBatches: number) => void;
  onBatch: (threads: Thread[]) => void;
  onDone: () => void;
  onError: (message: string) => void;
}

async function classifyStreamReal(
  buckets: string[],
  bucketHints: Record<string, string>,
  callbacks: StreamCallbacks,
): Promise<void> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  // Add Bearer token if available
  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }

  const res = await fetch(`${BASE}/api/emails/classify/stream`, {
    method: "POST",
    headers,
    body: JSON.stringify({ buckets, bucketHints }),
  });

  if (!res.ok) {
    if (res.status === 401) {
      window.location.href = `${BASE}/api/auth/google`;
      return;
    }
    const text = await res.text().catch(() => res.statusText);
    callbacks.onError(`${res.status}: ${text}`);
    return;
  }

  const reader = res.body?.getReader();
  if (!reader) {
    callbacks.onError("Response body is not readable");
    return;
  }

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // SSE messages are separated by double newlines
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";

    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith("data: ")) continue;
      try {
        const payload = JSON.parse(line.slice(6)) as {
          threads?: Thread[];
          completedBatches?: number;
          totalBatches?: number;
          done?: boolean;
          error?: string;
        };

        if (payload.error) {
          callbacks.onError(payload.error);
          return;
        }
        if (
          payload.threads &&
          payload.completedBatches !== undefined &&
          payload.totalBatches !== undefined
        ) {
          callbacks.onProgress(payload.completedBatches, payload.totalBatches);
          callbacks.onBatch(payload.threads);
        }
        if (payload.done) {
          callbacks.onDone();
          return;
        }
      } catch {
        // Malformed SSE line — skip
      }
    }
  }

  callbacks.onDone();
}

export const api = {
  getMe(): Promise<{ email: string }> {
    return apiFetch("/api/auth/me");
  },

  logout(): Promise<{ ok: boolean }> {
    return apiFetch("/api/auth/logout", { method: "POST" });
  },

  classifyStream(
    buckets: string[],
    bucketHints: Record<string, string>,
    callbacks: StreamCallbacks,
  ): Promise<void> {
    return classifyStreamReal(buckets, bucketHints, callbacks);
  },

  getSettings(): Promise<{ buckets: Array<{ name: string; hint?: string }> }> {
    return apiFetch("/api/settings");
  },

  saveSettings(
    buckets: Array<{ name: string; hint?: string }>,
  ): Promise<{ ok: boolean }> {
    return apiFetch("/api/settings", {
      method: "PUT",
      body: JSON.stringify(buckets),
    });
  },

  getThreadBody(threadId: string): Promise<{ body: string }> {
    return apiFetch(`/api/emails/thread/${threadId}`);
  },

  getThreadIds(): Promise<{ ids: string[] }> {
    return apiFetch("/api/emails/threads/ids");
  },

  classifyIncremental(
    threadIds: string[],
    buckets: string[],
    bucketHints: Record<string, string>,
  ): Promise<{ threads: Thread[] }> {
    return apiFetch("/api/emails/classify/incremental", {
      method: "POST",
      body: JSON.stringify({ threadIds, buckets, bucketHints }),
    });
  },

  getDrafts(
    threadId: string,
    subject: string,
    sender: string,
    body: string,
  ): Promise<DraftResult> {
    return apiFetch(`/api/emails/thread/${threadId}/drafts`, {
      method: "POST",
      body: JSON.stringify({ subject, sender, body }),
    });
  },

  getSummary(
    threadId: string,
    subject: string,
    sender: string,
    body: string,
  ): Promise<SummaryResult> {
    return apiFetch(`/api/emails/thread/${threadId}/summary`, {
      method: "POST",
      body: JSON.stringify({ subject, sender, body }),
    });
  },

  markRead(threadId: string): Promise<{ ok: boolean }> {
    return apiFetch(`/api/emails/thread/${threadId}/mark-read`, {
      method: "POST",
    });
  },

  archive(threadId: string): Promise<{ ok: boolean }> {
    return apiFetch(`/api/emails/thread/${threadId}/archive`, {
      method: "POST",
    });
  },

  suggestBuckets(
    threads: Thread[],
  ): Promise<{ suggestions: BucketSuggestion[] }> {
    return apiFetch("/api/emails/suggest-buckets", {
      method: "POST",
      body: JSON.stringify({
        threads: threads.map((t) => ({
          subject: t.subject,
          sender: t.sender,
          snippet: t.snippet,
          buckets: t.buckets,
        })),
      }),
    });
  },
};
