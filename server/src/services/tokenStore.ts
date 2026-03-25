import type { Credentials } from "google-auth-library";
import { dbGetToken, dbSetToken, dbUpdateTokens, dbDeleteToken } from "./db";

interface TokenRecord {
  tokens: Credentials;
  email: string;
}

export const tokenStore = {
  async set(sessionId: string, record: TokenRecord): Promise<void> {
    await dbSetToken(sessionId, record.email, record.tokens);
  },
  async get(sessionId: string): Promise<TokenRecord | undefined> {
    const row = await dbGetToken(sessionId);
    if (!row) return undefined;
    return { email: row.email, tokens: row.tokens as Credentials };
  },
  async updateTokens(sessionId: string, tokens: Credentials): Promise<void> {
    await dbUpdateTokens(sessionId, tokens);
  },
  async delete(sessionId: string): Promise<void> {
    await dbDeleteToken(sessionId);
  },
};
