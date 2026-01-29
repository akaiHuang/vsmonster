/**
 * 訊息類型定義
 */

export interface MediaItem {
  type: 'image' | 'video' | 'audio' | 'file';
  id: string;
  url?: string;
  buffer?: Buffer;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
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
 * 收到的訊息
 */
export interface IncomingMessage {
  /** 頻道名稱 */
  channel: string;
  /** 發送者 ID */
  userId: string;
  /** 群組 ID */
  groupId?: string;
  /** 聊天室 ID */
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
  /** 回覆 Token */
  replyToken?: string;
  /** 發送者名稱 */
  senderName?: string;
  /** 發送者用戶名 */
  senderUsername?: string;
}

/**
 * 發送的訊息
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
  /** 回覆 Token */
  replyToken?: string;
  /** 聊天室 ID */
  chatId?: string;
  /** 要回覆的訊息 ID */
  replyToMessageId?: string;
}

/**
 * WebSocket 訊息類型
 */
export interface WSMessage {
  type: string;
  [key: string]: any;
}

export interface WSTaskMessage extends WSMessage {
  type: 'new_task';
  task: {
    id: string;
    channel: string;
    userId: string;
    instruction: string;
    media?: MediaItem[];
    subtasks?: Array<{
      id: string;
      description: string;
      status: string;
      order: number;
    }>;
  };
  instruction: string;
  media?: MediaItem[];
}

export interface WSCopilotResponse extends WSMessage {
  type: 'copilot_response';
  channel: string;
  userId: string;
  content: string;
}

export interface WSTaskUpdate extends WSMessage {
  type: 'task_update';
  taskId: string;
  subTaskId?: string;
  status: string;
  progress?: number;
  result?: any;
  error?: string;
}

export interface WSSwitchModel extends WSMessage {
  type: 'switch_model';
  model: string;
  userId: string;
}
