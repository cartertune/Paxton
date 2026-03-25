import type { Request, Response, NextFunction } from "express";
import { tokenStore } from "../services/tokenStore";

// Helper to get session token from request
export function getSessionToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  return authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null;
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
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

  // Store token in request for later use
  (req as any).sessionToken = token;
  next();
}
