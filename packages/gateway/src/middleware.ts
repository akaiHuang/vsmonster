/**
 * Gateway Middleware
 * Centralises all Express middleware setup: body parsing, security headers,
 * rate limiting, request ID injection, input sanitisation, and request logging.
 * Extracted from server.ts for improved maintainability.
 */

import express, { Express, Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import { createRateLimiter } from './utils/rate-limiter';
import { createLogger } from './utils/logger';
import * as crypto from 'crypto';

/**
 * Register all middleware on the Express app.
 * Must be called BEFORE route registration so middleware runs first.
 */
export function setupMiddleware(app: Express): void {
  // ── Body parsing ──────────────────────────────────────────
  // 注意：LINE webhook 需要 raw body 來驗證簽名，
  // 所以 JSON 解析必須跳過 /webhook/line 路徑

  app.use((req: Request, res: Response, next: NextFunction) => {
    // 跳過 LINE webhook - LINE SDK 需要 raw body 進行簽名驗證
    if (req.path.startsWith('/webhook/line')) {
      return next();
    }
    express.json({ limit: '50mb' })(req, res, next);
  });

  app.use((req: Request, res: Response, next: NextFunction) => {
    // 跳過 LINE webhook
    if (req.path.startsWith('/webhook/line')) {
      return next();
    }
    express.urlencoded({ extended: true, limit: '50mb' })(req, res, next);
  });

  // ── Security headers via helmet ───────────────────────────

  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    // Relax CSP for the inline-script test/send pages served by Gateway
    contentSecurityPolicy: false,
  }));

  // ── Rate limiting ─────────────────────────────────────────

  const generalLimiter = createRateLimiter({ windowMs: 60000, maxRequests: 100 });
  const strictLimiter = createRateLimiter({ windowMs: 60000, maxRequests: 10 });

  // General rate limiter for all routes except /health
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path === '/health') return next();
    generalLimiter(req, res, next);
  });

  // Stricter rate limiter for sensitive endpoints
  app.use('/webhook', strictLimiter);
  app.use('/api/handshake', strictLimiter);
  app.use('/api/send', strictLimiter);

  // ── Request tracing ───────────────────────────────────────

  app.use((_req: Request, res: Response, next: NextFunction) => {
    const requestId = crypto.randomUUID();
    res.setHeader('X-Request-ID', requestId);
    next();
  });

  // ── Cache control ─────────────────────────────────────────

  app.use('/api', (req: Request, res: Response, next: NextFunction) => {
    // Allow caching for media view/download (preview links)
    if (/^\/api\/media\/[^/]+\/(view|download|thumbnail)/.test(req.path)) {
      return next();
    }
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  // ── Input sanitisation ────────────────────────────────────

  // Reject excessively long URLs (> 2048 chars)
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.originalUrl.length > 2048) {
      res.status(414).json({ error: 'URI too long' });
      return;
    }
    if (req.originalUrl.includes('\0')) {
      res.status(400).json({ error: 'Bad request: null bytes not allowed' });
      return;
    }
    next();
  });

  // Reject null bytes in request body (JSON payloads)
  // 跳過 LINE webhook（body 由 LINE SDK 處理）
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/webhook/line')) {
      return next();
    }
    if (req.body && typeof req.body === 'object') {
      const bodyStr = JSON.stringify(req.body);
      if (bodyStr.includes('\\u0000') || bodyStr.includes('\0')) {
        res.status(400).json({ error: 'Bad request: null bytes not allowed in body' });
        return;
      }
    }
    next();
  });

  // ── Request logging (skip /health) ────────────────────────

  const reqLogger = createLogger('http');
  app.use((req, res, next) => {
    if (req.path === '/health') return next();
    const start = Date.now();
    res.on('finish', () => {
      reqLogger.info('request', {
        method: req.method,
        url: req.url,
        status: res.statusCode,
        ms: Date.now() - start,
      });
    });
    next();
  });
}
