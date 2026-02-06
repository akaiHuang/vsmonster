import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import ffmpeg = require('fluent-ffmpeg');
import { getMediaDatabase, MediaDatabase } from '../db/media-database';

/**
 * 多媒體服務
 * 管理檔案上傳、儲存、預覽和下載
 */

const MEDIA_STORAGE_PATH = process.env.MEDIA_STORAGE_PATH || path.join(process.cwd(), 'media-storage');
const MAX_FILE_SIZE = 1024 * 1024 * 1024; // 1GB

// 媒體 URL 配置（預設值，會被 setMediaUrl 覆蓋）
let MEDIA_URL_BASE = process.env.VSMONSTER_MEDIA_URL || 'http://localhost:3000';

// 確保目錄存在
if (!fs.existsSync(MEDIA_STORAGE_PATH)) {
  fs.mkdirSync(MEDIA_STORAGE_PATH, { recursive: true });
}

export interface MediaRecord {
  id: string;
  filename: string;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
  source: 'line' | 'telegram' | 'discord';
  uploadedAt: Date;
  filePath: string;
  publicUrl: string;
  thumbnailUrl?: string;
  mediaType: 'image' | 'video' | 'file';
}

// 使用 MongoDB 適配器進行持久化儲存
const db: MediaDatabase = getMediaDatabase();

/**
 * 初始化媒體 URL 基礎路徑
 * @param mediaUrl 媒體服務的基礎 URL（例如：https://media.ufo.fawstudio.com）
 */
export function initializeMediaUrl(mediaUrl: string): void {
  MEDIA_URL_BASE = mediaUrl.replace(/\/+$/, ''); // 移除末尾斜線
  console.log(`[Media Service] Initialized with URL base: ${MEDIA_URL_BASE}`);
}

/**
 * 上傳多媒體檔案
 */
export async function uploadMedia(
  buffer: Buffer,
  originalFilename: string,
  mimeType: string,
  source: 'line' | 'telegram' | 'discord'
): Promise<MediaRecord> {
  // 檔案大小驗證
  if (buffer.length > MAX_FILE_SIZE) {
    throw new Error(`檔案大小超過 1GB 限制，實際：${(buffer.length / 1024 / 1024).toFixed(2)} MB`);
  }

  // 生成 media ID
  const mediaId = uuidv4();
  
  // 建立日期資料夾（YYYY-MM）
  const now = new Date();
  const dateFolder = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const folderPath = path.join(MEDIA_STORAGE_PATH, dateFolder);

  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
  }

  // 生成安全檔名
  const ext = getFileExtension(originalFilename);
  const safeFilename = `${mediaId}${ext}`;
  const filePath = path.join(folderPath, safeFilename);

  // 寫入檔案
  fs.writeFileSync(filePath, buffer);

  // 判斷媒體類型
  const mediaType = getMediaType(mimeType);

  // 建立記錄
  const record: MediaRecord = {
    id: mediaId,
    filename: safeFilename,
    originalFilename,
    mimeType,
    fileSize: buffer.length,
    source,
    uploadedAt: now,
    filePath,
    publicUrl: `${MEDIA_URL_BASE}/api/media/${mediaId}/view`,
    mediaType,
  };

  // 如果是影片，生成縮圖
  if (mediaType === 'video') {
    try {
      record.thumbnailUrl = await generateVideoThumbnail(filePath, mediaId);
    } catch (e) {
      console.warn(`生成影片縮圖失敗: ${originalFilename}`, e);
    }
  }

  // 儲存到資料庫
  db.insert(mediaId, {
    _id: mediaId,
    filename: safeFilename,
    originalFilename,
    mimeType,
    fileSize: buffer.length,
    source,
    uploadedAt: now,
    filePath,
    publicUrl: `/api/media/${mediaId}/view`,
    mediaType,
  });

  return record;
}

/**
 * 取得媒體記錄
 */
export function getMedia(mediaId: string): MediaRecord | undefined {
  const record = db.findOne(mediaId);
  if (!record) return undefined;
  
  // 確保 publicUrl 使用最新的媒體 URL 基礎
  const media = record as any;
  media.publicUrl = `${MEDIA_URL_BASE}/api/media/${mediaId}/view`;
  if (media.thumbnailUrl && !media.thumbnailUrl.startsWith('http')) {
    media.thumbnailUrl = `${MEDIA_URL_BASE}/api/media/${mediaId}/thumbnail`;
  }
  
  return media as MediaRecord;
}

/**
 * 取得媒體檔案
 */
export function getMediaFile(mediaId: string): Buffer | null {
  const record = db.findOne(mediaId);
  if (!record) return null;

  try {
    return fs.readFileSync(record.filePath);
  } catch (e) {
    console.error(`無法讀取檔案: ${record.filePath}`, e);
    return null;
  }
}

/**
 * 列出媒體（分頁）
 */
export function listMedia(skip: number = 0, limit: number = 20): MediaRecord[] {
  // 按上傳時間倒序排列
  const sorted = db.findPaginated(skip, limit);
  return sorted.map((record: any) => {
    record.publicUrl = `${MEDIA_URL_BASE}/api/media/${record.id}/view`;
    if (record.thumbnailUrl && !record.thumbnailUrl.startsWith('http')) {
      record.thumbnailUrl = `${MEDIA_URL_BASE}/api/media/${record.id}/thumbnail`;
    }
    return record as MediaRecord;
  });
}

/**
 * 刪除媒體
 */
export function deleteMedia(mediaId: string): boolean {
  const record = db.findOne(mediaId);
  if (!record) return false;

  // 刪除檔案
  try {
    fs.unlinkSync(record.filePath);
    if (record.thumbnailUrl) {
      const thumbPath = path.join(process.cwd(), 'media-storage', `${mediaId}-thumb.jpg`);
      if (fs.existsSync(thumbPath)) {
        fs.unlinkSync(thumbPath);
      }
    }
  } catch (e) {
    console.warn(`刪除檔案失敗: ${record.filePath}`, e);
  }

  // 刪除記錄
  return db.deleteOne(mediaId);
}

/**
 * 獲取媒體統計
 */
export function getMediaStats() {
  const records = db.getAll();
  return {
    totalCount: records.length,
    totalSize: records.reduce((sum, r) => sum + r.fileSize, 0),
    byType: {
      image: records.filter(r => r.mediaType === 'image').length,
      video: records.filter(r => r.mediaType === 'video').length,
      file: records.filter(r => r.mediaType === 'file').length,
    },
    bySource: {
      line: records.filter(r => r.source === 'line').length,
      telegram: records.filter(r => r.source === 'telegram').length,
      discord: records.filter(r => r.source === 'discord').length,
    },
  };
}

// ============ 輔助函數 ============

function getFileExtension(filename: string): string {
  const parts = filename.split('.');
  if (parts.length > 1) {
    return '.' + parts[parts.length - 1].toLowerCase();
  }
  return '';
}

function getMediaType(mimeType: string): 'image' | 'video' | 'file' {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  return 'file';
}

async function generateVideoThumbnail(videoPath: string, mediaId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const thumbPath = path.join(MEDIA_STORAGE_PATH, `${mediaId}-thumb.jpg`);

    ffmpeg(videoPath)
      .screenshots({
        count: 1,
        folder: MEDIA_STORAGE_PATH,
        filename: `${mediaId}-thumb.jpg`,
        timestamps: ['1%'], // 取 1% 時間點的畫面
      })
      .on('end', () => {
        resolve(`/api/media/${mediaId}/thumbnail`);
      })
      .on('error', (err: Error) => {
        reject(err);
      });
  });
}
