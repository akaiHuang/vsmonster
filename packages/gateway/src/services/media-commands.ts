/**
 * 多媒體命令處理器
 * 用於處理諸如 "列出媒體", "查看統計" 等命令
 */

import { 
  listMedia, 
  getMediaStats, 
  deleteMedia,
  getMedia 
} from '../services/media.service';

export interface CommandContext {
  userId: string;
  channel: 'line' | 'telegram' | 'discord';
  sendMessage: (text: string) => Promise<void>;
  sendMediaLink?: (url: string) => Promise<void>;
}

/**
 * 列出媒體 - /media list [page]
 */
export async function handleMediaList(ctx: CommandContext, page: string = '1'): Promise<void> {
  const pageNum = Math.max(1, parseInt(page) || 1);
  const limit = 10;
  const skip = (pageNum - 1) * limit;

  const records = listMedia(skip, limit);

  if (records.length === 0) {
    await ctx.sendMessage(`📭 第 ${pageNum} 頁沒有媒體檔案`);
    return;
  }

  let reply = `📋 多媒體列表 (第 ${pageNum} 頁)\n\n`;
  records.forEach((record, idx) => {
    const size = (record.fileSize / 1024 / 1024).toFixed(2);
    reply += `${idx + 1}. ${record.originalFilename}\n`;
    reply += `   📊 ${size} MB | 🎯 ${record.mediaType}\n`;
    reply += `   🔗 /media ${record.id}\n\n`;
  });

  reply += `👉 使用 /media <id> 查看詳情`;

  await ctx.sendMessage(reply);
}

/**
 * 查看媒體 - /media <mediaId>
 */
export async function handleMediaInfo(ctx: CommandContext, mediaId: string): Promise<void> {
  const record = getMedia(mediaId);

  if (!record) {
    await ctx.sendMessage(`❌ 找不到媒體: ${mediaId}`);
    return;
  }

  const size = (record.fileSize / 1024 / 1024).toFixed(2);
  const date = new Date(record.uploadedAt).toLocaleString('zh-TW');

  let reply = `
📸 多媒體詳情

🏷️  檔案名: ${record.originalFilename}
📊 大小: ${size} MB
🎯 類型: ${record.mediaType}
📱 來源: ${record.source.toUpperCase()}
📅 上傳: ${date}

🔗 預覽連結:
${record.publicUrl}

💾 下載連結:
/api/media/${record.id}/download
  `.trim();

  await ctx.sendMessage(reply);

  // 如果是圖片，嘗試直接傳送預覽
  if (record.mediaType === 'image' && ctx.sendMediaLink) {
    await ctx.sendMediaLink(record.publicUrl);
  }
}

/**
 * 查看統計 - /media stats
 */
export async function handleMediaStats(ctx: CommandContext): Promise<void> {
  const stats = getMediaStats();
  const totalGB = (stats.totalSize / 1024 / 1024 / 1024).toFixed(2);

  const reply = `
📊 多媒體庫統計

📈 總計:
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

💡 提示:
/media list - 查看媒體列表
/media <id> - 查看媒體詳情
  `.trim();

  await ctx.sendMessage(reply);
}

/**
 * 刪除媒體 - /media delete <mediaId>（需要驗證）
 */
export async function handleMediaDelete(
  ctx: CommandContext,
  mediaId: string,
  requireConfirm: boolean = true
): Promise<void> {
  const record = getMedia(mediaId);

  if (!record) {
    await ctx.sendMessage(`❌ 找不到媒體: ${mediaId}`);
    return;
  }

  if (requireConfirm) {
    await ctx.sendMessage(
      `⚠️  確認刪除 "${record.originalFilename}"?\n` +
      `回覆: /media delete ${mediaId} confirm`
    );
    return;
  }

  const success = deleteMedia(mediaId);
  if (success) {
    await ctx.sendMessage(`✅ 已刪除: ${record.originalFilename}`);
  } else {
    await ctx.sendMessage(`❌ 刪除失敗`);
  }
}

/**
 * 幫助命令 - /media help
 */
export async function handleMediaHelp(ctx: CommandContext): Promise<void> {
  const help = `
📸 多媒體資料庫幫助

使用方式:
  /media list [page]    - 查看媒體列表（分頁）
  /media <id>           - 查看媒體詳情
  /media stats          - 查看統計資訊
  /media delete <id>    - 刪除媒體
  /media help           - 顯示此幫助

💾 自動上傳:
  直接傳送照片或影片，系統會自動儲存到多媒體庫
  並生成預覽連結

🔗 連結格式:
  預覽: /api/media/{id}/view
  下載: /api/media/{id}/download
  縮圖: /api/media/{id}/thumbnail (影片)

📝 範例:
  用戶: 傳送一張照片
  機器人: 自動上傳，回覆連結
  用戶: /media list
  機器人: 顯示最近的媒體
  用戶: /media abc123
  機器人: 顯示該媒體的詳情
  `.trim();

  await ctx.sendMessage(help);
}

/**
 * 解析媒體命令
 */
export async function parseMediaCommand(
  ctx: CommandContext,
  command: string
): Promise<boolean> {
  const parts = command.split(' ');
  const action = parts[0].toLowerCase();

  switch (action) {
    case 'list':
      await handleMediaList(ctx, parts[1]);
      return true;

    case 'stats':
      await handleMediaStats(ctx);
      return true;

    case 'delete':
      const isConfirm = parts[2]?.toLowerCase() === 'confirm';
      await handleMediaDelete(ctx, parts[1], !isConfirm);
      return true;

    case 'help':
      await handleMediaHelp(ctx);
      return true;

    default:
      // 假設是 media ID
      if (parts[0].match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
        await handleMediaInfo(ctx, parts[0]);
        return true;
      }

      return false;
  }
}
