import { Bot, Context, InputFile, webhookCallback } from 'grammy';
import { ChannelAdapter, IncomingMessage, OutgoingMessage } from '../base';
import { logger } from '../../utils/logger';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

export interface TelegramConfig {
  botToken: string;
  webhookUrl?: string;
  whitelist?: string[];  // 白名單用戶 ID
}

// 自定義 API 請求函數，使用 curl 繞過 Node.js 網路問題
async function customFetch(url: string, init?: RequestInit): Promise<Response> {
  const method = init?.method || 'GET';
  const body = init?.body ? String(init.body) : '';
  
  try {
    let cmd: string;
    if (method === 'POST' && body) {
      cmd = `curl -s -X POST "${url}" -H "Content-Type: application/json" -d '${body.replace(/'/g, "'\\''")}'`;
    } else {
      cmd = `curl -s "${url}"`;
    }
    
    const { stdout } = await execAsync(cmd, { timeout: 30000 });
    return new Response(stdout, {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    throw new Error(`Curl fetch failed: ${error}`);
  }
}

export class TelegramChannel implements ChannelAdapter {
  readonly name = 'telegram';
  private bot: Bot;
  private config: TelegramConfig;
  private useCurlFallback = false;
  private whitelistPath: string;

  constructor(config: TelegramConfig) {
    this.config = config;
    this.bot = new Bot(config.botToken);
    this.whitelistPath = path.join(process.cwd(), 'configs', 'telegram-whitelist.json');
    this.loadWhitelist();
  }

  /**
   * 驗證請求是否來自白名單用戶
   */
  isWhitelisted(userId: string): boolean {
    // 如果沒有設定白名單，需要握手
    if (!this.config.whitelist || this.config.whitelist.length === 0) {
      return false;
    }
    
    const allowed = this.config.whitelist.includes(userId);
    if (!allowed) {
      logger.warn(`Telegram user ${userId} not in whitelist`);
    }
    return allowed;
  }
  
  /**
   * 添加用戶到白名單
   */
  async addToWhitelist(userId: string): Promise<void> {
    if (!this.config.whitelist) {
      this.config.whitelist = [];
    }
    
    if (!this.config.whitelist.includes(userId)) {
      this.config.whitelist.push(userId);
      this.saveWhitelist();
      logger.info(`Added Telegram user ${userId} to whitelist`);
      
      // 通知用戶已加入白名單
      await this.sendTextMessage(userId, '✅ 握手成功！你已被加入白名單，現在可以使用 UFO 了！\n\n發送任何訊息開始對話 🚀');
    }
  }

  private loadWhitelist(): void {
    try {
      if (fs.existsSync(this.whitelistPath)) {
        const content = fs.readFileSync(this.whitelistPath, 'utf8');
        const list = JSON.parse(content);
        if (Array.isArray(list)) {
          this.config.whitelist = Array.from(new Set([...(this.config.whitelist || []), ...list]));
          logger.info(`Loaded ${this.config.whitelist.length} Telegram users from whitelist`);
        }
      }
    } catch (error) {
      logger.warn('Failed to load Telegram whitelist:', error);
    }
  }

  private saveWhitelist(): void {
    try {
      const list = this.config.whitelist || [];
      fs.mkdirSync(path.dirname(this.whitelistPath), { recursive: true });
      fs.writeFileSync(this.whitelistPath, JSON.stringify(list, null, 2));
    } catch (error) {
      logger.warn('Failed to save Telegram whitelist:', error);
    }
  }

  clearWhitelist(): void {
    this.config.whitelist = [];
    this.saveWhitelist();
  }

  removeFromWhitelist(userId: string): void {
    if (this.config.whitelist) {
      this.config.whitelist = this.config.whitelist.filter(id => id !== userId);
      this.saveWhitelist();
      logger.info(`Removed Telegram user ${userId} from whitelist`);
    }
  }

  async initialize(): Promise<void> {
    try {
      const me = await this.bot.api.getMe();
      logger.info(`Telegram Bot initialized: @${me.username}`);
      
      // 設定 webhook (如果有配置)
      if (this.config.webhookUrl) {
        await this.bot.api.setWebhook(this.config.webhookUrl);
        logger.info(`Telegram webhook set to: ${this.config.webhookUrl}`);
      }
    } catch (error) {
      // grammy 失敗，嘗試用 curl fallback
      logger.warn('grammy API failed, trying curl fallback...');
      try {
        const response = await customFetch(
          `https://api.telegram.org/bot${this.config.botToken}/getMe`
        );
        const data = await response.json() as { ok: boolean; result?: { username: string } };
        if (data.ok && data.result) {
          this.useCurlFallback = true;
          logger.info(`Telegram Bot initialized (curl mode): @${data.result.username}`);
          
          // 設定 webhook
          if (this.config.webhookUrl) {
            await customFetch(
              `https://api.telegram.org/bot${this.config.botToken}/setWebhook?url=${encodeURIComponent(this.config.webhookUrl)}`
            );
            logger.info(`Telegram webhook set to: ${this.config.webhookUrl}`);
          }
          return;
        }
      } catch (curlError) {
        logger.error('Curl fallback also failed:', curlError);
      }
      logger.error('Failed to initialize Telegram bot:', error);
      throw error;
    }
  }

  parseMessage(update: any): IncomingMessage | null {
    const message = update.message;
    if (!message) return null;

    const userId = String(message.from?.id);
    const chatId = String(message.chat.id);
    const isGroup = message.chat.type === 'group' || message.chat.type === 'supergroup';

    const result: IncomingMessage = {
      channel: 'telegram',
      userId,
      groupId: isGroup ? chatId : undefined,
      chatId,
      messageId: String(message.message_id),
      timestamp: new Date(message.date * 1000),
      senderName: message.from?.first_name,
      senderUsername: message.from?.username,
    };

    // 文字訊息
    if (message.text) {
      result.text = message.text;
    }

    // 圖片
    if (message.photo) {
      const photo = message.photo[message.photo.length - 1]; // 取最大的圖片
      result.media = [{
        type: 'image',
        id: photo.file_id,
        fileUniqueId: photo.file_unique_id,
        width: photo.width,
        height: photo.height,
        fileSize: photo.file_size,
      }];
      result.text = message.caption;
    }

    // 影片
    if (message.video) {
      result.media = [{
        type: 'video',
        id: message.video.file_id,
        fileUniqueId: message.video.file_unique_id,
        duration: message.video.duration,
        width: message.video.width,
        height: message.video.height,
        fileSize: message.video.file_size,
      }];
      result.text = message.caption;
    }

    // 音訊
    if (message.audio || message.voice) {
      const audio = message.audio || message.voice;
      result.media = [{
        type: 'audio',
        id: audio.file_id,
        fileUniqueId: audio.file_unique_id,
        duration: audio.duration,
        fileSize: audio.file_size,
      }];
      result.text = message.caption;
    }

    // 文件
    if (message.document) {
      result.media = [{
        type: 'file',
        id: message.document.file_id,
        fileUniqueId: message.document.file_unique_id,
        fileName: message.document.file_name,
        mimeType: message.document.mime_type,
        fileSize: message.document.file_size,
      }];
      result.text = message.caption;
    }

    // 位置
    if (message.location) {
      result.location = {
        latitude: message.location.latitude,
        longitude: message.location.longitude,
      };
    }

    // 貼圖
    if (message.sticker) {
      result.sticker = {
        id: message.sticker.file_id,
        emoji: message.sticker.emoji,
        setName: message.sticker.set_name,
      };
    }

    return result;
  }

  async sendMessage(userId: string, message: OutgoingMessage): Promise<void> {
    const chatId = message.chatId || userId;

    // 文字訊息
    if (message.text) {
      if (this.useCurlFallback) {
        // 使用 curl 發送
        const payload = JSON.stringify({
          chat_id: chatId,
          text: message.text,
          parse_mode: 'Markdown',
          reply_to_message_id: message.replyToMessageId ? Number(message.replyToMessageId) : undefined,
        });
        await customFetch(
          `https://api.telegram.org/bot${this.config.botToken}/sendMessage`,
          { method: 'POST', body: payload }
        );
      } else {
        await this.bot.api.sendMessage(chatId, message.text, {
          parse_mode: 'Markdown',
          reply_to_message_id: message.replyToMessageId ? Number(message.replyToMessageId) : undefined,
        });
      }
    }

    // 圖片 (curl mode 不支援，需要 grammy)
    if (message.image && !this.useCurlFallback) {
      const photo = message.image.url ?? (message.image.buffer ? new InputFile(message.image.buffer) : undefined);
      if (photo) {
        await this.bot.api.sendPhoto(chatId, photo, {
          caption: message.image.caption,
        });
      }
    }

    // 文件 (curl mode 不支援，需要 grammy)
    if (message.file && !this.useCurlFallback) {
      const document = message.file.url ?? (message.file.buffer ? new InputFile(message.file.buffer) : undefined);
      if (document) {
        await this.bot.api.sendDocument(chatId, document, {
          caption: message.file.caption,
        });
      }
    }
  }

  async sendTextMessage(userId: string, text: string, chatId?: string): Promise<void> {
    await this.sendMessage(userId, { text, chatId });
  }

  async downloadMedia(fileId: string): Promise<Buffer> {
    const file = await this.bot.api.getFile(fileId);
    const filePath = file.file_path;
    
    if (!filePath) {
      throw new Error('File path not available');
    }

    const url = `https://api.telegram.org/file/bot${this.config.botToken}/${filePath}`;
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  async sendTypingAction(chatId: string): Promise<void> {
    await this.bot.api.sendChatAction(chatId, 'typing');
  }

  getWebhookCallback() {
    return webhookCallback(this.bot, 'express');
  }

  getBot(): Bot {
    return this.bot;
  }
}
