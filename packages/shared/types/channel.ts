/**
 * 頻道類型定義
 */

/**
 * 支援的頻道類型
 */
export type ChannelType = 'line' | 'telegram' | 'discord' | 'slack' | 'wechat';

/**
 * 頻道狀態
 */
export type ChannelStatus = 'connected' | 'disconnected' | 'error' | 'initializing';

/**
 * 頻道資訊
 */
export interface ChannelInfo {
  name: ChannelType;
  status: ChannelStatus;
  displayName: string;
  botName?: string;
  botId?: string;
  connectedAt?: Date;
  lastActivityAt?: Date;
  error?: string;
}

/**
 * LINE 頻道配置
 */
export interface LineChannelConfig {
  channelAccessToken: string;
  channelSecret: string;
  webhookUrl?: string;
}

/**
 * Telegram 頻道配置
 */
export interface TelegramChannelConfig {
  botToken: string;
  webhookUrl?: string;
  allowedUsers?: number[];
}

/**
 * Discord 頻道配置
 */
export interface DiscordChannelConfig {
  botToken: string;
  applicationId: string;
  publicKey?: string;
  guildId?: string;
}

/**
 * Slack 頻道配置
 */
export interface SlackChannelConfig {
  botToken: string;
  appToken: string;
  signingSecret: string;
}

/**
 * 所有頻道配置
 */
export interface ChannelsConfig {
  line?: LineChannelConfig;
  telegram?: TelegramChannelConfig;
  discord?: DiscordChannelConfig;
  slack?: SlackChannelConfig;
}

/**
 * 頻道事件
 */
export interface ChannelEvent {
  type: 'connected' | 'disconnected' | 'message' | 'error';
  channel: ChannelType;
  timestamp: Date;
  data?: any;
}
