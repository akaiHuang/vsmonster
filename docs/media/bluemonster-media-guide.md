# 📸 BlueMonster 多媒體系統使用指南

> 本文檔教你如何在 BlueMonster AI 中使用多媒體系統，包括獲取用戶上傳的照片和生成存取連結。

---

## 🎯 核心概念

### 自動流程
```
用戶在 LINE 傳送照片
  ↓ (自動上傳)
Gateway 儲存到檔案系統
  ↓ (自動記錄)
媒體庫記錄 metadata
  ↓ (AI 可查詢)
你可以拿到 mediaId 和連結
```

用戶**無需任何特殊操作**，直接傳送照片就會自動上傳。

---

## 📖 如何在 AI 中使用

### 情境 1：用戶傳送照片，AI 需要知道

**流程**：
```
用戶: [傳送照片到 LINE]
↓
Gateway 自動上傳到多媒體庫
↓
你(AI) 在 IncomingMessage 中看到 media 欄位
↓
你可以拿到 mediaId 和檔案信息
```

**如何獲取**：

在 `server.ts` 的 `handleChannelMessage` 中，你已經可以看到 `media` 物件：

```typescript
const { userId, text, media, messageId } = parsed;

// media 是一個陣列，包含用戶傳送的所有媒體
if (media && media.length > 0) {
  const mediaItem = media[0]; // 第一個媒體
  
  console.log(mediaItem.type);    // 'image' | 'video' | 'file'
  console.log(mediaItem.id);      // LINE 訊息 ID
}
```

---

### 情境 2：AI 處理完照片，生成連結給用戶

**方式 A：用戶上傳的照片連結**

```typescript
// 用戶傳送的照片已自動上傳
// mediaId 儲存在 media 物件中

const mediaRecord = await getMedia(mediaId);
// 現在你有了：
// - mediaRecord.publicUrl = '/api/media/xxx/view'
// - mediaRecord.id = media ID
```

發給用戶：
```typescript
await sendToChannel(channel, userId, `
  📸 你的照片已保存
  連結: https://your-domain.com${mediaRecord.publicUrl}
`);
```

**方式 B：AI 自己處理後上傳新版本**

```typescript
import { uploadMedia } from './services/media.service';

// 假設你用某個圖片處理庫編輯了照片
const editedBuffer = await editImage(originalBuffer);

// 上傳編輯後的版本
const editedRecord = await uploadMedia(
  editedBuffer,
  'photo_edited.jpg',
  'image/jpeg',
  'ai-edit'  // 來源標記為 AI 編輯
);

// 現在有了編輯版本的連結
await sendToChannel(channel, userId, `
  ✅ 處理完成！
  原圖: https://your-domain.com${mediaRecord.publicUrl}
  編輯版: https://your-domain.com${editedRecord.publicUrl}
`);
```

---

## 🔌 API 引用

### 核心函數

#### `getMedia(mediaId: string): MediaRecord`
```typescript
import { getMedia } from './services/media.service';

const record = getMedia('550e8400-e29b-41d4-a716-446655440000');
// 返回：
// {
//   id: '550e8400-e29b-41d4-a716-446655440000',
//   filename: '550e8400-e29b-41d4-a716-446655440000.jpg',
//   originalFilename: 'photo.jpg',
//   mimeType: 'image/jpeg',
//   fileSize: 2048576,
//   source: 'line',
//   uploadedAt: Date,
//   filePath: '/path/to/file',
//   publicUrl: '/api/media/xxx/view',
//   mediaType: 'image'
// }
```

#### `uploadMedia(buffer, filename, mimeType, source): MediaRecord`
```typescript
import { uploadMedia } from './services/media.service';

const record = await uploadMedia(
  Buffer.from([...]),      // 檔案內容
  'my_photo.jpg',          // 檔案名稱
  'image/jpeg',            // MIME 類型
  'ai-edit'                // 來源（'line'|'telegram'|'discord'|'ai-edit'）
);
```

#### `listMedia(skip, limit): MediaRecord[]`
```typescript
import { listMedia } from './services/media.service';

const records = listMedia(0, 10);  // 獲取最新 10 個
records.forEach(r => {
  console.log(r.originalFilename);
  console.log(r.publicUrl);
});
```

#### `getMediaStats(): Stats`
```typescript
import { getMediaStats } from './services/media.service';

const stats = getMediaStats();
// {
//   totalCount: 150,
//   totalSize: 1073741824,
//   byType: { image: 120, video: 25, file: 5 },
//   bySource: { line: 80, telegram: 40, discord: 30 }
// }
```

---

## 💻 完整代碼範例

### 例子 1：用戶傳送照片，AI 確認並提供連結

```typescript
// 在 server.ts 的 handleChannelMessage 中

import { getMedia, uploadMedia } from './services/media.service';

private async handleChannelMessage(channel: string, event: any): Promise<void> {
  const parsed = this.channelManager.parseMessage(channel, event);
  if (!parsed) return;

  const { userId, media } = parsed;

  // 偵測到照片
  if (media && media.length > 0 && media[0].type === 'image') {
    const mediaId = media[0].id;
    
    // 等待一下，確保已上傳完成
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // 取得媒體記錄
    const record = getMedia(mediaId);
    
    if (record) {
      const message = `
