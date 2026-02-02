# VSMONSTER 更新說明 v0.1.0

## 🎉 主要功能更新

### 1. VSCode 擴充套件設定整合

現在可以直接在 VSCode 設定中配置通訊軟體和 Cloudflare：

**設定項目：**
- `vsmonster.channels.line.channelAccessToken` - LINE Channel Access Token
- `vsmonster.channels.line.channelSecret` - LINE Channel Secret
- `vsmonster.channels.line.webhookSecret` - Webhook 安全令牌（自動生成）
- `vsmonster.channels.line.whitelist` - 白名單用戶 ID 列表
- `vsmonster.channels.telegram.botToken` - Telegram Bot Token
- `vsmonster.channels.telegram.webhookSecret` - Telegram Webhook 安全令牌
- `vsmonster.channels.discord.botToken` - Discord Bot Token
- `vsmonster.channels.discord.applicationId` - Discord Application ID
- `vsmonster.tunnel.cloudflare.*` - Cloudflare Tunnel 配置

**如何設定：**
1. 在 VSCode 中按 `Cmd/Ctrl + ,` 開啟設定
2. 搜尋 "vsmonster"
3. 填入你的通訊軟體憑證

### 2. LINE Webhook 安全性增強

#### 2.1 隨機 Webhook URL
Webhook URL 現在會包含一個隨機生成的安全令牌：
```
舊：https://your-domain.com/webhook/line
新：https://your-domain.com/webhook/line/a1b2c3d4e5f6...隨機字串
```

#### 2.2 白名單機制

**自動白名單流程：**
1. 使用者第一次用 LINE 發訊息給 Bot
2. 系統會監控到該用戶的 ID
3. 自動將用戶加入白名單
4. 發送確認訊息：「✅ 你已被加入白名單，現在可以使用 VSMONSTER 了！」

**手動管理白名單：**
```json
// 在 VSCode 設定或 config.json 中
{
  "vsmonster.channels.line.whitelist": [
    "U1234567890abcdef",
    "U0987654321fedcba"
  ]
}
```

**清空白名單（允許所有人）：**
```json
{
  "vsmonster.channels.line.whitelist": []
}
```

#### 2.3 Webhook Token 驗證
每個 webhook 請求的 header 都會驗證 `x-line-signature`，確保請求來自 LINE 官方伺服器。

**安全性檢查：**
- ✅ URL 路徑驗證（包含隨機令牌）
- ✅ Header 簽名驗證
- ✅ 白名單用戶檢查

### 3. VSCode 擴充套件單一實例控制

**問題：** 當多個 VSCode 視窗都安裝 VSMONSTER 時，系統不知道要控制哪個視窗。

**解決方案：** 實現了實例鎖機制

- 只有第一個啟動的 VSMONSTER 實例會運行
- 其他視窗會顯示停用狀態
- 狀態欄顯示：`$(error) VSMONSTER (Disabled)`
- 關閉主實例後，鎖會自動釋放

**技術細節：**
- 使用系統臨時目錄的鎖文件 (`vsmonster-instance.lock`)
- 包含 PID 檢查，避免殭屍鎖
- 自動清理機制

### 4. Web Server 版本

**全新功能！** 現在可以直接用瀏覽器與 VSMONSTER Copilot 對話，無需通訊軟體。

**訪問方式：**
```
http://localhost:3000/web
```

**功能特點：**
- 🎨 精美的對話介面
- 💬 即時對話（不創建任務）
- 📊 會話歷史記錄
- 🚀 無需安裝通訊軟體

**API 端點：**
```typescript
POST /api/web/chat
{
  "message": "你好",
  "conversationId": "web-123456"
}

GET /api/web/conversations/:id
DELETE /api/web/conversations/:id
```

**範例對話：**
```
用戶：什麼是 TypeScript？
VSMONSTER：TypeScript 是 JavaScript 的超集...

用戶：幫我寫一個 React 元件
VSMONSTER：好的，讓我幫你創建... [創建任務]
```

