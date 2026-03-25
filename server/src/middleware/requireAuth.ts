import type { Request, Response, NextFunction } from 'express';
import { tokenStore } from '../services/tokenStore';

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const record = tokenStore.get(req.session.id);
  if (!record) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}
