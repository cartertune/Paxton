import { google } from "googleapis";
import { tokenStore } from "./tokenStore";
import type { Credentials } from "google-auth-library";

export interface RawThread {
  id: string;
  subject: string;
  sender: string;
  snippet: string;
  timestamp: number;
  unread: boolean;
}

async function createOAuthClient(sessionId: string) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI,
  );

  const record = await tokenStore.get(sessionId);
  if (!record) throw new Error("No tokens found for session");

  oauth2Client.setCredentials(record.tokens);

  oauth2Client.on("tokens", (tokens: Credentials) => {
    tokenStore.updateTokens(sessionId, tokens);
  });

  return oauth2Client;
}

function parseFrom(from: string): string {
  // Parse "Display Name" <email@example.com> or just email@example.com
  const match = from.match(/^"?([^"<]+)"?\s*<?[^>]*>?$/);
  if (match) {
    const name = match[1].trim();
    return name || from;
  }
  return from;
}

function getHeader(
  headers: Array<{ name?: string | null; value?: string | null }>,
  name: string,
): string {
  const h = headers.find((h) => h.name?.toLowerCase() === name.toLowerCase());
  return h?.value ?? "";
}

export async function fetchThreads(sessionId: string): Promise<RawThread[]> {
  const auth = await createOAuthClient(sessionId);
  const gmail = google.gmail({ version: "v1", auth });

  // Fetch list of thread IDs
  const listRes = await gmail.users.threads.list({
    userId: "me",
    maxResults: 200,
  });

  const threadItems = listRes.data.threads ?? [];
  if (threadItems.length === 0) return [];

  // Batch into chunks of 20
  const chunks: Array<typeof threadItems> = [];
  for (let i = 0; i < threadItems.length; i += 20) {
    chunks.push(threadItems.slice(i, i + 20));
  }

  const results: RawThread[] = [];

  for (const chunk of chunks) {
    const threadDetails = await Promise.all(
      chunk.map(async (item) => {
        if (!item.id) return null;
        try {
          const res = await gmail.users.threads.get({
            userId: "me",
            id: item.id,
            format: "metadata",
            metadataHeaders: ["Subject", "From", "Date"],
          });
          return res.data;
        } catch {
          return null;
        }
      }),
    );

    for (const thread of threadDetails) {
      if (!thread || !thread.id || !thread.messages?.length) continue;

      const firstMsg = thread.messages[0];
      const headers = firstMsg.payload?.headers ?? [];
      const subject = getHeader(headers, "Subject") || "(no subject)";
      const fromRaw = getHeader(headers, "From") || "";
      const sender = parseFrom(fromRaw);
      const snippet = thread.snippet ?? "";
      const timestamp = parseInt(firstMsg.internalDate ?? "0", 10);
      // labelIds is present on messages returned with format:'metadata' at runtime
      // even though the TS types show it as optional
      const unread = thread.messages.some((m) => {
        const labels = (m as { labelIds?: string[] }).labelIds;
        return Array.isArray(labels) && labels.includes("UNREAD");
      });

      results.push({
        id: thread.id,
        subject,
        sender,
        snippet,
        timestamp,
        unread,
      });
    }
  }

  return results;
}

export async function fetchThreadIds(sessionId: string): Promise<string[]> {
  const auth = await createOAuthClient(sessionId);
  const gmail = google.gmail({ version: "v1", auth });

  const listRes = await gmail.users.threads.list({
    userId: "me",
    maxResults: 200,
  });

  return (listRes.data.threads ?? []).map((t) => t.id!).filter(Boolean);
}

