# 🔌 多媒體系統集成指南

本指南說明如何在 LINE、Telegram、Discord 中集成多媒體上傳功能。

---

## 🏗️ 架構概覽

```
用戶傳送媒體 (LINE/Telegram/Discord)
  ↓
平台訊息處理器
  ↓
uploadFromXXX() - 下載並上傳
  ↓
uploadMedia() - 核心上傳服務
  ↓
.media-db.json - 持久化記錄
  ↓
生成公開連結
  ↓
回覆用戶
```

---

## 📋 集成步驟

### 1️⃣ LINE 集成

在 `packages/gateway/src/channels/line/index.ts` 中：

```typescript
import { uploadFromLINE } from '../../services/media-integration';
import { parseMediaCommand } from '../../services/media-commands';

// 在訊息處理器中
async function handleLineMessage(event) {
  // 自動上傳媒體
  if (event.message?.type === 'image') {
    const record = await uploadFromLINE(
      lineClient,
      event.message.id,
      `line_photo_${Date.now()}.jpg`,
      'line'
    );
    
    if (record) {
      // 回覆連結
      await lineClient.pushMessage(event.source.userId, {
        type: 'text',
        text: `✅ 照片已保存\n連結: ${record.publicUrl}`
      });
    }
  }
  
  // 處理媒體命令
  if (text.startsWith('/media ')) {
    const command = text.substring(7); // 移除 "/media "
    const handled = await parseMediaCommand({
      userId: event.source.userId,
      channel: 'line',
      sendMessage: async (msg) => {
        await lineClient.pushMessage(event.source.userId, {
          type: 'text',
          text: msg
        });
      }
    }, command);
  }
}
```

### 2️⃣ Telegram 集成

在 `packages/gateway/src/channels/telegram/index.ts` 中：

```typescript
import { uploadFromTelegram } from '../../services/media-integration';
import { parseMediaCommand } from '../../services/media-commands';

// 在訊息處理器中
bot.on('photo', async (ctx) => {
  const photo = ctx.message.photo[ctx.message.photo.length - 1]; // 最高解析度
  
  const record = await uploadFromTelegram(
    bot,
    photo.file_id,
    `telegram_photo_${Date.now()}.jpg`,
    'telegram'
  );
  
  if (record) {
    await ctx.reply(
      `✅ 照片已保存\n` +
      `連結: ${record.publicUrl}`
    );
  }
});

bot.on('video', async (ctx) => {
  const video = ctx.message.video;
  
  const record = await uploadFromTelegram(
    bot,
    video.file_id,
    `telegram_video_${Date.now()}.mp4`,
    'telegram'
  );
  
  if (record) {
    await ctx.reply(
      `✅ 影片已保存\n` +
      `連結: ${record.publicUrl}`
    );
  }
});

// 處理媒體命令
bot.hears(/\/media(.*)/, async (ctx) => {
  const command = ctx.match[1].trim();
  
  const handled = await parseMediaCommand({
    userId: ctx.from.id.toString(),
    channel: 'telegram',
    sendMessage: async (msg) => {
      await ctx.reply(msg);
    }
  }, command);
  
  if (!handled) {
    await ctx.reply('❌ 無效的命令，輸入 /media help 查看幫助');
  }
});
```

### 3️⃣ Discord 集成

在 `packages/gateway/src/channels/discord/index.ts` 中：

```typescript
import { uploadFromDiscord } from '../../services/media-integration';
import { parseMediaCommand } from '../../services/media-commands';

// 在訊息處理器中
client.on('messageCreate', async (message) => {
  // 自動上傳附件
  if (message.attachments.size > 0) {
    for (const attachment of message.attachments.values()) {
      const record = await uploadFromDiscord(attachment, 'discord');
      
      if (record) {
        await message.reply(
          `✅ 檔案已保存\n` +
          `連結: ${record.publicUrl}`
        );
      }
    }
  }
  
  // 處理媒體命令
  if (message.content.startsWith('!media ')) {
    const command = message.content.substring(7); // 移除 "!media "
    
    const handled = await parseMediaCommand({
      userId: message.author.id,
      channel: 'discord',
      sendMessage: async (msg) => {
        await message.reply(msg);
      }
    }, command);
    
    if (!handled) {
      await message.reply('❌ 無效的命令，輸入 !media help 查看幫助');
    }
  }
});
```

---

## 🎯 用戶體驗流程

### LINE 用戶
```
用戶: [傳送照片]
機器人: ✅ 照片已保存
       連結: https://your-domain.com/api/media/xxx/view

用戶: /media list
機器人: [顯示最近的媒體列表]

用戶: /media xxx
機器人: [顯示該媒體的詳情和預覽]
```

