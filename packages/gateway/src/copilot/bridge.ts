import { logger } from '../utils/logger';

/**
 * Copilot 橋接器 (Gateway 端)
 * 負責將指令傳送到 VS Code Extension
 */
export class CopilotBridge {
  private connected: boolean = false;

  constructor() {
    logger.info('CopilotBridge initialized');
  }

  /**
   * 檢查是否已連接到 VS Code
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * 設定連接狀態
   */
  setConnected(connected: boolean): void {
    this.connected = connected;
    logger.info(`Copilot connection status: ${connected ? 'connected' : 'disconnected'}`);
  }
}
