# 📸 多媒體資料庫系統

VSMONSTER 多媒體資料庫系統用於管理 LINE、Telegram、Discord 等通訊軟體中無法直接傳送的多媒體檔案（照片、影片等）。

---

## 功能概覽

✅ **自動收集**：從各平台接收的多媒體自動存儲  
✅ **預覽支援**：圖片直接預覽、影片自動生成縮圖  
✅ **公開連結**：為每個檔案生成可分享的公開下載連結  
✅ **永久存儲**：檔案永久保存，支持高達 1GB 的大型檔案  
✅ **統計資訊**：追蹤媒體數量、大小、來源等信息  

---

## API 端點

### 上傳多媒體

**POST** `/api/media/upload`

```bash
curl -X POST http://localhost:3000/api/media/upload \
  -H "Content-Type: application/json" \
  -d '{
    "buffer": "base64_encoded_file_content",
    "originalFilename": "photo.jpg",
    "mimeType": "image/jpeg",
    "source": "line"
  }'
```

**回應**：
```json
{
  "success": true,
  "media": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "filename": "550e8400-e29b-41d4-a716-446655440000.jpg",
    "originalFilename": "photo.jpg",
    "mimeType": "image/jpeg",
    "fileSize": 2048576,
    "source": "line",
    "uploadedAt": "2026-02-04T12:00:00Z",
    "publicUrl": "/api/media/550e8400-e29b-41d4-a716-446655440000/view",
    "thumbnailUrl": "/api/media/550e8400-e29b-41d4-a716-446655440000/thumbnail",
    "mediaType": "image"
  }
}
```

---

### 查看媒體（預覽）

**GET** `/api/media/:mediaId/view`

用於在瀏覽器中預覽（圖片顯示、影片播放）

```bash
# 預覽圖片
https://your-domain.com/api/media/550e8400-e29b-41d4-a716-446655440000/view

# 回應：檔案內容 + 適當的 Content-Type
```

---

### 下載媒體

**GET** `/api/media/:mediaId/download`

強制下載檔案（瀏覽器會提示儲存）

```bash
https://your-domain.com/api/media/550e8400-e29b-41d4-a716-446655440000/download
```

---

### 取得影片縮圖

**GET** `/api/media/:mediaId/thumbnail`

自動生成的影片縮圖（1% 時間點的截圖）

```bash
https://your-domain.com/api/media/550e8400-e29b-41d4-a716-446655440000/thumbnail
```

---

### 取得媒體資訊

**GET** `/api/media/:mediaId/info`

取得媒體的元資訊

```bash
curl https://your-domain.com/api/media/550e8400-e29b-41d4-a716-446655440000/info
```

**回應**：
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "filename": "550e8400-e29b-41d4-a716-446655440000.jpg",
  "originalFilename": "photo.jpg",
  "mimeType": "image/jpeg",
  "fileSize": 2048576,
  "source": "line",
  "uploadedAt": "2026-02-04T12:00:00Z",
  "publicUrl": "/api/media/550e8400-e29b-41d4-a716-446655440000/view",
  "mediaType": "image"
}
```

---

### 列出媒體（分頁）

**GET** `/api/media?skip=0&limit=20`

列出所有上傳的媒體

```bash
curl "https://your-domain.com/api/media?skip=0&limit=20"
```

**回應**：
```json
{
  "skip": 0,
  "limit": 20,
  "total": 150,
  "media": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "filename": "550e8400-e29b-41d4-a716-446655440000.jpg",
      "originalFilename": "photo.jpg",
      "mimeType": "image/jpeg",
      "fileSize": 2048576,
      "source": "line",
      "uploadedAt": "2026-02-04T12:00:00Z",
      "publicUrl": "/api/media/550e8400-e29b-41d4-a716-446655440000/view",
      "mediaType": "image"
    }
  ]
}
```

---

### 取得統計資訊

**GET** `/api/media/stats/overview`

取得媒體庫的統計資訊

```bash
curl https://your-domain.com/api/media/stats/overview
```

**回應**：
```json
{
  "totalCount": 150,
  "totalSize": 1073741824,
  "byType": {
    "image": 120,
    "video": 25,
    "file": 5
  },
  "bySource": {
    "line": 80,
    "telegram": 40,
    "discord": 30
  }
}
```

---

### 刪除媒體（管理員）

**DELETE** `/api/media/:mediaId`

刪除指定的媒體檔案

```bash
curl -X DELETE https://your-domain.com/api/media/550e8400-e29b-41d4-a716-446655440000
```

**回應**：
```json
{
  "success": true,
  "message": "已刪除"
}
```

---

## 集成到 LINE / Telegram / Discord

### LINE 整合

在 LINE 訊息處理器中：

```typescript
// packages/gateway/src/channels/line.ts

