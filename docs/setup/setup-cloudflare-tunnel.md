# ☁️ Cloudflare Tunnel 設定指南

> 使用 Cloudflare Tunnel 讓社群平台連接到你的本機 VSMONSTER，**完全隱藏你的真實 IP**。

---

## 🔒 為什麼選擇 Cloudflare Tunnel？

| 特點 | 說明 |
|------|------|
| **完全隱藏 IP** | 外界只能看到 Cloudflare 的 IP |
| **免費** | Cloudflare Tunnel 完全免費 |
| **穩定** | 不像 ngrok 會變動網址 |
| **HTTPS** | 自動 SSL 憑證 |
| **自訂網域** | 可綁定自己的網域 |

---

## 📋 前置需求

- Cloudflare 帳號（[免費註冊](https://dash.cloudflare.com/sign-up)）
- （可選）自己的網域（GoDaddy、Namecheap 等）

---

## 🚀 設定步驟

### 方案 A：使用 Cloudflare 免費子網域

如果你沒有自己的網域，可以使用 Cloudflare 提供的免費子網域。

#### Step 1：安裝 cloudflared

```bash
# macOS
brew install cloudflare/cloudflare/cloudflared

# Linux (Debian/Ubuntu)
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o cloudflared.deb
sudo dpkg -i cloudflared.deb

# Windows
# 下載：https://github.com/cloudflare/cloudflared/releases/latest
```

#### Step 2：登入 Cloudflare

```bash
cloudflared tunnel login
```

這會開啟瀏覽器，登入後選擇你要使用的網域（或稍後設定）。

#### Step 3：建立 Tunnel

```bash
cloudflared tunnel create vsmonster
```

會輸出類似：
```
Created tunnel vsmonster with id xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

記下這個 Tunnel ID。

#### Step 4：設定 Tunnel

建立設定檔 `~/.cloudflared/config.yml`：

```yaml
tunnel: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx  # 你的 Tunnel ID
credentials-file: /Users/你的用戶名/.cloudflared/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx.json

ingress:
  - hostname: vsmonster.你的網域.com
    service: http://localhost:3000
  - service: http_status:404
```

#### Step 5：設定 DNS

```bash
cloudflared tunnel route dns vsmonster vsmonster.你的網域.com
```

#### Step 6：啟動 Tunnel

```bash
cloudflared tunnel run vsmonster
```

你的 VSMONSTER Gateway 現在可以通過 `https://vsmonster.你的網域.com` 訪問！

---

### 方案 B：使用 GoDaddy 網域 + Cloudflare

#### Step 1：購買網域

1. 前往 [GoDaddy](https://www.godaddy.com/)
2. 搜尋你想要的網域
3. 購買（通常第一年 $1-10 USD）

#### Step 2：將網域轉移到 Cloudflare DNS

1. 登入 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 點擊 "Add a Site"
3. 輸入你的網域
4. 選擇 Free 方案
5. Cloudflare 會給你兩個 NS（Name Server）

#### Step 3：在 GoDaddy 更改 Name Server

1. 登入 GoDaddy
2. 進入 Domain Settings
3. 找到 "Nameservers"
4. 選擇 "Change" → "Enter my own nameservers"
5. 輸入 Cloudflare 給的 NS：
   ```
   ns1.cloudflare.com
   ns2.cloudflare.com
   ```

等待 DNS 傳播（通常 5-30 分鐘）。

#### Step 4：設定 Cloudflare Tunnel

按照方案 A 的 Step 1-6 設定，使用你的 GoDaddy 網域。

---

## ⚙️ 整合到 VSMONSTER

### 設定 .env

```env
# Cloudflare Tunnel
CLOUDFLARE_TUNNEL_ENABLED=true
CLOUDFLARE_TUNNEL_URL=https://vsmonster.你的網域.com
```

### 設定社群平台 Webhook

使用你的 Cloudflare Tunnel URL 設定 Webhook：

| 平台 | Webhook URL |
|------|-------------|
| LINE | `https://vsmonster.你的網域.com/webhook/line` |
| Telegram | `https://vsmonster.你的網域.com/webhook/telegram` |
| Discord | `https://vsmonster.你的網域.com/webhook/discord` |

---

## 🔄 設為系統服務（自動啟動）

### macOS (launchd)

```bash
sudo cloudflared service install
```

### Linux (systemd)

```bash
sudo cloudflared service install
sudo systemctl enable cloudflared
sudo systemctl start cloudflared
```

---

## 🛡️ 安全最佳實踐

| 措施 | 說明 |
|------|------|
| ✅ **限制來源** | 在 Cloudflare 設定只允許特定 IP |
| ✅ **啟用 WAF** | 使用 Cloudflare 的 Web Application Firewall |
| ✅ **監控日誌** | 定期檢查 Cloudflare Analytics |
| ✅ **更新 cloudflared** | 保持工具最新版本 |

---

## 🆘 常見問題

### Q: DNS 傳播要多久？
A: 通常 5-30 分鐘，最長 48 小時。

### Q: 可以用免費網域嗎？
A: 可以使用 Freenom 等免費網域，但穩定性較差。

### Q: Tunnel 斷線怎麼辦？
A: 設為系統服務後會自動重連。手動重啟：`cloudflared tunnel run vsmonster`

---

## 📚 延伸閱讀

- [Cloudflare Tunnel 官方文檔](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/)
- [Cloudflare Zero Trust](https://developers.cloudflare.com/cloudflare-one/)