### Telegram 用戶
```
用戶: [傳送影片]
機器人: ✅ 影片已保存
       連結: https://your-domain.com/api/media/yyy/view

用戶: /media stats
機器人: [顯示統計資訊]
```

### Discord 用戶
```
用戶: [上傳檔案]
機器人: ✅ 檔案已保存
       連結: https://your-domain.com/api/media/zzz/view

用戶: !media help
機器人: [顯示幫助資訊]
```

---

## 📚 可用命令

| 命令 | 說明 | 範例 |
|------|------|------|
| `/media list [page]` | 查看媒體列表 | `/media list 2` |
| `/media <id>` | 查看媒體詳情 | `/media 550e8400-e29b-...` |
| `/media stats` | 查看統計資訊 | `/media stats` |
| `/media delete <id>` | 刪除媒體 | `/media delete 550e8400-e29b-...` |
| `/media help` | 顯示幫助 | `/media help` |

---

## 🔄 自動流程

### 上傳多媒體時

1. **接收**: 用戶透過平台傳送媒體
2. **下載**: 系統從平台下載檔案到記憶體
3. **驗證**: 檢查檔案大小（≤1GB）
4. **儲存**: 寫入到 `media-storage/YYYY-MM/`
5. **記錄**: 儲存元資訊到 `.media-db.json`
6. **回覆**: 傳回公開連結給用戶

### 查詢媒體時

1. **解析**: 從命令提取 media ID
2. **查詢**: 從 `.media-db.json` 查找記錄
3. **格式化**: 生成友好的訊息
4. **回覆**: 傳回訊息 + 預覽（如果支援）

---

## 🛠️ 核心函數

### uploadFromLINE
```typescript
const record = await uploadFromLINE(
  lineClient,      // LINE Bot SDK 客戶端
  messageId,       // 訊息 ID
  fileName,        // 檔案名稱
  'line'          // 來源平台
);
```

### uploadFromTelegram
```typescript
const record = await uploadFromTelegram(
  telegramBot,    // Telegram Bot 實例
  fileId,         // Telegram 檔案 ID
  fileName,       // 檔案名稱
  'telegram'      // 來源平台
);
```

### uploadFromDiscord
```typescript
const record = await uploadFromDiscord(
  attachment,     // Discord 附件物件
  'discord'       // 來源平台
);
```

### parseMediaCommand
```typescript
const handled = await parseMediaCommand(
  {
    userId: 'user123',
    channel: 'line',
    sendMessage: async (text) => { /* ... */ }
  },
  'list 2'        // 命令字符串
);
```

---

## 📊 常見使用場景

### 場景 1：用戶分享照片到 LINE
```
1. 用戶在 LINE 傳送照片
2. Gateway 自動下載並上傳到多媒體庫
3. 回覆用戶：「✅ 照片已保存，點擊連結預覽」
4. 用戶收到預覽連結
```

### 場景 2：團隊成員查看最近的媒體
```
1. 成員輸入 `/media list`
2. 機器人回覆最近 10 個檔案
3. 成員輸入 `/media <id>`
4. 機器人顯示該媒體的詳情和預覽
```

### 場景 3：Copilot 生成檔案並分享
```
1. Copilot 處理完任務，生成檔案
2. Gateway 上傳到多媒體庫
3. 傳回公開連結給用戶
4. 用戶可在各平台透過連結下載
```

---

## ⚙️ 配置

### 環境變數

```env
# .env
MEDIA_STORAGE_PATH=./media-storage    # 儲存位置
MEDIA_DB_PATH=./.media-db.json        # 資料庫位置
TELEGRAM_BOT_TOKEN=your_token         # Telegram Token（用於下載）
```

### 系統要求

- **FFmpeg**: 用於影片縮圖生成
  ```bash
  brew install ffmpeg    # macOS
  sudo apt install ffmpeg # Linux
  ```

---

## 🐛 故障排除

### Q: 無法上傳媒體
**A**: 檢查：
- 檔案大小是否超過 1GB
- 是否有磁碟空間
- 媒體庫權限設定

### Q: 命令無法識別
**A**: 檢查：
- 命令格式是否正確（區分大小寫）
- 是否使用正確的前綴 (`/`, `!`)
- 機器人是否已配置監聽該命令

### Q: 影片沒有縮圖
**A**: 檢查：
- 系統是否已安裝 FFmpeg：`which ffmpeg`
- 影片格式是否支援

---

## 🚀 下一步

- [ ] 實現真正的 MongoDB 集成（目前用 JSON）
- [ ] 雲端存儲 (S3/R2) 整合
- [ ] 自動清理過期檔案
- [ ] Web UI 管理介面
- [ ] 檔案搜尋功能