// 接收媒體
if (event.message?.type === 'image') {
  const buffer = await lineClient.getMessageContent(event.message.id);
  await uploadMedia(buffer, 'line_photo.jpg', 'image/jpeg', 'line');
}
```

---

### Telegram 整合

```typescript
// packages/gateway/src/channels/telegram.ts

// 接收照片
if (msg.photo) {
  const file = await bot.telegram.getFile(msg.photo[msg.photo.length - 1].file_id);
  const buffer = await downloadFile(file.file_path);
  await uploadMedia(buffer, `telegram_photo_${Date.now()}.jpg`, 'image/jpeg', 'telegram');
}
```

---

## 檔案存儲結構

```
media-storage/
├── 2026-02/
│   ├── 550e8400-e29b-41d4-a716-446655440000.jpg
│   ├── 550e8400-e29b-41d4-a716-446655440001.mp4
│   ├── 550e8400-e29b-41d4-a716-446655440001-thumb.jpg
│   └── 550e8400-e29b-41d4-a716-446655440002.png
├── 2026-01/
│   └── ...
└── temp/
```

- **按月份分類**：便於管理和備份
- **安全檔名**：使用 UUID 避免衝突
- **縮圖單獨存儲**：影片縮圖以 `-thumb.jpg` 結尾

---

## 配置說明

### 環境變數

```env
# .env
MEDIA_STORAGE_PATH=/path/to/media-storage    # 儲存位置（預設：./media-storage）
MEDIA_MAX_SIZE=1073741824                     # 最大檔案大小（預設：1GB）
```

### 系統要求

- **FFmpeg**：用於生成影片縮圖
  ```bash
  # macOS
  brew install ffmpeg
  
  # Linux
  sudo apt-get install ffmpeg
  
  # Windows
  # 下載 https://ffmpeg.org/download.html
  ```

---

## 使用場景

### 場景 1：用戶透過 LINE 傳送照片

```
用戶照片 (LINE) 
  ↓
Gateway 接收
  ↓
自動上傳到多媒體庫 (uploadMedia)
  ↓
生成公開連結：https://your-domain.com/api/media/xxx/view
  ↓
回覆用戶連結
  ↓
用戶點擊預覽或下載
```

### 場景 2：Copilot 處理後回傳檔案

```
Copilot 生成結果檔案
  ↓
上傳到多媒體庫
  ↓
傳回公開連結給用戶
  ↓
用戶通過各平台存取
```

---

## 限制與注意

| 項目 | 限制 |
|------|------|
| 單檔大小 | 1GB |
| 儲存期限 | 永久 |
| 支援格式 | 所有（受系統限制） |
| 併發上傳 | 無限制 |
| 影片預覽 | 自動生成縮圖（依賴 FFmpeg） |

---

## 進階功能（未來可擴展）

- [ ] 雲端儲存（S3/Cloudflare R2）
- [ ] 自動清理過期檔案
- [ ] 檔案加密
- [ ] 水印添加
- [ ] 影片轉碼
- [ ] CDN 加速

---

## 故障排除

### Q: 上傳失敗 - "檔案大小超過 1GB"

**A**: 減小檔案大小或聯繫管理員提升限制

### Q: 影片沒有縮圖

**A**: 確保系統已安裝 FFmpeg：`which ffmpeg`

### Q: 找不到儲存的檔案

**A**: 檢查環境變數 `MEDIA_STORAGE_PATH` 是否正確

---

## 更新日誌

**v1.0.0** (2026-02-04)
- ✅ 基礎上傳、預覽、下載功能
- ✅ 自動影片縮圖生成
- ✅ 統計和管理 API
- ✅ LINE/Telegram/Discord 整合支援