📸 照片已接收並保存！
- 檔案: ${record.originalFilename}
- 大小: ${(record.fileSize / 1024 / 1024).toFixed(2)} MB
- 預覽: https://your-domain.com${record.publicUrl}

你可以直接點擊連結查看或下載。
      `.trim();
      
      await this.sendToChannel(channel, userId, message);
    }
  }
}
```

### 例子 2：查詢用戶所有上傳的照片

```typescript
// 在某個命令處理器中

import { listMedia } from './services/media.service';

async function handlePhotoListCommand(userId: string) {
  const allPhotos = listMedia(0, 20); // 最新 20 張
  
  let reply = '📸 你最近上傳的照片:\n\n';
  
  allPhotos.forEach((photo, idx) => {
    const size = (photo.fileSize / 1024).toFixed(0);
    reply += `${idx + 1}. ${photo.originalFilename} (${size}KB)\n`;
    reply += `   連結: https://your-domain.com${photo.publicUrl}\n\n`;
  });
  
  return reply;
}
```

### 例子 3：AI 編輯照片後上傳

```typescript
// 假設你有某個圖片編輯庫（如 Sharp）

import { uploadMedia, getMedia } from './services/media.service';
import sharp from 'sharp';

async function editAndUploadPhoto(originalMediaId: string) {
  // 取得原始照片
  const original = getMedia(originalMediaId);
  if (!original) throw new Error('找不到照片');
  
  // 讀取原始檔案
  const buffer = fs.readFileSync(original.filePath);
  
  // 編輯：添加文字、調整大小等
  const edited = await sharp(buffer)
    .resize(800, 600)                    // 調整大小
    .overlayWith(/* 文字層 */)           // 添加文字
    .toBuffer();
  
  // 上傳編輯後的版本
  const editedRecord = await uploadMedia(
    edited,
    `${original.id}_edited.jpg`,
    'image/jpeg',
    'ai-edit'
  );
  
  return {
    original: `https://your-domain.com${original.publicUrl}`,
    edited: `https://your-domain.com${editedRecord.publicUrl}`
  };
}
```

---

## 🚀 集成到你的工作流

### Step 1：在訊息處理時自動上傳（已完成✅）
```
用戶傳送照片 → Gateway 自動上傳到媒體庫
```

### Step 2：在 AI 邏輯中使用
```typescript
// 當 AI 需要使用照片時
const mediaRecord = getMedia(mediaIdFromUser);
if (mediaRecord) {
  // 使用 mediaRecord.publicUrl 生成連結
  // 使用 mediaRecord.filePath 讀取檔案內容
}
```

### Step 3：回覆用戶
```typescript
await sendToChannel(channel, userId, `
  ✅ 完成！
  連結: https://your-domain.com${record.publicUrl}
`);
```

---

## 📌 重點總結

| 需求 | 方案 |
|------|------|
| **獲取用戶上傳的照片** | `media` 物件在 `handleChannelMessage` 中 |
| **拿到媒體連結** | `getMedia(mediaId)` 後 → `.publicUrl` |
| **生成新版本連結** | `uploadMedia(...)` 後 → `.publicUrl` |
| **查詢所有媒體** | `listMedia(skip, limit)` |
| **查看統計** | `getMediaStats()` |

---

## 🔗 連結格式

### 預覽（在瀏覽器中打開）
```
https://your-domain.com/api/media/{mediaId}/view
```

### 下載（強制下載）
```
https://your-domain.com/api/media/{mediaId}/download
```

### 影片縮圖
```
https://your-domain.com/api/media/{mediaId}/thumbnail
```

### 本機開發
```
http://localhost:3000/api/media/{mediaId}/view
```

---

## ⚡ 快速實戰

### 最小化代碼示例

```typescript
import { getMedia, uploadMedia } from './services/media.service';

// 1️⃣ 用戶傳送照片
const { media } = parsed;

// 2️⃣ 獲取媒體
const record = getMedia(media[0].id);

// 3️⃣ 生成連結
const url = `https://your-domain.com${record.publicUrl}`;

// 4️⃣ 回覆用戶
await sendMessage(`📸 已保存: ${url}`);
```

---

## 🐛 常見問題

**Q: 媒體 ID 從哪裡來？**  
A: 用戶傳送訊息時，`media[0].id` 就是 LINE 的訊息 ID，也是媒體庫中的 mediaId。

**Q: 為什麼有時候找不到媒體？**  
A: 上傳是非同步的，可能還在進行中。加個延遲：`await new Promise(r => setTimeout(r, 500))`

**Q: 可以同時上傳多個檔案嗎？**  
A: 可以，`uploadMedia()` 可以多次調用。

**Q: 檔案永遠存儲嗎？**  
A: 是的，除非主動調用 `deleteMedia()`。

---

## 📚 相關檔案

- [API 文檔](./media-database-guide.md)
- [整合指南](./media-integration-guide.md)
- 核心代碼: `packages/gateway/src/services/media.service.ts`
- 資料庫: `.media-db.json` (應用根目錄)
- 檔案存儲: `media-storage/YYYY-MM/` (應用根目錄)
