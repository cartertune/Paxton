import type { Request, Response, NextFunction } from "express";
import { tokenStore } from "../services/tokenStore";

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const record = await tokenStore.get(req.session.id);
  if (!record) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}
