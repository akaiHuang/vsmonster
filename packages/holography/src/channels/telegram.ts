/**
 * Holography Telegram Channel Implementation
 * 完全獨立的 Telegram 頻道實現，不依賴 Moltbot
 */

import { Bot, InputFile, webhookCallback } from 'grammy';
import { HologramChannel } from './base';
import { TelegramConfig, IncomingMessage, OutgoingMessage } from '../core/types';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * 自定義 API 請求函數，使用 curl 繞過 Node.js 網路問題
 */
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

export class TelegramChannel extends HologramChannel {
  readonly name = 'telegram';
  private bot: Bot;
  private config: TelegramConfig;
  private useCurlFallback = false;

  constructor(config: TelegramConfig) {
    super('telegram');
    this.config = config;
    this.bot = new Bot(config.botToken);
  }

  async initialize(): Promise<void> {
    try {
      const me = await this.bot.api.getMe();
      this.log('info', `Telegram Bot initialized: @${me.username}`);
      
      // 設定 webhook (如果有配置)
      if (this.config.webhookUrl) {
        await this.bot.api.setWebhook(this.config.webhookUrl);
        this.log('info', `Telegram webhook set to: ${this.config.webhookUrl}`);
      }
    } catch (error) {
      // grammy 失敗，嘗試用 curl fallback
      this.log('warn', 'grammy API failed, trying curl fallback...');
      try {
        const response = await customFetch(
          `https://api.telegram.org/bot${this.config.botToken}/getMe`
        );
        const data = await response.json() as { ok: boolean; result?: { username: string } };
        if (data.ok && data.result) {
          this.useCurlFallback = true;
          this.log('info', `Telegram Bot initialized (curl mode): @${data.result.username}`);
          
          // 設定 webhook
          if (this.config.webhookUrl) {
            await customFetch(
              `https://api.telegram.org/bot${this.config.botToken}/setWebhook?url=${encodeURIComponent(this.config.webhookUrl)}`
            );
            this.log('info', `Telegram webhook set to: ${this.config.webhookUrl}`);
          }
          return;
        }
      } catch (curlError) {
        this.log('error', 'Curl fallback also failed:', curlError);
      }
      this.log('error', 'Failed to initialize Telegram bot:', error);
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
    if (this.useCurlFallback) {
      // Use curl fallback to avoid node network issues (same reason as getMe/setWebhook).
      await customFetch(
        `https://api.telegram.org/bot${this.config.botToken}/sendChatAction?chat_id=${encodeURIComponent(chatId)}&action=typing`
      );
      return;
    }
    await this.bot.api.sendChatAction(chatId, 'typing');
  }

  /**
   * 獲取 Express webhook callback
   */
  getWebhookCallback() {
    return webhookCallback(this.bot, 'express');
  }

  /**
   * 獲取 Bot 實例
   */
  getBot(): Bot {
    return this.bot;
  }

  /**
   * 是否使用 curl fallback 模式
   */
  isUsingCurlFallback(): boolean {
    return this.useCurlFallback;
  }
}
