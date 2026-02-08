# 🌐 ActiveTunnels.md - 活躍隧道管理

> 此文檔用於追蹤和管理當前活躍的 ngrok/Cloudflare 隧道。
> 更新頻率：隧道啟動/停止時立即更新。

---

## ⚙️ 隧道管理

### 如何添加新隧道

```bash
# 1. 啟動隧道（例如 ngrok）
ngrok http 3000

# 2. 從輸出複製公開 URL，例如：
# Forwarding                    https://abc-xyz.ngrok.io -> http://localhost:3000

# 3. 在下面的「活躍隧道」表中添加記錄

# 4. 停止時刪除該行並標記時間戳
```

---

## 📊 活躍隧道列表

| 隧道名稱 | 工具 | 本地 URL | 公開 URL | 用途 | 啟動時間 | 備註 |
|----------|------|---------|---------|------|---------|------|
| moltbot | Cloudflare Tunnel | N/A | your-domain.com | 主機器人 webhook | 永久 | 已配置 DNS |
| media-cdn | Cloudflare Tunnel | N/A | media.your-domain.com | 多媒體 CDN | 永久 | 已配置 DNS |
| [範例] CSV Share | ngrok | localhost:8000 | https://abc-xyz.ngrok.io | 文件分享 | 2026-02-04 10:30 | 臨時分享 |

---

## 🔄 隧道狀態檢查

### Cloudflare 隧道

```bash
# 查看 moltbot 隧道狀態
cloudflare tunnel list

# 查看具體隧道詳情
cloudflare tunnel info <tunnel-name>

# 查看隧道日誌
cloudflare tunnel logs <tunnel-name>

# 活躍隧道
cloudflared tunnel run moltbot
cloudflared tunnel run media-cdn
```

### ngrok 隧道

```bash
# 查看所有活躍的 ngrok 連接
curl http://localhost:4040/api/tunnels

# 查看特定隧道狀態
ps aux | grep ngrok

# 停止 ngrok
pkill ngrok
```

---

## 📝 隧道日誌

### 最近的隧道活動

```
2026-02-04 10:30 - 啟動 ngrok CSV 分享隧道
  URL: https://abc-xyz.ngrok.io
  本地: localhost:8000
  用途: 分享報告文件給用戶

2026-02-04 14:00 - 停止 ngrok 隧道
  原因: 檔案分享完成

2026-02-03 09:15 - Cloudflare moltbot 隧道正常運行
  域名: your-domain.com
  狀態: ✅ 活躍

2026-02-03 09:15 - Cloudflare media-cdn 隧道正常運行
  域名: media.your-domain.com
  狀態: ✅ 活躍
```

---

## 🛠️ 常見隧道命令

### ngrok

```bash
# 快速啟動
ngrok http 3000          # 轉發 localhost:3000

# 自訂埠
ngrok http -subdomain=my-app 8080

# 查看 ngrok Web 界面（應監控板）
# 訪問 http://localhost:4040

# 停止所有 ngrok
killall ngrok

# 查看詳細狀態
curl http://localhost:4040/api/tunnels | jq .
```

### Cloudflare Tunnel (cloudflared)

```bash
# 認證
cloudflare auth login

# 創建隧道
cloudflare tunnel create <tunnel-name>

# 配置隧道（編輯 ~/.cloudflare/config.yml）

# 運行隧道
cloudflared tunnel run <tunnel-name>

# 查看隧道列表
cloudflare tunnel list

# 刪除隧道
cloudflare tunnel delete <tunnel-name>

# 查看連接狀態
cloudflare tunnel info <tunnel-name>
```

---

## 🔐 安全考慮

### ngrok 隧道

- ⚠️ ngrok URL 是公開的，任何知道 URL 的人都可訪問
- ✅ 應設定密碼或認證保護敏感服務
- ✅ 定期更換或停止不需要的隧道
- ⚠️ 不要在隧道上暴露敏感數據（密鑰、密碼、個人信息）

### Cloudflare Tunnel

- ✅ 使用自訂域名，需要 DNS 配置
- ✅ 支援 SSL/TLS 加密
- ✅ 可以設定訪問控制和 WAF 規則
- ✅ 長期穩定，適合生產環境

---

## 📋 隧道檢查清單

使用此清單確保隧道管理安全：

- [ ] 所有活躍隧道都已記錄
- [ ] ngrok 隧道有設定過期時間
- [ ] 敏感服務已設定認證
- [ ] Cloudflare 隧道配置正確
- [ ] DNS 記錄已驗證
- [ ] 日誌已檢查
- [ ] 已告知用戶們當前可用的分享 URL

---

## 📚 相關文檔

- [BLUEMONSTER-SKILLS.md](./BLUEMONSTER-SKILLS.md) - 技能文檔
- [newSkill.md](./newSkill.md) - 新技能發現日誌
- [MEDIA-CDN-SETUP.md](./MEDIA-CDN-SETUP.md) - Cloudflare 隧道設定
- [setup-ngrok.md](./setup-ngrok.md) - ngrok 快速開始

---

**最後更新**：2026-02-04  
**活躍隧道數**：2 個永久隧道 (Cloudflare) + N 個臨時隧道 (ngrok)  
**狀態**：✅ 正常

