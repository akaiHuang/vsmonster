/**
 * Holography 核心型別定義
 */

// ============================================
// 頻道配置
// ============================================

export interface LineConfig {
  channelAccessToken: string;
  channelSecret: string;
  webhookSecret?: string;
  whitelist?: string[];
}

export interface TelegramConfig {
  botToken: string;
  webhookUrl?: string;
  webhookSecret?: string;
  whitelist?: string[];
  useCurlFallback?: boolean;
}

export interface DiscordConfig {
  botToken: string;
  applicationId: string;
  publicKey?: string;
  guildId?: string;
  allowedChannels?: string[];
  adminUsers?: string[];
}

export interface ChannelsConfig {
  line?: LineConfig;
  telegram?: TelegramConfig;
  discord?: DiscordConfig;
}

export interface HolographyConfig {
  port: number;
  channels: ChannelsConfig;
  dataDir?: string;
  publicUrl?: string;
}

// ============================================
// 訊息型別
// ============================================

export type ChannelType = 'line' | 'telegram' | 'discord';

export interface MediaItem {
  type: 'image' | 'video' | 'audio' | 'file';
  id: string;
  url?: string;
  mimeType?: string;
  fileName?: string;
  fileSize?: number;
  width?: number;
  height?: number;
  duration?: number;
  // LINE specific
  contentProvider?: any;
  // Telegram specific
  fileUniqueId?: string;
}

export interface LocationInfo {
  latitude: number;
  longitude: number;
  title?: string;
  address?: string;
}

export interface StickerInfo {
  id?: string;
  packageId?: string;
  stickerId?: string;
  emoji?: string;
  setName?: string;
}

export interface IncomingMessage {
  channel: ChannelType;
  userId: string;
  messageId: string;
  timestamp: Date;
  text?: string;
  media?: MediaItem[];
  location?: LocationInfo;
  sticker?: StickerInfo;
  replyToken?: string;
  groupId?: string;
  chatId?: string;
  senderName?: string;
  senderUsername?: string;
  raw?: any;
}

export interface OutgoingMessage {
  text?: string;
  media?: MediaItem[];
  replyToken?: string;
  chatId?: string;
  replyToMessageId?: string;
  image?: {
    url?: string;
    buffer?: Buffer;
    caption?: string;
  };
  file?: {
    url?: string;
    buffer?: Buffer;
    fileName?: string;
    caption?: string;
  };
}

// ============================================
// 用戶管理
// ============================================

export interface VerifiedUser {
  id: string;
  channel: ChannelType;
  displayName?: string;
  verifiedAt: Date;
  lastActive?: Date;
  ip?: string;
  messageCount?: number;
}

export interface WhitelistEntry {
  userId: string;
  addedAt: Date;
  addedBy?: string;
}

// ============================================
// WebSocket 訊息
// ============================================

export type WSMessageType = 
  | 'init'
  | 'connected'
  | 'message'
  | 'response'
  | 'command'
  | 'handshakeCode'
  | 'users'
  | 'task_status'
  | 'ping'
  | 'pong';

export interface WSMessage {
  type: WSMessageType;
  payload?: any;
  channel?: ChannelType;
  userId?: string;
  content?: string;
  data?: any;
  timestamp?: string;
}

export interface WSIncomingMessage extends WSMessage {
  type: 'message';
  payload: IncomingMessage;
}

export interface WSOutgoingMessage extends WSMessage {
  type: 'response';
  payload: OutgoingMessage;
}

// ============================================
// 事件
// ============================================

export interface HolographyEvents {
  'message': (channel: ChannelType, message: IncomingMessage, clientIp: string) => void;
  'connected': (clientId: string) => void;
  'disconnected': (clientId: string) => void;
  'error': (error: Error) => void;
  'handshake': (channel: ChannelType, userId: string, success: boolean) => void;
}

// ============================================
// 頻道介面
// ============================================

export interface IHologramChannel {
  readonly name: ChannelType;
  
  initialize(): Promise<void>;
  
  parseMessage(event: any): IncomingMessage | null;
  sendMessage(userId: string, message: OutgoingMessage): Promise<void>;
  sendTextMessage(userId: string, text: string, extra?: any): Promise<void>;
  
  // 白名單管理
  isWhitelisted(userId: string): boolean;
  addToWhitelist(userId: string): Promise<void>;
  removeFromWhitelist(userId: string): void;
  clearWhitelist(): void;
  getWhitelist(): string[];
  
  // 媒體處理
  downloadMedia?(mediaId: string): Promise<Buffer>;
}
