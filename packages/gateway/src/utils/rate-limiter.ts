/**
 * Simple in-memory rate limiter middleware (no external dependencies).
 * Uses a sliding window approach with automatic cleanup of expired entries.
 */

import { Request, Response, NextFunction } from 'express';

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

export function createRateLimiter(options: {
  windowMs?: number;
  maxRequests?: number;
} = {}) {
  const { windowMs = 60000, maxRequests = 100 } = options;
  const clients = new Map<string, RateLimitEntry>();

  // Cleanup expired entries every minute
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of clients) {
      if (now > entry.resetTime) clients.delete(key);
    }
  }, 60000).unref();

  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip || req.socket?.remoteAddress || 'unknown';
    const now = Date.now();
    let entry = clients.get(key);

    if (!entry || now > entry.resetTime) {
      entry = { count: 0, resetTime: now + windowMs };
      clients.set(key, entry);
    }

    entry.count++;

    res.setHeader('X-RateLimit-Limit', String(maxRequests));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, maxRequests - entry.count)));

    if (entry.count > maxRequests) {
      res.status(429).json({ error: 'Too many requests' });
      return;
    }

    next();
  };
}
