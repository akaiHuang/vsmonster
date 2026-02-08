# 📸 媒體 CDN 安全隧道設置指南

## 概述

為了提高媒體文件訪問的安全性，使用 Cloudflare Tunnel 為媒體創建一個獨立的隧道，而不是混用 Webhook 域名。

> ⚠️ **本指南適用於需要架設自己 vsmonster 實例的用戶**

### 架構
```
LINE/Telegram/Discord 用戶
        ↓ 上傳照片
    your-webhook-domain.com (Webhook - moltbot 隧道)
        ↓
    Gateway (localhost:3000)
        ↓ 存儲文件
    media-storage/YYYY-MM/
        ↓
    Cloudflare Tunnel (media-cdn 隧道)
        ↓ 路由到
    media.your-domain.com (公開訪問)
        ↓
    用戶瀏覽器/客户端（下載/預覽照片）
```

## 設置步驟

### 前置需求
- Cloudflare 帳號（免費方案即可）
- 自己的域名（在 Cloudflare 上管理）
- 已安裝 `cloudflared` CLI
- 已安裝 Node.js 和 pnpm

### 1️⃣ 創建媒體隧道

```bash
# 創建新隧道用於媒體
cloudflared tunnel create media-cdn

# 例子輸出：
# Tunnel credentials written to /Users/yourname/.cloudflared/UUID.json
# Created tunnel media-cdn with id UUID
```

記下隧道 UUID（之後需要用到）。

### 2️⃣ 配置 DNS 路由

```bash
# 將 media 子域名路由到隧道
cloudflared tunnel route dns media-cdn media.your-domain.com

# 例子：
# cloudflared tunnel route dns media-cdn media.example.com
# 結果：CNAME 記錄已添加到 Cloudflare DNS
```

### 3️⃣ 創建隧道配置文件

編輯 `~/.cloudflared/media-cdn-config.yml`：

```yaml
tunnel: <YOUR_TUNNEL_UUID>
credentials-file: /path/to/.cloudflared/<YOUR_TUNNEL_UUID>.json

ingress:
  - hostname: media.your-domain.com
    service: http://localhost:3000/api/media
  - service: http_status:404
```

替換：
- `<YOUR_TUNNEL_UUID>` → 步驟 1 獲得的 UUID
- `/path/to/` → 實際路徑
- `media.your-domain.com` → 你的實際域名

### 4️⃣ 啟動隧道

```bash
# 啟動媒體隧道（後台）
cloudflared tunnel run media-cdn &

# 同時確保主 Webhook 隧道運行
cloudflared tunnel run moltbot &

# 驗證兩個隧道都在運行
ps aux | grep cloudflared
```

### 5️⃣ 環境變數配置

複製 `.env.example` → `.env`：

```bash
cp .env.example .env
```

編輯 `.env`：

```dotenv
# Gateway 設定
VSMONSTER_PORT=3000

# 公開 URL（Webhook 用，替換為你的域名）
VSMONSTER_PUBLIC_URL=https://your-webhook-domain.com

# 媒體 CDN URL（替換為你的媒體域名）
VSMONSTER_MEDIA_URL=https://media.your-domain.com

# LINE 設定（從 LINE 開發者後台取得）
LINE_CHANNEL_ACCESS_TOKEN=<your_token>
LINE_CHANNEL_SECRET=<your_secret>

# ... 其他平台設定（可選）
```

### 6️⃣ 啟動 Gateway

```bash
pnpm dev:gateway

# 應該看到日誌：
# [Media Service] Initialized with URL base: https://media.your-domain.com
# ✓ Gateway listening on port 3000
```

## 工作流

## 工作流

### 1. 用戶上傳媒體
用戶通過 LINE/Telegram/Discord 發送照片 → 消息到達 Webhook

### 2. Gateway 處理
```
handleChannelMessage() 
  ↓
檢測到圖片媒體
  ↓
uploadFromLINE() / uploadFromTelegram() / uploadFromDiscord()
  ↓
uploadMedia() - 保存到 media-storage/2026-02/xxxx-uuid.jpg
  ↓
生成記錄：{
  publicUrl: "https://media.your-domain.com/api/media/{mediaId}/view"
}
  ↓
回覆用戶：📸 照片已保存\n連結: https://media.your-domain.com/api/media/{mediaId}/view
```

### 3. 媒體訪問流程
用戶點擊鏈接 → Cloudflare CDN → media.your-domain.com → Gateway /api/media/{id}/view → 返回文件

## 故障排除

### 媒體隧道無連接
```bash
# 殺死舊進程
killall cloudflared

# 重新啟動兩個隧道
cloudflared tunnel run moltbot &
cloudflared tunnel run media-cdn &

# 驗證
sleep 2 && cloudflared tunnel list
```

### 404 錯誤在媒體 URL
```bash
# 檢查 DNS 是否正確解析
nslookup media.your-domain.com

# 檢查 Cloudflare 隧道狀態
cloudflared tunnel info media-cdn

# 檢查本地 Gateway 健康
curl http://localhost:3000/health
```

### 環境變數未加載
```bash
# 確認 .env 存在且包含正確的媒體 URL
grep VSMONSTER_MEDIA_URL .env

# 確認 Gateway 初始化日誌
pnpm dev:gateway 2>&1 | grep "Media Service"
```

## 相關文件

- **媒體服務代碼**
  - `packages/gateway/src/services/media.service.ts`
  - `packages/gateway/src/routes/media.routes.ts`
  - `packages/gateway/src/services/media-integration.ts`
  
- **文檔**
  - [bluemonster-media-guide.md](./bluemonster-media-guide.md) - BlueMonster 使用指南
  - [media-database-guide.md](./media-database-guide.md) - API 文檔
  - [media-integration-guide.md](./media-integration-guide.md) - 平台集成指南

## 安全注意事項

1. **不要在版本控制中提交 `.env`**
   - 已加入 `.gitignore`
   - `.env.example` 是模板，用於展示配置結構

2. **隧道認證文件**
   - `~/.cloudflared/*.json` 包含敏感認證信息
   - 絕不要上傳到 GitHub 或公開共享

3. **域名與隧道分離**
   - Webhook 域名：用於接收消息（頻繁變動）
   - 媒體域名：用於提供文件（高並發）
   - 分別管理提高了可靠性和安全性

## 下一步

1. ✅ 按照本指南創建媒體隧道
2. ✅ 配置環境變數
3. ✅ 啟動 Gateway
4. ✅ 在 LINE/Telegram/Discord 發送照片測試
5. 📋 確認媒體 URL 正確生成
6. 📋 驗證文件訪問是否成功

---

**文檔版本**：1.0  
**適用於**：vsmonster 所有用戶部署
