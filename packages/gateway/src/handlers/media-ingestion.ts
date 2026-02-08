/**
 * Media Ingestion Handler
 * Downloads and stores incoming media from social channels into the
 * gateway media store so extensions get stable preview URLs.
 * Extracted from server.ts for improved maintainability.
 */

import { HolographyServer, IncomingMessage } from '@vsmonster/holography';
import { uploadMedia } from '../services/media.service';
import { logger } from '../utils/logger';

/**
 * Guess a reasonable file name and MIME type for an incoming media item.
 */
function guessNameAndMime(
  item: any,
  index: number
): { fileName: string; mimeType: string } {
  const type = String(item?.type || 'file');
  const fileNameRaw = typeof item?.fileName === 'string' ? item.fileName.trim() : '';
  const mimeRaw = typeof item?.mimeType === 'string' ? item.mimeType.trim() : '';

  if (fileNameRaw && mimeRaw) return { fileName: fileNameRaw, mimeType: mimeRaw };

  if (fileNameRaw) {
    const ext = fileNameRaw.split('.').pop()?.toLowerCase() || '';
    const mime =
      ext === 'png' ? 'image/png' :
      (ext === 'jpg' || ext === 'jpeg') ? 'image/jpeg' :
      ext === 'gif' ? 'image/gif' :
      ext === 'webp' ? 'image/webp' :
      ext === 'svg' ? 'image/svg+xml' :
      ext === 'pdf' ? 'application/pdf' :
      ext === 'txt' ? 'text/plain' :
      ext === 'html' ? 'text/html' :
      ext === 'json' ? 'application/json' :
      mimeRaw || 'application/octet-stream';
    return { fileName: fileNameRaw, mimeType: mime };
  }

  if (type === 'image') return { fileName: `image-${index + 1}.jpg`, mimeType: mimeRaw || 'image/jpeg' };
  if (type === 'video') return { fileName: `video-${index + 1}.mp4`, mimeType: mimeRaw || 'video/mp4' };
  if (type === 'audio') return { fileName: `audio-${index + 1}.mp3`, mimeType: mimeRaw || 'audio/mpeg' };
  return { fileName: `file-${index + 1}.bin`, mimeType: mimeRaw || 'application/octet-stream' };
}

/**
 * Download and store all incoming media items attached to a message.
 * Mutates the media items in-place by adding stable URLs.
 */
export async function ingestIncomingMedia(
  message: IncomingMessage,
  holography: HolographyServer
): Promise<void> {
  const items = Array.isArray(message.media) ? message.media : [];
  if (items.length === 0) return;

  const channel = message.channel;
  const source = channel === 'line' ? 'line' : channel === 'discord' ? 'discord' : 'telegram';
  const ch: any = holography.getChannelManager().getChannel<any>(channel as any);

  for (let i = 0; i < items.length; i += 1) {
    const it: any = items[i];
    if (!it || typeof it !== 'object') continue;
    // Skip if we already have a URL (Discord often has one).
    if (typeof it.url === 'string' && it.url.trim()) continue;

    const { fileName, mimeType } = guessNameAndMime(it, i);

    let buffer: Buffer | null = null;
    try {
      if (typeof it.url === 'string' && it.url) {
        const res = await fetch(it.url);
        const arrayBuf = await res.arrayBuffer();
        buffer = Buffer.from(arrayBuf);
      } else if (ch && typeof ch.downloadMedia === 'function' && typeof it.id === 'string') {
        buffer = await ch.downloadMedia(it.id);
      }
    } catch (err) {
      logger.warn(`Failed to download media for ${channel}: ${String(err)}`);
      buffer = null;
    }

    if (!buffer) continue;

    try {
      const record = await uploadMedia(buffer, fileName, mimeType, source as any);
      // Keep the original platform id in place, but add a stable preview URL.
      it.url = record.publicUrl;
      it.fileName = record.originalFilename;
      it.mimeType = record.mimeType;
      it.fileSize = record.fileSize;
    } catch (err) {
      logger.warn(`Failed to store media (${fileName}): ${String(err)}`);
    }
  }
}
