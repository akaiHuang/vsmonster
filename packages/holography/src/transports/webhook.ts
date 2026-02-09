/**
 * Holography Webhook Transport
 * 處理來自社群平台的 Webhook 請求
 */

import express, { Express, Router, Request, Response, NextFunction } from 'express';
import { EventEmitter } from 'events';
import { ChannelType } from '../core/types';

export interface WebhookRoute {
  channel: ChannelType;
  path: string;
  method: 'GET' | 'POST';
  middleware?: express.RequestHandler[];
  handler: (req: Request, res: Response) => void | Promise<void>;
}

export interface WebhookTransportConfig {
  /** Express 應用實例（可選，若不提供會建立新的） */
  app?: Express;
  /** 基礎路徑 */
  basePath?: string;
}

export class WebhookTransport extends EventEmitter {
  private app: Express;
  private router: Router;
  private routes: Map<string, WebhookRoute> = new Map();
  private config: Required<WebhookTransportConfig>;

  constructor(config: WebhookTransportConfig = {}) {
    super();
    this.config = {
      app: config.app || express(),
      basePath: config.basePath || '/webhook',
    };
    this.app = this.config.app;
    this.router = Router();

    // 注意：不要在 router 級別使用 express.json()
    // LINE webhook 需要 raw body 來驗證簽名
    // JSON 解析會在各個路由處理器中按需處理
    this.router.use(express.urlencoded({ extended: true }));
  }

  /**
   * 註冊 Webhook 路由
   */
  registerRoute(route: WebhookRoute): void {
    const fullPath = `${this.config.basePath}/${route.channel}${route.path}`;
    const key = `${route.method}:${fullPath}`;

    if (this.routes.has(key)) {
      throw new Error(`Route already registered: ${key}`);
    }

    const handlers: express.RequestHandler[] = [
      // 記錄請求
      (req: Request, res: Response, next: NextFunction) => {
        this.emit('request', {
          channel: route.channel,
          method: req.method,
          path: req.path,
          body: req.body,
          headers: req.headers,
        });
        next();
      },
      // 自訂 middleware
      ...(route.middleware || []),
      // 主要處理器
      async (req: Request, res: Response) => {
        try {
          await route.handler(req, res);
        } catch (error) {
          this.emit('error', { channel: route.channel, error });
          if (!res.headersSent) {
            res.status(500).json({ error: 'Internal server error' });
          }
        }
      },
    ];

    if (route.method === 'GET') {
      this.router.get(`/${route.channel}${route.path}`, ...handlers);
    } else {
      this.router.post(`/${route.channel}${route.path}`, ...handlers);
    }

    this.routes.set(key, route);
    this.emit('routeRegistered', { channel: route.channel, path: fullPath });
  }

  /**
   * 註冊 LINE Webhook
   */
  registerLineWebhook(
    path: string,
    middleware: express.RequestHandler[],
    handler: (req: Request, res: Response) => void | Promise<void>
  ): void {
    this.registerRoute({
      channel: 'line',
      path,
      method: 'POST',
      middleware,
      handler,
    });
  }

  /**
   * 註冊 Telegram Webhook
   */
  registerTelegramWebhook(
    path: string,
    handler: (req: Request, res: Response) => void | Promise<void>
  ): void {
    this.registerRoute({
      channel: 'telegram',
      path,
      method: 'POST',
      middleware: [express.json()], // Telegram 需要 JSON 解析
      handler,
    });
  }

  /**
   * 註冊 Discord Webhook（用於 Interactions）
   */
  registerDiscordWebhook(
    path: string,
    handler: (req: Request, res: Response) => void | Promise<void>
  ): void {
    this.registerRoute({
      channel: 'discord',
      path,
      method: 'POST',
      middleware: [express.json()], // Discord 需要 JSON 解析
      handler,
    });
  }

  /**
   * 獲取 Router
   */
  getRouter(): Router {
    return this.router;
  }

  /**
   * 掛載到 Express 應用
   */
  mount(): void {
    this.app.use(this.config.basePath, this.router);
    this.emit('mounted', { basePath: this.config.basePath });
  }

  /**
   * 獲取 Express 應用
   */
  getApp(): Express {
    return this.app;
  }

  /**
   * 獲取已註冊的路由
   */
  getRoutes(): { channel: ChannelType; method: string; path: string }[] {
    return Array.from(this.routes.values()).map(r => ({
      channel: r.channel,
      method: r.method,
      path: `${this.config.basePath}/${r.channel}${r.path}`,
    }));
  }

  /**
   * 建立健康檢查端點
   */
  addHealthCheck(path: string = '/health'): void {
    this.app.get(path, (req: Request, res: Response) => {
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        routes: this.getRoutes().length,
      });
    });
  }
}
