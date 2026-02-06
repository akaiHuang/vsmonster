# 🚇 ngrok 設定指南

> 使用 ngrok 快速建立對外連線，讓社群平台能連接到你的本機 VSMONSTER。

---

## ⚠️ ngrok vs Cloudflare Tunnel

| 特點 | ngrok | Cloudflare Tunnel |
|------|-------|-------------------|
| **設定難度** | ⭐ 超簡單 | ⭐⭐ 中等 |
| **IP 隱藏** | ⚠️ 部分（ngrok 知道你的 IP） | ✅ 完全隱藏 |
| **網址穩定** | ❌ 免費版每次重啟會變 | ✅ 固定 |
| **價格** | 免費/付費 | 免費 |
| **適合對象** | 開發測試 | 正式環境 |

> 💡 **建議**：開發測試用 ngrok，正式環境用 Cloudflare Tunnel。

---

## 🚀 快速開始

### Step 1：安裝 ngrok

```bash
# macOS
brew install ngrok

# Linux (Snap)
snap install ngrok

# 或直接下載
# https://ngrok.com/download
```

### Step 2：註冊並取得 Token

1. 前往 [ngrok.com](https://ngrok.com/) 註冊
2. 登入後進入 Dashboard
3. 複製你的 Authtoken

### Step 3：設定 Token

```bash
ngrok config add-authtoken 你的_NGROK_TOKEN
```

### Step 4：啟動 ngrok

```bash
# 先啟動 VSMONSTER Gateway
pnpm dev

# 另開終端機，啟動 ngrok
ngrok http 3000
```

會顯示：
```
Session Status                online
Account                       your@email.com
Forwarding                    https://xxxx-xx-xx-xxx-xx.ngrok.io -> http://localhost:3000

Connections                   ttl     opn     rt1     rt5     p50     p90
                              0       0       0.00    0.00    0.00    0.00
```

複製 `https://xxxx-xx-xx-xxx-xx.ngrok.io` 這個網址。

---

## ⚙️ 整合到 VSMONSTER

### 設定 .env

```env
# ngrok 設定
NGROK_ENABLED=true
NGROK_AUTHTOKEN=你的_NGROK_TOKEN
NGROK_REGION=ap   # ap=亞太, us=美國, eu=歐洲, au=澳洲
```

### 自動啟動 ngrok

VSMONSTER 可以自動啟動 ngrok，在 `.env` 設定：

```env
NGROK_ENABLED=true
```

啟動 Gateway 後會自動建立 ngrok tunnel。

---

## 📱 設定社群平台 Webhook

使用 ngrok 產生的網址設定 Webhook：

| 平台 | Webhook URL |
|------|-------------|
| LINE | `https://xxxx.ngrok.io/webhook/line` |
| Telegram | `https://xxxx.ngrok.io/webhook/telegram` |
| Discord | `https://xxxx.ngrok.io/webhook/discord` |

> ⚠️ **注意**：免費版 ngrok 每次重啟網址會變，需要重新設定 Webhook。

---

## 💰 ngrok 付費方案（可選）

如果你需要固定網址：

| 方案 | 價格 | 特點 |
|------|------|------|
| **Free** | $0 | 臨時網址，每次重啟會變 |
| **Personal** | $8/月 | 1 個固定網域 |
| **Pro** | $20/月 | 2 個固定網域 + 更多功能 |

設定固定網域：
```bash
ngrok http --domain=你的網域.ngrok-free.app 3000
```

---

## 🛡️ 安全注意事項

| ⚠️ 風險 | 🛡️ 對策 |
|---------|---------|
| ngrok 知道你的 IP | 使用 Cloudflare Tunnel 替代 |
| 網址外洩 | 不要公開分享 ngrok 網址 |
| 免費版無認證 | 在 Gateway 層做認證 |

### 啟用基本認證（付費功能）

```bash
ngrok http --basic-auth="user:password" 3000
```

---

## 🆘 常見問題

### Q: ngrok 顯示 "Your account is limited to 1 simultaneous ngrok agent session"
A: 免費帳號只能開一個 tunnel。關掉其他 ngrok 程序，或升級付費方案。

### Q: Webhook 回應 502 Bad Gateway
A: 確認 VSMONSTER Gateway 正在運行（`pnpm dev`）。

### Q: 每次重啟網址都變
A: 這是免費版限制。解決方案：
1. 升級 ngrok 付費方案
2. 改用 Cloudflare Tunnel（免費固定網址）

---

## 📚 延伸閱讀

- [ngrok 官方文檔](https://ngrok.com/docs)
- [ngrok 定價](https://ngrok.com/pricing)
- [Cloudflare Tunnel（推薦替代方案）](setup-cloudflare-tunnel.md)
