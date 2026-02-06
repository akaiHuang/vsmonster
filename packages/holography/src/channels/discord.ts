/**
 * Holography Discord Channel Implementation
 * 完全獨立的 Discord 頻道實現，不依賴 Moltbot
 */

import { 
  Client, 
  GatewayIntentBits, 
  Events, 
  Message, 
  Interaction, 
  REST, 
  Routes, 
  SlashCommandBuilder 
} from 'discord.js';
import { HologramChannel } from './base';
import { DiscordConfig, IncomingMessage, OutgoingMessage, MediaItem } from '../core/types';

export class DiscordChannel extends HologramChannel {
  readonly name = 'discord';
  private client: Client;
  private config: DiscordConfig;
  private messageHandler?: (message: IncomingMessage) => void;

  constructor(config: DiscordConfig) {
    super('discord');
    this.config = config;
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
      ],
    });
  }

  /**
   * 設定訊息處理器
   */
  setMessageHandler(handler: (message: IncomingMessage) => void): void {
    this.messageHandler = handler;
  }

  async initialize(): Promise<void> {
    try {
      // 註冊 Slash Commands
      await this.registerSlashCommands();

      // 設定事件監聽
      this.setupEventListeners();

      // 登入
      await this.client.login(this.config.botToken);
      
      this.log('info', `Discord Bot initialized: ${this.client.user?.tag}`);
    } catch (error) {
      this.log('error', 'Failed to initialize Discord bot:', error);
      throw error;
    }
  }

  /**
   * 註冊 Slash Commands
   */
  private async registerSlashCommands(): Promise<void> {
    const commands = [
      new SlashCommandBuilder()
        .setName('task')
        .setDescription('建立新任務給 VS Code Copilot')
        .addStringOption(option =>
          option.setName('instruction')
            .setDescription('任務描述')
            .setRequired(true)),
      
      new SlashCommandBuilder()
        .setName('status')
        .setDescription('查看當前任務狀態'),
      
      new SlashCommandBuilder()
        .setName('model')
        .setDescription('切換 AI 模型')
        .addStringOption(option =>
          option.setName('name')
            .setDescription('模型名稱')
            .setRequired(true)
            .addChoices(
              { name: 'GPT-4', value: 'gpt-4' },
              { name: 'GPT-4 Turbo', value: 'gpt-4-turbo' },
              { name: 'Claude 3', value: 'claude-3' },
            )),
      
      new SlashCommandBuilder()
        .setName('preview')
        .setDescription('取得 ngrok 預覽連結'),
      
      new SlashCommandBuilder()
        .setName('help')
        .setDescription('顯示 VSMONSTER 使用說明'),
    ];

    const rest = new REST({ version: '10' }).setToken(this.config.botToken);

    try {
      this.log('info', 'Registering Discord slash commands...');
      
      await rest.put(
        Routes.applicationCommands(this.config.applicationId),
        { body: commands.map(cmd => cmd.toJSON()) }
      );

      this.log('info', 'Discord slash commands registered successfully');
    } catch (error) {
      this.log('error', 'Failed to register slash commands:', error);
    }
  }

  /**
   * 設定事件監聽
   */
  private setupEventListeners(): void {
    this.client.once(Events.ClientReady, (readyClient) => {
      this.log('info', `Discord ready! Logged in as ${readyClient.user.tag}`);
    });

    // 處理訊息
    this.client.on(Events.MessageCreate, async (message) => {
      // 忽略 Bot 自己的訊息
      if (message.author.bot) return;

      // 檢查頻道限制
      if (this.config.allowedChannels && 
          !this.config.allowedChannels.includes(message.channelId)) {
        return;
      }

      // 檢查是否 @ 提及 Bot
      const mentioned = message.mentions.has(this.client.user!);
      
      // 只處理 @ 提及或私訊
      if (!mentioned && message.guild) return;

      const incomingMessage = this.parseMessageEvent(message);
      if (incomingMessage && this.messageHandler) {
        this.messageHandler(incomingMessage);
      }
    });

    // 處理 Slash Commands
    this.client.on(Events.InteractionCreate, async (interaction) => {
      if (!interaction.isChatInputCommand()) return;

      const incomingMessage = this.parseInteraction(interaction);
      if (incomingMessage && this.messageHandler) {
        // 先回應 Discord 避免超時
        await interaction.deferReply();
        
        // 處理指令
        this.messageHandler(incomingMessage);
      }
    });
  }

  /**
   * 解析 Discord 訊息
   */
  private parseMessageEvent(message: Message): IncomingMessage | null {
    // 移除 @ 提及部分
    let text = message.content;
    if (this.client.user) {
      text = text.replace(new RegExp(`<@!?${this.client.user.id}>`, 'g'), '').trim();
    }

    const result: IncomingMessage = {
      channel: 'discord',
      userId: message.author.id,
      groupId: message.guild?.id,
      chatId: message.channelId,
      messageId: message.id,
      timestamp: message.createdAt,
      text,
      senderName: message.author.displayName || message.author.username,
      senderUsername: message.author.username,
    };

    // 處理附件
    if (message.attachments.size > 0) {
      result.media = message.attachments.map(att => ({
        type: this.getMediaType(att.contentType || ''),
        id: att.id,
        url: att.url,
        fileName: att.name || undefined,
        fileSize: att.size,
        mimeType: att.contentType || undefined,
      }));
    }

    return result;
  }

  /**
   * 解析 Slash Command 互動
   */
  private parseInteraction(interaction: Interaction): IncomingMessage | null {
    if (!interaction.isChatInputCommand()) return null;

    let text = '';
    
    switch (interaction.commandName) {
      case 'task':
        const instruction = interaction.options.getString('instruction');
        text = `/task ${instruction}`;
        break;
      case 'status':
        text = '/status';
        break;
      case 'model':
        const model = interaction.options.getString('name');
        text = `/model ${model}`;
        break;
      case 'preview':
        text = '/preview';
        break;
      case 'help':
        text = '/help';
        break;
      default:
        return null;
    }

    return {
      channel: 'discord',
      userId: interaction.user.id,
      groupId: interaction.guild?.id,
      chatId: interaction.channelId,
      messageId: interaction.id,
      timestamp: new Date(),
      text,
      senderName: interaction.user.displayName || interaction.user.username,
      senderUsername: interaction.user.username,
      replyToken: interaction.id,
    };
  }

  /**
   * 從 MIME type 判斷媒體類型
   */
  private getMediaType(mimeType: string): 'image' | 'video' | 'audio' | 'file' {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    return 'file';
  }

  parseMessage(event: any): IncomingMessage | null {
    // 用於 webhook 模式的解析 (目前使用 Gateway 模式)
    if (event.type === 1) {
      // Ping
      return null;
    }
    return null;
  }

  async sendMessage(userId: string, message: OutgoingMessage): Promise<void> {
    try {
      const user = await this.client.users.fetch(userId);
      
      if (message.text) {
        await user.send(message.text);
      }

      if (message.image?.url) {
        await user.send({ files: [message.image.url] });
      }

      if (message.file?.url) {
        await user.send({ files: [{ attachment: message.file.url, name: message.file.fileName }] });
      }
    } catch (error) {
      this.log('error', `Failed to send message to Discord user ${userId}:`, error);
      throw error;
    }
  }

  async sendTextMessage(userId: string, text: string, channelId?: string): Promise<void> {
    try {
      // 如果提供了 channelId，發送到頻道
      if (channelId) {
        const channel = await this.client.channels.fetch(channelId);
        if (channel?.isTextBased()) {
          await (channel as any).send(text);
          return;
        }
      }

      // 否則發送私訊
      const user = await this.client.users.fetch(userId);
      await user.send(text);
    } catch (error) {
      this.log('error', `Failed to send text to Discord:`, error);
      throw error;
    }
  }

  /**
   * 回覆 Interaction
   */
  async replyToInteraction(interactionId: string, text: string): Promise<void> {
    this.log('warn', 'replyToInteraction not implemented for cached interactions');
  }

  /**
   * 關閉連接
   */
  async destroy(): Promise<void> {
    await this.client.destroy();
    this.log('info', 'Discord client destroyed');
  }

  /**
   * 獲取 Discord Client 實例
   */
  getClient(): Client {
    return this.client;
  }
}
