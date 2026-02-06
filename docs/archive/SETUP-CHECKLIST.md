# 🚀 VSMONSTER 安裝檢查清單

安裝完 `pnpm install` 後，請依序完成以下步驟：

## ✅ 1. 安裝 Moltbot（必需）
```bash
moltbot --version
```
- ✅ 已安裝 → 跳過
- ❌ 未安裝 → 執行：`npm install -g moltbot@latest`

---

## ✅ 2. 社群軟體設定（至少選一個）

### LINE Bot
```bash
moltbot onboard
```
- 選擇 LINE 平台
- 登入 LINE 開發者帳號
- 複製 Channel Access Token 和 Secret 到 `.env`

### Telegram（可選）
- 與 @BotFather 對話建立 Bot
- 取得 Token 複製到 `.env`

### Discord（可選）
- 在 Discord Developer Portal 建立應用
- 取得 Bot Token 複製到 `.env`

---

## ✅ 3. 媒體 CDN 設定（推薦）

### 3.1 檢查隧道工具
```bash
cloudflared --version    # 應該已安裝
ngrok --version          # 可選（開發用）
```

### 3.2 創建媒體隧道（按照 docs/MEDIA-CDN-SETUP.md）
```bash
# 1. 創建隧道
cloudflared tunnel create media-cdn

# 2. 配置 DNS
cloudflared tunnel route dns media-cdn media.your-domain.com

# 3. 創建配置文件
cat > ~/.cloudflared/media-cdn-config.yml << 'EOF'
tunnel: <YOUR_TUNNEL_UUID>
credentials-file: /path/to/.cloudflared/<YOUR_TUNNEL_UUID>.json

ingress:
  - hostname: media.your-domain.com
    service: http://localhost:3000/api/media
  - service: http_status:404
EOF

# 4. 啟動隧道
cloudflared tunnel run media-cdn &
```

### 3.3 配置環境變數
編輯或創建 `.env`：
```bash
cp .env.example .env
# 然後編輯 .env 替換以下值：
VSMONSTER_PUBLIC_URL=https://your-webhook-domain.com
VSMONSTER_MEDIA_URL=https://media.your-domain.com
```

---

## ✅ 4. 啟動服務

### 4.1 開發模式（全部）
```bash
pnpm dev
```
或分別啟動：
```bash
pnpm dev:gateway &        # Gateway (port 3000)
pnpm dev:mission &        # Mission Control (port 3001)
```

### 4.2 生產模式（Gateway 只）
```bash
pnpm start
```

---

## ✅ 5. 安裝 VS Code 擴展

1. 開啟 VS Code
2. 按 `Cmd+Shift+P`（macOS）或 `Ctrl+Shift+P`（Linux/Windows）
3. 搜尋 "VSMONSTER"
4. 點擊 "Install"

---

## ✅ 6. 驗證設置

### 檢查 Gateway 健康
```bash
curl http://localhost:3000/health
```
應該返回類似：
```json
{
  "status": "ok",
  "uptime": 123.456,
  "channels": ["line"],
  "tasks": 0
}
```

### 檢查媒體隧道
```bash
cloudflared tunnel list
```
應該看到 `media-cdn` 隧道列出

### 測試媒體上傳
向 LINE Bot 發送照片，應該收到回覆含媒體連結

---

## 🎯 完成！

- ✅ Moltbot 已安裝
- ✅ 社群軟體已配置
- ✅ 媒體 CDN 已設置
- ✅ Gateway 正在運行
- ✅ VS Code 擴展已安裝

**下一步**：
1. 開啟 VS Code 並登入 GitHub Copilot
2. 開始使用 BlueMonster AI 助手
3. 在社群軟體中與 Bot 互動進行測試

---

## 🐛 故障排除

### Gateway 無法連接到媒體隧道
```bash
# 檢查隧道是否運行
ps aux | grep cloudflared | grep media-cdn

# 重新啟動隧道
killall cloudflared
cloudflared tunnel run moltbot &
cloudflared tunnel run media-cdn &
```

### 環境變數未加載
```bash
# 檢查 .env 是否存在
ls -la .env

# 檢查內容
grep VSMONSTER .env
```

### 404 錯誤訪問媒體 URL
```bash
# 檢查 DNS 解析
nslookup media.your-domain.com

# 檢查 Cloudflare 隧道狀態
cloudflared tunnel info media-cdn
```

---

📖 **更多文檔**：
- [媒體 CDN 完整設置指南](./docs/MEDIA-CDN-SETUP.md)
- [BlueMonster 多媒體使用指南](./docs/bluemonster-media-guide.md)
- [API 文檔](./docs/media-database-guide.md)
- [Cloudflare 維護日誌](./docs/CLOUDFLARE-MAINTENANCE.md)

