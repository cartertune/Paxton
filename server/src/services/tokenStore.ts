import type { Credentials } from 'google-auth-library';
import { dbGetToken, dbSetToken, dbUpdateTokens, dbDeleteToken } from './db';

interface TokenRecord {
  tokens: Credentials;
  email: string;
}

export const tokenStore = {
  set(sessionId: string, record: TokenRecord): void {
    dbSetToken(sessionId, record.email, record.tokens);
  },
  get(sessionId: string): TokenRecord | undefined {
    const row = dbGetToken(sessionId);
    if (!row) return undefined;
    return { email: row.email, tokens: row.tokens as Credentials };
  },
  updateTokens(sessionId: string, tokens: Credentials): void {
    dbUpdateTokens(sessionId, tokens);
  },
  delete(sessionId: string): void {
    dbDeleteToken(sessionId);
  },
};
