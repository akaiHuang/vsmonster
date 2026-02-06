# Discord 頻道設定指南

本指南將協助你設定 Discord Bot 並連接到 VSMONSTER。

## 前置需求

1. Discord 帳號
2. 一個你有管理權限的 Discord 伺服器

## 步驟 1: 建立 Discord Application

### 進入 Developer Portal

1. 前往 [Discord Developer Portal](https://discord.com/developers/applications)
2. 使用 Discord 帳號登入
3. 點擊右上角的 **New Application**
4. 輸入應用程式名稱（例如: "My VSMONSTER Bot"）
5. 點擊 **Create**

## 步驟 2: 建立 Bot

### 新增 Bot

1. 在左側選單點擊 **Bot**
2. 點擊 **Add Bot**
3. 確認建立 Bot

### 取得 Bot Token

1. 在 Bot 頁面，找到 **TOKEN** 區塊
2. 點擊 **Reset Token**
3. 複製產生的 Token
4. ⚠️ **重要**: Token 只會顯示一次，請妥善保存

### 設定 Bot 權限

在 **Privileged Gateway Intents** 區塊，啟用:
- ✅ **MESSAGE CONTENT INTENT** (必要，用於讀取訊息內容)
- ✅ **SERVER MEMBERS INTENT** (選填)

點擊 **Save Changes** 儲存

## 步驟 3: 取得 Application ID

1. 在左側選單點擊 **General Information**
2. 找到 **APPLICATION ID**
3. 點擊 **Copy** 複製

## 步驟 4: 取得 Public Key (選填)

如果你需要使用 Discord Interactions (Slash Commands):

1. 在 **General Information** 頁面
2. 找到 **PUBLIC KEY**
3. 點擊 **Copy** 複製

## 步驟 5: 邀請 Bot 到伺服器

### 產生邀請連結

1. 在左側選單點擊 **OAuth2** → **URL Generator**
2. 在 **SCOPES** 區塊勾選:
   - ✅ `bot`
   - ✅ `applications.commands` (如果需要 Slash Commands)

3. 在 **BOT PERMISSIONS** 區塊勾選:
   - ✅ Read Messages/View Channels
   - ✅ Send Messages
   - ✅ Send Messages in Threads
   - ✅ Embed Links
   - ✅ Attach Files
   - ✅ Read Message History
   - ✅ Add Reactions
   - ✅ Use Slash Commands

4. 複製下方產生的 **GENERATED URL**

### 邀請 Bot

1. 在瀏覽器開啟複製的 URL
2. 選擇要加入的伺服器
3. 點擊 **授權**
4. 完成人機驗證

## 步驟 6: 配置 VSMONSTER

### 方法 1: 使用設定向導

執行:
```bash
vsmonster init
```

選擇 Discord，然後輸入:
- Bot Token
- Application ID
- Public Key (選填)

### 方法 2: 手動編輯配置

編輯 `configs/config.json`:

```json
{
  "channels": {
    "discord": {
      "botToken": "你的 Bot Token",
      "applicationId": "你的 Application ID",
      "publicKey": "你的 Public Key"
    }
  }
}
```

## 步驟 7: 啟動並測試

1. 啟動 VSMONSTER Gateway:
   ```bash
   pnpm dev
   ```

2. 在 Discord 伺服器中發送訊息給 Bot
3. 確認 VSMONSTER 收到訊息

## Bot 命令設定

### 註冊 Slash Commands

VSMONSTER 會自動註冊以下命令:

| 命令 | 說明 |
|------|------|
| `/task` | 建立新任務 |
| `/status` | 查看任務狀態 |
| `/model` | 切換 AI 模型 |
| `/preview` | 取得預覽連結 |
| `/help` | 顯示說明 |

### 使用方式

在 Discord 中:

```
/task 建立一個 React 登入頁面

或直接 @ 提及 Bot:

@VSMONSTER 幫我建立一個 TODO 應用
```

## 進階設定

### 限制特定頻道

如果你只想讓 Bot 在特定頻道運作:

```json
{
  "channels": {
    "discord": {
      "botToken": "...",
      "applicationId": "...",
      "allowedChannels": ["頻道ID1", "頻道ID2"]
    }
  }
}
```

### 設定管理員

限制只有特定用戶可以使用:

```json
{
  "channels": {
    "discord": {
      "botToken": "...",
      "applicationId": "...",
      "adminUsers": ["用戶ID1", "用戶ID2"]
    }
  }
}
```

## 常見問題

### Q: Bot 沒有回應訊息

檢查:
1. Bot 是否在線（Discord 中顯示綠色狀態）
2. Bot Token 是否正確
3. MESSAGE CONTENT INTENT 是否已啟用
4. Bot 是否有該頻道的讀取/發送權限

### Q: Slash Commands 沒有出現

1. 確認已勾選 `applications.commands` scope
2. 重新邀請 Bot 到伺服器
3. Discord 可能需要最多 1 小時來同步命令

### Q: 收到 "Missing Access" 錯誤

Bot 缺少必要權限:
1. 檢查 Bot 角色權限
2. 確認 Bot 角色在頻道權限列表中
3. 重新邀請 Bot 並勾選所有必要權限

### Q: Token 無效

1. Token 可能已被重置，前往 Developer Portal 重新取得
2. 確認 Token 沒有多餘的空格
3. 檢查是否複製完整

## 安全注意事項

1. **永遠不要分享 Bot Token**
2. 如果 Token 洩露，立即在 Developer Portal 重置
3. 使用環境變數儲存敏感資訊
4. 定期檢查 Bot 的活動日誌

## 權限說明

| 權限 | 用途 |
|------|------|
| Read Messages | 讀取用戶訊息 |
| Send Messages | 發送回覆 |
| Embed Links | 發送格式化訊息 |
| Attach Files | 發送檔案和圖片 |
| Read History | 讀取歷史訊息 |
| Add Reactions | 添加反應表情 |

## 下一步

設定完成後:

1. 啟動 Gateway: `pnpm dev`
2. 連接 VS Code Extension
3. 開始透過 Discord 控制 VS Code Copilot！

---

如有問題，請參考:
- [Discord Developer Documentation](https://discord.com/developers/docs)
- [discord.js Guide](https://discordjs.guide/)
