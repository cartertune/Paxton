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

  classifyAll(
    buckets: string[],
    bucketHints: Record<string, string>,
  ): Promise<{ threads: Thread[] }> {
    return apiFetch("/api/emails/classify", {
      method: "POST",
      body: JSON.stringify({ buckets, bucketHints }),
    });
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
