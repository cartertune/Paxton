import type {
  Thread,
  Bucket,
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
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string>),
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


export const api = {
  getMe(): Promise<{ email: string }> {
    return apiFetch("/api/auth/me");
  },

  logout(): Promise<{ ok: boolean }> {
    return apiFetch("/api/auth/logout", { method: "POST" });
  },

  async classifyAll(
    onProgress?: (pct: number) => void,
  ): Promise<{ threads: Thread[] }> {
    const headers: HeadersInit = { "Content-Type": "application/json" };
    if (authToken) headers["Authorization"] = `Bearer ${authToken}`;

    const res = await fetch(`${BASE}/api/emails/classify/stream`, {
      method: "POST",
      headers,
    });

    if (!res.ok) {
      if (res.status === 401) { window.location.href = `${BASE}/api/auth/google`; }
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`${res.status}: ${text}`);
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error("Response body is not readable");

    const decoder = new TextDecoder();
    let buffer = "";
    const allThreads: Thread[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
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
            if (payload.error === "GMAIL_PERMISSION_DENIED") {
              throw new Error("Gmail access was denied. Your Google account may not be authorized to use this app yet. Please contact the app owner to be added as a test user.");
            }
            throw new Error(payload.error);
          }
          if (payload.threads) allThreads.push(...payload.threads);
          if (payload.completedBatches !== undefined && payload.totalBatches && payload.totalBatches > 0) {
            onProgress?.(Math.round((payload.completedBatches / payload.totalBatches) * 100));
          }
        } catch (e) {
          if (e instanceof Error && e.message !== "Malformed SSE") throw e;
        }
      }
    }

    return { threads: allThreads };
  },

  getSettings(): Promise<{ buckets: Bucket[] }> {
    return apiFetch("/api/settings");
  },

  saveSettings(
    buckets: Bucket[],
  ): Promise<{ buckets: Bucket[] }> {
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
  ): Promise<{ threads: Thread[] }> {
    return apiFetch("/api/emails/classify/incremental", {
      method: "POST",
      body: JSON.stringify({ threadIds }),
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
          bucketIds: t.bucketIds,
        })),
      }),
    });
  },
};
