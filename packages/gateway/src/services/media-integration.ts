/**
 * 多媒體集成輔助函數
 * 為各平台提供統一的多媒體上傳介面
 */

import { uploadMedia, MediaRecord } from '../services/media.service';
import { logger } from '../utils/logger';

/**
 * 從 LINE 媒體 ID 下載並上傳
 */
export async function uploadFromLINE(
  lineAdapter: any,
  messageId: string,
  fileName: string,
  source: 'line' | 'telegram' | 'discord' = 'line'
): Promise<MediaRecord | null> {
  try {
    const buffer = await downloadLineMedia(lineAdapter, messageId);
    if (!buffer) {
      logger.warn(`無法從 LINE 下載: ${messageId}`);
      return null;
    }

    // 猜測 MIME 類型
    const mimeType = getMimeType(fileName);
    const record = await uploadMedia(buffer, fileName, mimeType, source);
    
    logger.info(`✅ 從 LINE 上傳媒體: ${record.id} (${fileName})`);
    return record;
  } catch (error) {
    logger.error(`❌ 從 LINE 上傳失敗: ${fileName}`, error);
    return null;
  }
}

async function downloadLineMedia(lineAdapter: any, messageId: string): Promise<Buffer | null> {
  if (!lineAdapter) {
    return null;
  }
  if (typeof lineAdapter.downloadMedia === 'function') {
    return await lineAdapter.downloadMedia(messageId);
  }
  if (typeof lineAdapter.getMessageContent === 'function') {
    const stream = await lineAdapter.getMessageContent(messageId);
    const chunks: Buffer[] = [];
    return await new Promise<Buffer>((resolve, reject) => {
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  }
  return null;
}

/**
 * 從 Telegram 媒體 ID 下載並上傳
 */
export async function uploadFromTelegram(
  telegramBot: any,
  fileId: string,
  fileName: string,
  source: 'line' | 'telegram' | 'discord' = 'telegram'
): Promise<MediaRecord | null> {
  try {
    const file = await telegramBot.telegram.getFile(fileId);
    if (!file) {
      logger.warn(`無法從 Telegram 取得檔案: ${fileId}`);
      return null;
    }

    // 下載檔案
    const url = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
    const response = await fetch(url);
    const arrayBuf = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);

    if (!buffer) {
      logger.warn(`無法下載 Telegram 檔案: ${fileId}`);
      return null;
    }

    const mimeType = getMimeType(fileName);
    const record = await uploadMedia(buffer, fileName, mimeType, source);
    
    logger.info(`✅ 從 Telegram 上傳媒體: ${record.id} (${fileName})`);
    return record;
  } catch (error) {
    logger.error(`❌ 從 Telegram 上傳失敗: ${fileName}`, error);
    return null;
  }
}

/**
 * 從 Discord 附件上傳
 */
export async function uploadFromDiscord(
  attachment: any,
  source: 'line' | 'telegram' | 'discord' = 'discord'
): Promise<MediaRecord | null> {
  try {
    const response = await fetch(attachment.url);
    const arrayBuf = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);

    if (!buffer) {
      logger.warn(`無法下載 Discord 附件: ${attachment.url}`);
      return null;
    }

    const mimeType = attachment.content_type || getMimeType(attachment.filename);
    const record = await uploadMedia(buffer, attachment.filename, mimeType, source);
    
    logger.info(`✅ 從 Discord 上傳媒體: ${record.id} (${attachment.filename})`);
    return record;
  } catch (error) {
    logger.error(`❌ 從 Discord 上傳失敗: ${attachment.filename}`, error);
    return null;
  }
}

/**
 * 根據檔名猜測 MIME 類型
 */
function getMimeType(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  
  const mimeTypes: { [key: string]: string } = {
    // 圖片
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'bmp': 'image/bmp',
    'svg': 'image/svg+xml',
    
    // 影片
    'mp4': 'video/mp4',
    'webm': 'video/webm',
    'ogg': 'video/ogg',
    'mov': 'video/quicktime',
    'avi': 'video/x-msvideo',
    'mkv': 'video/x-matroska',
    
    // 音頻
    'mp3': 'audio/mpeg',
    'wav': 'audio/wav',
    'oga': 'audio/ogg',
    'm4a': 'audio/mp4',
    
    // 文件
    'pdf': 'application/pdf',
    'doc': 'application/msword',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'xls': 'application/vnd.ms-excel',
    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'zip': 'application/zip',
  };

  return mimeTypes[ext] || 'application/octet-stream';
}

/**
 * 生成多媒體回覆訊息
 */
export function generateMediaReplyMessage(record: MediaRecord): string {
  const { originalFilename, mediaType, fileSize, publicUrl } = record;
  const sizeMB = (fileSize / 1024 / 1024).toFixed(2);
  
  return `
📸 多媒體已存儲
✓ 檔案: ${originalFilename}
✓ 大小: ${sizeMB} MB
✓ 類型: ${mediaType}
✓ 連結: ${publicUrl}

👉 點擊上面的連結預覽或下載
  `.trim();
}

/**
 * 生成多媒體統計訊息
 */
export function generateMediaStatsMessage(stats: any): string {
  const totalGB = (stats.totalSize / 1024 / 1024 / 1024).toFixed(2);
  
  return `
📊 多媒體庫統計
總檔案數: ${stats.totalCount}
總大小: ${totalGB} GB

📁 按類型分類:
  🖼️  圖片: ${stats.byType.image}
  🎬 影片: ${stats.byType.video}
  📄 檔案: ${stats.byType.file}

📱 按來源分類:
  LINE: ${stats.bySource.line}
  Telegram: ${stats.bySource.telegram}
  Discord: ${stats.bySource.discord}
  `.trim();
}
