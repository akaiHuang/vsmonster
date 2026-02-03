import ngrok from 'ngrok';
import { logger } from '../utils/logger';

export interface TunnelConfig {
  enabled: boolean;
  authtoken?: string;
  region?: string;
  subdomain?: string;
}

export interface TunnelStatus {
  active: boolean;
  url?: string;
  startedAt?: Date;
  error?: string;
}

/**
 * Ngrok 隧道服務
 * 用於將本地服務暴露到公網，方便預覽開發結果
 */
export class TunnelService {
  private config: TunnelConfig;
  private status: TunnelStatus = { active: false };
  private url: string | null = null;

  constructor(config?: TunnelConfig) {
    this.config = config || { enabled: false };
  }

  /**
   * 啟動 ngrok 隧道
   */
  async start(port: number): Promise<string | null> {
    if (!this.config.enabled) {
      logger.info('Tunnel service disabled');
      return null;
    }

    try {
      // 配置 ngrok
      if (this.config.authtoken) {
        await ngrok.authtoken(this.config.authtoken);
      }

      // 連接 ngrok
      this.url = await ngrok.connect({
        addr: port,
        region: (this.config.region as any) || 'ap',
        subdomain: this.config.subdomain,
      });

      this.status = {
        active: true,
        url: this.url,
        startedAt: new Date(),
      };

      logger.info(`Ngrok tunnel started: ${this.url}`);
      return this.url;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.status = {
        active: false,
        error: errorMessage,
      };
      logger.error('Failed to start ngrok tunnel:', error);
      return null;
    }
  }

  /**
   * 停止 ngrok 隧道
   */
  async stop(): Promise<void> {
    if (!this.status.active) return;

    try {
      await ngrok.disconnect();
      await ngrok.kill();
      
      this.status = { active: false };
      this.url = null;
      
      logger.info('Ngrok tunnel stopped');
    } catch (error) {
      logger.error('Failed to stop ngrok tunnel:', error);
    }
  }

  /**
   * 取得隧道狀態
   */
  getStatus(): TunnelStatus {
    return { ...this.status };
  }

  /**
   * 取得公開 URL
   */
  getUrl(): string | null {
    return this.url;
  }

  /**
   * 重新啟動隧道
   */
  async restart(port: number): Promise<string | null> {
    await this.stop();
    return this.start(port);
  }
}
