import { Bot, Context, InputFile, webhookCallback } from 'grammy';
import { ChannelAdapter, IncomingMessage, OutgoingMessage } from '../base';
import { logger } from '../../utils/logger';

export interface TelegramConfig {
  botToken: string;
  webhookUrl?: string;
}

export class TelegramChannel implements ChannelAdapter {
  readonly name = 'telegram';
  private bot: Bot;
  private config: TelegramConfig;

  constructor(config: TelegramConfig) {
    this.config = config;
    this.bot = new Bot(config.botToken);
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
      await this.bot.api.sendMessage(chatId, message.text, {
        parse_mode: 'Markdown',
        reply_to_message_id: message.replyToMessageId ? Number(message.replyToMessageId) : undefined,
      });
    }

    // 圖片
    if (message.image) {
      const photo = message.image.url ?? (message.image.buffer ? new InputFile(message.image.buffer) : undefined);
      if (photo) {
        await this.bot.api.sendPhoto(chatId, photo, {
          caption: message.image.caption,
        });
      }
    }

    // 文件
    if (message.file) {
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
