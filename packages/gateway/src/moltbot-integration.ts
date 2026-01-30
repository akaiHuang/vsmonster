/**
 * VSMONSTER - Moltbot 整合層
 * 
 * 不重複造輪子！使用 moltbot 處理社群軟體連接，
 * VSMONSTER 專注於 VS Code Copilot 整合。
 * 
 * @see https://github.com/moltbot/moltbot
 */

import { EventEmitter } from 'events';

// Moltbot 提供的功能（通過 Gateway WebSocket 連接）
// moltbot gateway --port 18789

export interface MoltbotMessage {
  channel: 'telegram' | 'discord' | 'line' | 'whatsapp' | 'slack' | 'signal';
  from: string;
  body: string;
  sessionKey: string;
  mediaUrls?: string[];
  replyToken?: string;
}

export interface CopilotResponse {
  text: string;
  sessionKey: string;
  channel: string;
  to: string;
}

/**
 * Moltbot Gateway 客戶端
 * 連接到 moltbot gateway 的 WebSocket API
 */
export class MoltbotClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private gatewayUrl: string;
  private reconnectTimer: NodeJS.Timeout | null = null;

  constructor(gatewayUrl: string = 'ws://127.0.0.1:18789') {
    super();
    this.gatewayUrl = gatewayUrl;
  }

  /**
   * 連接到 Moltbot Gateway
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // 使用 ws 庫而非瀏覽器 WebSocket
        const WebSocket = require('ws');
        this.ws = new WebSocket(this.gatewayUrl);

        this.ws.onopen = () => {
          console.log('✅ Connected to Moltbot Gateway');
          this.emit('connected');
          resolve();
        };

        this.ws.onmessage = (event: MessageEvent) => {
          try {
            const data = JSON.parse(event.data);
            this.handleGatewayMessage(data);
          } catch (err) {
            console.error('Failed to parse gateway message:', err);
          }
        };

        this.ws.onclose = () => {
          console.log('🔌 Disconnected from Moltbot Gateway');
          this.emit('disconnected');
          this.scheduleReconnect();
        };

        this.ws.onerror = (err: Error) => {
          console.error('❌ Moltbot Gateway error:', err);
          this.emit('error', err);
          reject(err);
        };
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * 處理來自 Gateway 的訊息
   */
  private handleGatewayMessage(data: any): void {
    const { method, params } = data;

    switch (method) {
      case 'message.inbound':
        // 來自社群軟體的訊息
        this.emit('message', {
          channel: params.channel,
          from: params.from,
          body: params.body,
          sessionKey: params.sessionKey,
          mediaUrls: params.mediaUrls,
          replyToken: params.replyToken,
        } as MoltbotMessage);
        break;

      case 'session.update':
        this.emit('session', params);
        break;

      case 'presence.update':
        this.emit('presence', params);
        break;

      default:
        // 其他 Gateway 事件
        this.emit('gateway', data);
    }
  }

  /**
   * 發送回覆到社群軟體
   * 使用 moltbot 的 message.send RPC
   */
  async sendReply(response: CopilotResponse): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected to Moltbot Gateway');
    }

    const payload = {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'message.send',
      params: {
        channel: response.channel,
        to: response.to,
        text: response.text,
        sessionKey: response.sessionKey,
      },
    };

    this.ws.send(JSON.stringify(payload));
  }

  /**
   * 使用 moltbot CLI 發送訊息
   * 適合一次性發送，不需要 WebSocket 連接
   */
  static async sendViaCLI(
    channel: string,
    to: string,
    message: string
  ): Promise<void> {
    const { exec } = require('child_process');
    const cmd = `moltbot message send --channel ${channel} --to "${to}" --message "${message}"`;
    
    return new Promise((resolve, reject) => {
      exec(cmd, (error: Error | null, stdout: string, stderr: string) => {
        if (error) {
          reject(new Error(`moltbot CLI error: ${stderr}`));
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * 檢查 Moltbot 是否已安裝和配置
   */
  static async checkMoltbotInstalled(): Promise<{
    installed: boolean;
    version?: string;
    configured?: boolean;
  }> {
    const { exec } = require('child_process');
    
    return new Promise((resolve) => {
      exec('moltbot --version', (error: Error | null, stdout: string) => {
        if (error) {
          resolve({ installed: false });
        } else {
          const version = stdout.trim();
          // 檢查配置
          exec('moltbot doctor --json', (err2: Error | null, doctorOut: string) => {
            if (err2) {
              resolve({ installed: true, version, configured: false });
            } else {
              try {
                const doctor = JSON.parse(doctorOut);
                resolve({ 
                  installed: true, 
                  version, 
                  configured: doctor.status === 'ok' 
                });
              } catch {
                resolve({ installed: true, version, configured: false });
              }
            }
          });
        }
      });
    });
  }

  /**
   * 執行 moltbot onboard 引導設定
   */
  static async runOnboarding(): Promise<void> {
    const { spawn } = require('child_process');
    
    return new Promise((resolve, reject) => {
      const onboard = spawn('moltbot', ['onboard'], {
        stdio: 'inherit',
        shell: true,
      });

      onboard.on('close', (code: number) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Onboarding exited with code ${code}`));
        }
      });
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      console.log('🔄 Reconnecting to Moltbot Gateway...');
      this.connect().catch(console.error);
    }, 5000);
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

/**
 * VSMONSTER 使用方式：
 * 
 * 1. 確保 moltbot 已安裝：
 *    npm install -g moltbot@latest
 *    moltbot onboard --install-daemon
 * 
 * 2. VSMONSTER 連接到 moltbot gateway：
 *    const client = new MoltbotClient();
 *    await client.connect();
 * 
 * 3. 監聽訊息並轉發到 VS Code Copilot：
 *    client.on('message', async (msg) => {
 *      const response = await copilotBridge.process(msg.body);
 *      await client.sendReply({
 *        text: response,
 *        channel: msg.channel,
 *        to: msg.from,
 *        sessionKey: msg.sessionKey,
 *      });
 *    });
 */

export default MoltbotClient;
