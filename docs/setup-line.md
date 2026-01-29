# LINE 頻道設定指南

本指南將協助你設定 LINE Messaging API 並連接到 vsMolt。

## 前置需求

1. LINE 帳號
2. LINE Developers 帳號

## 步驟 1: 建立 LINE Developers 帳號

1. 前往 [LINE Developers](https://developers.line.biz/)
2. 使用 LINE 帳號登入
3. 建立或選擇一個 Provider

## 步驟 2: 建立 Messaging API Channel

1. 在 Provider 頁面點擊 **Create a new channel**
2. 選擇 **Messaging API**
3. 填寫必要資訊:
   - Channel name: 你的 Bot 名稱
   - Channel description: 描述
   - Category: 選擇適合的分類
   - Subcategory: 選擇子分類
4. 同意服務條款並建立

## 步驟 3: 取得憑證

### Channel Access Token

1. 進入你的 Channel 設定頁面
2. 點擊 **Messaging API** 標籤
3. 捲動到 **Channel access token** 區塊
4. 點擊 **Issue** 產生 Token
5. 複製這個 Token

### Channel Secret

1. 在 Channel 設定頁面
2. 點擊 **Basic settings** 標籤
3. 找到 **Channel secret**
4. 點擊 **View** 並複製

## 步驟 4: 設定 Webhook

### 本地開發 (使用 ngrok)

1. 啟動 vsMolt Gateway:
   ```bash
   pnpm dev
   ```

2. 在 `configs/config.json` 中啟用 ngrok:
   ```json
   {
     "tunnel": {
       "enabled": true,
       "authtoken": "your_ngrok_token"
     }
   }
   ```

3. 複製 ngrok 提供的 URL

### 設定 LINE Webhook

1. 回到 LINE Developers Console
2. 進入 **Messaging API** 標籤
3. 在 **Webhook settings** 區塊:
   - Webhook URL: `https://your-ngrok-url.ngrok.io/webhook/line`
   - 啟用 **Use webhook**
4. 點擊 **Verify** 確認連線成功

## 步驟 5: 配置 vsMolt

編輯 `configs/config.json`:

```json
{
  "channels": {
    "line": {
      "channelAccessToken": "你的 Channel Access Token",
      "channelSecret": "你的 Channel Secret"
    }
  }
}
```

## 步驟 6: 測試連線

1. 在 LINE 中加入你的 Bot 好友 (透過 QR Code 或搜尋 Bot ID)
2. 發送測試訊息
3. 確認 vsMolt 收到訊息

## 常見問題

### Q: Webhook 驗證失敗

確認:
- URL 格式正確 (包含 `/webhook/line`)
- ngrok 正在運行
- Gateway 服務已啟動

### Q: 收不到訊息

檢查:
- Channel Access Token 是否正確
- Webhook 是否已啟用
- 查看 Gateway 日誌

### Q: 訊息發送失敗

可能原因:
- Token 過期，需要重新 Issue
- 超過免費額度限制

## 安全建議

1. **不要公開你的 Token**: 將敏感資訊存放在環境變數
2. **使用 HTTPS**: 生產環境務必使用 SSL
3. **驗證簽名**: vsMolt 會自動驗證 LINE 的請求簽名

## 參考連結

- [LINE Messaging API 官方文件](https://developers.line.biz/en/docs/messaging-api/)
- [LINE Bot SDK Node.js](https://github.com/line/line-bot-sdk-nodejs)
