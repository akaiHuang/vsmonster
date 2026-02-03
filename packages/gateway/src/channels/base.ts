/**
 * 頻道適配器基礎接口
 * 所有社群頻道都需要實現這個接口
 */

export interface MediaItem {
  type: 'image' | 'video' | 'audio' | 'file';
  id: string;
  url?: string;
  buffer?: Buffer;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  contentProvider?: any;
  [key: string]: any;
}

export interface LocationData {
  title?: string;
  address?: string;
  latitude: number;
  longitude: number;
}

export interface StickerData {
  id?: string;
  packageId?: string;
  stickerId?: string;
  emoji?: string;
  setName?: string;
}

/**
 * 從社群頻道收到的訊息
 */
export interface IncomingMessage {
  /** 頻道名稱 */
  channel: string;
  /** 發送者 ID */
  userId: string;
  /** 群組 ID (如果是群組訊息) */
  groupId?: string;
  /** 聊天室 ID (Telegram 專用) */
  chatId?: string;
  /** 訊息 ID */
  messageId: string;
  /** 時間戳 */
  timestamp: Date;
  /** 文字內容 */
  text?: string;
  /** 媒體附件 */
  media?: MediaItem[];
  /** 位置資訊 */
  location?: LocationData;
  /** 貼圖資訊 */
  sticker?: StickerData;
  /** 回覆 Token (LINE 專用) */
  replyToken?: string;
  /** 發送者名稱 */
  senderName?: string;
  /** 發送者用戶名 */
  senderUsername?: string;
}

/**
 * 要發送到社群頻道的訊息
 */
export interface OutgoingMessage {
  /** 文字內容 */
  text?: string;
  /** 圖片 */
  image?: {
    url?: string;
    buffer?: Buffer;
    caption?: string;
  };
  /** 文件 */
  file?: {
    url?: string;
    buffer?: Buffer;
    fileName?: string;
    caption?: string;
  };
  /** 回覆 Token (LINE 專用) */
  replyToken?: string;
  /** 聊天室 ID (Telegram 專用) */
  chatId?: string;
  /** 要回覆的訊息 ID */
  replyToMessageId?: string;
}

/**
 * 頻道適配器接口
 */
export interface ChannelAdapter {
  /** 頻道名稱 */
  readonly name: string;
  
  /**
   * 初始化頻道連接
   */
  initialize(): Promise<void>;
  
  /**
   * 解析從 webhook 收到的事件
   * @param event 原始事件數據
   * @returns 解析後的訊息，如果無法解析則返回 null
   */
  parseMessage(event: any): IncomingMessage | null;
  
  /**
   * 發送訊息到頻道
   * @param userId 接收者 ID
   * @param message 要發送的訊息
   */
  sendMessage(userId: string, message: OutgoingMessage): Promise<void>;
  
  /**
   * 發送純文字訊息 (便捷方法)
   * @param userId 接收者 ID
   * @param text 文字內容
   */
  sendTextMessage(userId: string, text: string, ...args: any[]): Promise<void>;
  
  /**
   * 下載媒體文件
   * @param mediaId 媒體 ID
   * @returns 文件 Buffer
   */
  downloadMedia?(mediaId: string): Promise<Buffer>;
}

/**
 * 頻道配置
 */
export interface ChannelsConfig {
  line?: {
    channelAccessToken: string;
    channelSecret: string;
    webhookSecret?: string;
    whitelist?: string[];
  };
  telegram?: {
    botToken: string;
    webhookUrl?: string;
  };
  discord?: {
    botToken: string;
    applicationId: string;
    publicKey: string;
  };
  slack?: {
    botToken: string;
    appToken: string;
    signingSecret: string;
  };
}

/**
 * 任務優先級
 */
export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent';

/**
 * 任務狀態
 */
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

/**
 * 任務定義
 */
export interface Task {
  /** 任務 ID */
  id: string;
  /** 來源頻道 */
  channel: string;
  /** 用戶 ID */
  userId: string;
  /** 原始指令 */
  instruction: string;
  /** 附帶的媒體 */
  media?: MediaItem[];
  /** 任務狀態 */
  status: TaskStatus;
  /** 優先級 */
  priority: TaskPriority;
  /** 進度 (0-100) */
  progress: number;
  /** 子任務 */
  subtasks?: SubTask[];
  /** 建立時間 */
  createdAt: Date;
  /** 更新時間 */
  updatedAt: Date;
  /** 完成時間 */
  completedAt?: Date;
  /** 結果 */
  result?: any;
  /** 錯誤訊息 */
  error?: string;
}

/**
 * 子任務定義
 */
export interface SubTask {
  /** 子任務 ID */
  id: string;
  /** 父任務 ID */
  parentId: string;
  /** 描述 */
  description: string;
  /** 狀態 */
  status: TaskStatus;
  /** 順序 */
  order: number;
  /** 結果 */
  result?: any;
}