export async function fetchThreadsByIds(
  sessionId: string,
  threadIds: string[],
): Promise<RawThread[]> {
  const auth = await createOAuthClient(sessionId);
  const gmail = google.gmail({ version: "v1", auth });

  const chunks: string[][] = [];
  for (let i = 0; i < threadIds.length; i += 20) {
    chunks.push(threadIds.slice(i, i + 20));
  }

  const results: RawThread[] = [];

  for (const chunk of chunks) {
    const threadDetails = await Promise.all(
      chunk.map(async (id) => {
        try {
          const res = await gmail.users.threads.get({
            userId: "me",
            id,
            format: "metadata",
            metadataHeaders: ["Subject", "From", "Date"],
          });
          return res.data;
        } catch {
          return null;
        }
      }),
    );

    for (const thread of threadDetails) {
      if (!thread || !thread.id || !thread.messages?.length) continue;

      const firstMsg = thread.messages[0];
      const headers = firstMsg.payload?.headers ?? [];
      const subject = getHeader(headers, "Subject") || "(no subject)";
      const fromRaw = getHeader(headers, "From") || "";
      const sender = parseFrom(fromRaw);
      const snippet = thread.snippet ?? "";
      const timestamp = parseInt(firstMsg.internalDate ?? "0", 10);
      const unread = thread.messages.some((m) => {
        const labels = (m as { labelIds?: string[] }).labelIds;
        return Array.isArray(labels) && labels.includes("UNREAD");
      });

      results.push({
        id: thread.id,
        subject,
        sender,
        snippet,
        timestamp,
        unread,
      });
    }
  }

  return results;
}

export async function fetchThreadBody(
  sessionId: string,
  threadId: string,
): Promise<string> {
  const auth = await createOAuthClient(sessionId);
  const gmail = google.gmail({ version: "v1", auth });

  const res = await gmail.users.threads.get({
    userId: "me",
    id: threadId,
    format: "full",
  });

  const messages = res.data.messages ?? [];
  if (messages.length === 0) return "";

  // Try to extract text from the last message in the thread (most recent reply)
  for (let i = messages.length - 1; i >= 0; i--) {
    const text = extractTextFromPayload(messages[i].payload ?? null);
    if (text.trim()) return text;
  }
  return "";
}

function extractTextFromPayload(payload: any | null): string {
  if (!payload) return "";

  // Check direct body data
  if (payload.body?.data) {
    const decoded = Buffer.from(payload.body.data, "base64url").toString(
      "utf-8",
    );
    if (payload.mimeType === "text/plain") return decoded;
    if (payload.mimeType === "text/html") return stripHtmlTags(decoded);
  }

  // Walk parts recursively, prefer text/plain
  const parts: any[] = payload.parts ?? [];
  let htmlFallback = "";

  for (const part of parts) {
    if (part.mimeType === "text/plain" && part.body?.data) {
      return Buffer.from(part.body.data, "base64url").toString("utf-8");
    }
    if (part.mimeType === "text/html" && part.body?.data) {
      htmlFallback = stripHtmlTags(
        Buffer.from(part.body.data, "base64url").toString("utf-8"),
      );
    }
    if (part.mimeType?.startsWith("multipart/")) {
      const nested = extractTextFromPayload(part);
      if (nested.trim()) return nested;
    }
  }

  return htmlFallback;
}

function stripHtmlTags(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s{2,}/g, "\n")
    .trim();
}

export async function markThreadRead(
  sessionId: string,
  threadId: string,
): Promise<void> {
  const oAuth2Client = await createOAuthClient(sessionId);
  const gmail = google.gmail({ version: "v1", auth: oAuth2Client });

  const thread = await gmail.users.threads.get({
    userId: "me",
    id: threadId,
    format: "minimal",
  });
  const messageIds =
    thread.data.messages?.map((m) => m.id!).filter(Boolean) ?? [];

  await Promise.all(
    messageIds.map((id) =>
      gmail.users.messages.modify({
        userId: "me",
        id,
        requestBody: { removeLabelIds: ["UNREAD"] },
      }),
    ),
  );
}

export async function archiveThread(
  sessionId: string,
  threadId: string,
): Promise<void> {
  const oAuth2Client = await createOAuthClient(sessionId);
  const gmail = google.gmail({ version: "v1", auth: oAuth2Client });

  await gmail.users.threads.modify({
    userId: "me",
    id: threadId,
    requestBody: { removeLabelIds: ["INBOX"] },
  });
}
