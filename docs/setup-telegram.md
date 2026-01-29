# Telegram 頻道設定指南

本指南將協助你設定 Telegram Bot 並連接到 vsMolt。

## 前置需求

1. Telegram 帳號
2. Telegram 應用程式

## 步驟 1: 建立 Telegram Bot

### 使用 BotFather

1. 在 Telegram 中搜尋 **@BotFather**
2. 開始對話，發送 `/start`
3. 發送 `/newbot` 建立新 Bot
4. 依照指示:
   - 輸入 Bot 的顯示名稱 (例如: "My vsMolt Bot")
   - 輸入 Bot 的用戶名 (必須以 `bot` 結尾，例如: "my_vsmolt_bot")
5. BotFather 會回覆你的 **Bot Token**，格式類似:
   ```
   123456789:ABCdefGHIjklMNOpqrsTUVwxyz
   ```
6. **保存這個 Token**，稍後需要使用

## 步驟 2: 設定 Bot

### 基本設定 (透過 BotFather)

發送以下命令來設定你的 Bot:

```
/setdescription - 設定 Bot 描述
/setabouttext - 設定 Bot 簡介
/setuserpic - 設定 Bot 頭像
/setcommands - 設定命令列表
```

建議的命令設定:
```
task - 建立新任務
status - 查看任務狀態
model - 切換 AI 模型
preview - 取得預覽連結
help - 顯示說明
```

### 隱私設定

如果你的 Bot 需要在群組中使用:

1. 發送 `/setprivacy` 給 BotFather
2. 選擇你的 Bot
3. 選擇 **Disable** (這樣 Bot 可以讀取群組中的所有訊息)

## 步驟 3: 配置 vsMolt

### 方法 1: Polling 模式 (推薦用於開發)

編輯 `configs/config.json`:

```json
{
  "channels": {
    "telegram": {
      "botToken": "123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
    }
  }
}
```

這種模式不需要公開 URL，適合本地開發。

### 方法 2: Webhook 模式 (推薦用於生產)

需要 HTTPS URL:

```json
{
  "channels": {
    "telegram": {
      "botToken": "123456789:ABCdefGHIjklMNOpqrsTUVwxyz",
      "webhookUrl": "https://your-domain.com/webhook/telegram"
    }
  },
  "tunnel": {
    "enabled": true,
    "authtoken": "your_ngrok_token"
  }
}
```

## 步驟 4: 啟動 Gateway

```bash
# 開發模式
pnpm dev

# 或生產模式
pnpm start
```

## 步驟 5: 測試連線

1. 在 Telegram 中找到你的 Bot
2. 發送 `/start` 或任意訊息
3. 確認 vsMolt 收到訊息

## 功能說明

### 支援的訊息類型

| 類型 | 說明 |
|------|------|
| 文字 | 一般文字訊息 |
| 圖片 | 支援圖片上傳，可用於視覺分析 |
| 文件 | 支援文件上傳 |
| 語音 | 語音訊息 (需要轉錄) |
| 位置 | 位置分享 |
| 貼圖 | Telegram 貼圖 |

### 群組功能

在群組中使用 Bot:

1. 將 Bot 加入群組
2. 設定為管理員 (可選，用於讀取所有訊息)
3. 使用 `@bot_username` 提及 Bot，或使用命令

## 進階設定

### 限制允許的用戶

```json
{
  "channels": {
    "telegram": {
      "botToken": "...",
      "allowedUsers": [123456789, 987654321]
    }
  }
}
```

### 自訂命令處理

```json
{
  "channels": {
    "telegram": {
      "botToken": "...",
      "commands": {
        "custom": "自訂命令處理腳本路徑"
      }
    }
  }
}
```

## 常見問題

### Q: Bot 沒有回應

檢查:
1. Bot Token 是否正確
2. Gateway 服務是否運行
3. 查看終端機日誌

### Q: Webhook 設定失敗

確認:
1. URL 是 HTTPS
2. SSL 憑證有效
3. 伺服器可以從外部訪問

### Q: 群組中 Bot 沒反應

可能原因:
1. 隱私模式未關閉
2. Bot 不是管理員
3. 沒有使用 @ 提及 Bot

### Q: 訊息發送失敗

檢查:
1. 用戶是否已啟動與 Bot 的對話
2. 是否超過 Telegram API 限制
3. Bot 是否被封鎖

## 安全建議

1. **保護 Bot Token**: 不要將 Token 提交到版本控制
2. **使用環境變數**: 
   ```bash
   export TELEGRAM_BOT_TOKEN="your_token"
   ```
3. **設定用戶白名單**: 限制可以使用 Bot 的用戶

## API 限制

Telegram Bot API 有以下限制:
- 每秒最多 30 條訊息給同一個用戶
- 每分鐘最多 20 條訊息給同一個群組
- 文件大小限制: 50MB (下載), 20MB (上傳)

## 參考連結

- [Telegram Bot API 官方文件](https://core.telegram.org/bots/api)
- [grammY 框架文件](https://grammy.dev/)
- [BotFather](https://t.me/botfather)