### 5. 基於 Soul.md 的智能聊天系統

**核心概念：** VSMONSTER 現在會區分「閒聊」和「工作任務」。

#### 5.1 Soul.md 配置文件

位置：`/soul.md`

這個檔案定義了 VSMONSTER 的個性和行為：

```markdown
## 判斷標準

#### 創建任務的情況：
- 「幫我寫」
- 「創建一個」
- 「實現」
- 「修改」
- 「除錯」

#### 不創建任務的情況：
- 「這是什麼」
- 「如何學習」
- 「解釋」
- 「推薦」
```

#### 5.2 智能判斷機制

**範例對話：**

❌ 不創建任務（一般對話）：
```
用戶：什麼是 React Hooks？
VSMONSTER：React Hooks 是 React 16.8 引入的新特性...
```

✅ 創建任務：
```
用戶：幫我寫一個使用 useState 的計數器元件
VSMONSTER：好的，我理解了。讓我幫你完成這個任務。
[創建正式任務並執行]
```

#### 5.3 AI 自我學習

VSMONSTER 可以根據互動經驗更新 `soul.md`：

```typescript
// 程式碼中可以更新 Soul 配置
await soulManager.updateSoul({
  taskTriggers: [...existingTriggers, '新增觸發詞'],
  nonTaskTriggers: [...existingTriggers, '新增非觸發詞']
});
```

**自動更新的時機：**
- 用戶糾正判斷錯誤時
- 檢測到新的常見模式時
- 管理員手動訓練時

## 📋 升級指南

### 1. 更新配置文件

如果你已經在使用 VSMONSTER，請遷移配置：

**從 config.json 到 VSCode 設定：**

```bash
# 舊方式（仍然支援）
configs/config.json

# 新方式（推薦）
VSCode 設定 > VSMONSTER
```

### 2. 設定 LINE Webhook URL

更新你的 LINE Webhook URL：

1. 啟動 Gateway 並查看日誌，找到隨機生成的 webhook 路徑：
   ```
   INFO: LINE webhook path: /webhook/line/a1b2c3d4e5f6789...
   ```

2. 在 LINE Developers Console 更新 Webhook URL：
   ```
   https://your-domain.com/webhook/line/a1b2c3d4e5f6789...
   ```

### 3. 初始化白名單

**方法 1：自動（推薦）**
- 直接用 LINE 發訊息給 Bot
- 系統會自動加入白名單

**方法 2：手動**
```json
{
  "vsmonster.channels.line.whitelist": ["你的 LINE User ID"]
}
```

### 4. 創建 soul.md

在專案根目錄創建 `soul.md`，或讓系統自動生成。

## 🔧 故障排除

### Q: 多個 VSCode 視窗都想使用 VSMONSTER 怎麼辦？
A: 只保持一個主視窗開啟 VSMONSTER，其他視窗會自動停用。

### Q: 白名單沒有生效？
A: 確認 `vsmonster.channels.line.whitelist` 設定正確，或清空陣列允許所有人。

### Q: Webhook URL 太長了？
A: 這是為了安全性。你可以在 VSCode 設定中自訂較短的 `webhookSecret`。

### Q: 如何測試 Web Interface？
A: 啟動 Gateway 後訪問 `http://localhost:3000/web`

### Q: 如何調整 VSMONSTER 的個性？
A: 編輯根目錄的 `soul.md` 文件。

## 🚀 下一步計劃

- [ ] 支援多語言對話
- [ ] 更智能的任務分類
- [ ] 語音輸入支援
- [ ] 團隊協作功能
- [ ] 更多通訊平台（WeChat、Slack）

## 💡 使用建議

1. **日常使用**: 用 Web Interface 快速諮詢問題
2. **遠端工作**: 用 LINE/Telegram 隨時控制 VSCode
3. **團隊協作**: 用 Discord 與團隊共享 VSMONSTER
4. **安全第一**: 務必設定白名單和 webhook token

---

更新時間：2026-02-01
版本：v0.1.0
