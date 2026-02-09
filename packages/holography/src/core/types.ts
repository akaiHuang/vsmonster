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

// ============================================
// LINE Postback & Flex Message 型別
// ============================================

export interface PostbackData {
  data: string;
  params?: {
    date?: string;
    time?: string;
    datetime?: string;
  };
}

export type LineEventType = 'message' | 'postback' | 'follow' | 'unfollow' | 'join' | 'leave';

export interface LineFlexBubble {
  type: 'bubble';
  size?: 'nano' | 'micro' | 'kilo' | 'mega' | 'giga';
  direction?: 'ltr' | 'rtl';
  header?: LineFlexBox;
  hero?: LineFlexImage | LineFlexBox;
  body?: LineFlexBox;
  footer?: LineFlexBox;
  styles?: any;
}

export interface LineFlexCarousel {
  type: 'carousel';
  contents: LineFlexBubble[];
}

export type LineFlexContainer = LineFlexBubble | LineFlexCarousel;

export interface LineFlexBox {
  type: 'box';
  layout: 'horizontal' | 'vertical' | 'baseline';
  contents: LineFlexComponent[];
  flex?: number;
  spacing?: string;
  margin?: string;
  paddingAll?: string;
  paddingTop?: string;
  paddingBottom?: string;
  paddingStart?: string;
  paddingEnd?: string;
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: string;
  cornerRadius?: string;
  width?: string;
  height?: string;
  justifyContent?: 'flex-start' | 'center' | 'flex-end' | 'space-between' | 'space-around' | 'space-evenly';
  alignItems?: 'flex-start' | 'center' | 'flex-end';
  action?: LineFlexAction;
}

export interface LineFlexButton {
  type: 'button';
  action: LineFlexAction;
  flex?: number;
  margin?: string;
  height?: 'sm' | 'md';
  style?: 'link' | 'primary' | 'secondary';
  color?: string;
  gravity?: 'top' | 'bottom' | 'center';
}

export interface LineFlexImage {
  type: 'image';
  url: string;
  flex?: number;
  margin?: string;
  size?: string;
  aspectRatio?: string;
  aspectMode?: 'cover' | 'fit';
  backgroundColor?: string;
  action?: LineFlexAction;
}

export interface LineFlexText {
  type: 'text';
  text: string;
  flex?: number;
  margin?: string;
  size?: string;
  align?: 'start' | 'end' | 'center';
  gravity?: 'top' | 'bottom' | 'center';
  wrap?: boolean;
  weight?: 'regular' | 'bold';
  color?: string;
  action?: LineFlexAction;
}

export interface LineFlexSeparator {
  type: 'separator';
  margin?: string;
  color?: string;
}

export interface LineFlexSpacer {
  type: 'spacer';
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl';
}

export interface LineFlexIcon {
  type: 'icon';
  url: string;
  margin?: string;
  size?: string;
  aspectRatio?: string;
}

export type LineFlexComponent = LineFlexBox | LineFlexButton | LineFlexImage | LineFlexText | LineFlexSeparator | LineFlexSpacer | LineFlexIcon;

export interface LineFlexPostbackAction {
  type: 'postback';
  label: string;
  data: string;
  displayText?: string;
}

export interface LineFlexMessageAction {
  type: 'message';
  label: string;
  text: string;
}

export interface LineFlexUriAction {
  type: 'uri';
  label: string;
  uri: string;
}

export type LineFlexAction = LineFlexPostbackAction | LineFlexMessageAction | LineFlexUriAction;

export interface LineFlexMessage {
  type: 'flex';
  altText: string;
  contents: LineFlexContainer;
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
  // LINE Postback support
  eventType?: LineEventType;
  postback?: PostbackData;
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
  // LINE Flex Message support
  flex?: LineFlexMessage;
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
