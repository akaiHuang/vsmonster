# VSMONSTER 快速開始指南

歡迎使用 VSMONSTER！本指南將幫助你在 5 分鐘內完成設定並開始使用。

## 📋 前置需求

- Node.js v20.0.0 或以上
- pnpm v8.0.0 或以上
- VS Code (已安裝 GitHub Copilot)
- 社群軟體帳號 (LINE / Telegram / Discord 擇一)

## 🚀 快速安裝

### 1. 複製專案

```bash
git clone https://github.com/your-username/VSMONSTER.git
cd VSMONSTER
```

### 2. 安裝依賴

```bash
pnpm install
```

### 3. 執行設定向導

```bash
pnpm dev
```

首次啟動會自動執行設定向導，引導你完成:
- ✅ 環境檢查
- 🔗 VS Code 連接
- 📱 社群軟體綁定

或者手動執行設定向導:

```bash
cd packages/gateway
pnpm exec ts-node bin/cli.ts init
```

## 📱 選擇社群平台

### 選項 1: Telegram (推薦新手)

**優點**: 設定最簡單，不需要公開 URL

1. 在 Telegram 搜尋 **@BotFather**
2. 發送 `/newbot` 建立 Bot
3. 複製 Bot Token
4. 在設定向導中貼上 Token

[詳細教學 →](setup-telegram.md)

### 選項 2: LINE

**優點**: 台灣/日本用戶熟悉

1. 前往 [LINE Developers](https://developers.line.biz/)
2. 建立 Messaging API Channel
3. 取得 Channel Access Token 和 Channel Secret
4. 設定 Webhook URL

[詳細教學 →](setup-line.md)

### 選項 3: Discord

**優點**: 適合團隊協作

1. 前往 [Discord Developer Portal](https://discord.com/developers/applications)
2. 建立 Application 和 Bot
3. 邀請 Bot 到伺服器
4. 取得 Bot Token

[詳細教學 →](setup-discord.md)

## 🔧 VS Code 設定

### 安裝 VSMONSTER 擴展

目前擴展尚未發布到市集，請按照以下步驟手動安裝:

1. 建置擴展:
   ```bash
   pnpm extension:build
   ```

2. 在 VS Code 中:
   - 按 `Cmd+Shift+P` (Mac) 或 `Ctrl+Shift+P` (Windows/Linux)
   - 輸入 "Install from VSIX"
   - 選擇 `packages/vscode-extension/vsmonster-*.vsix`

### 連接 Gateway

1. 確保 Gateway 正在運行 (`pnpm dev`)
2. 在 VS Code 按 `Cmd+Shift+P`
3. 執行 "VSMONSTER: Connect"
4. 狀態列會顯示 ✅ 已連接

## 💬 開始使用

### 基本指令

在你選擇的社群平台發送訊息給 Bot:

| 指令 | 說明 | 範例 |
|------|------|------|
| `/task` | 建立任務 | `/task 建立登入頁面` |
| `/status` | 查看狀態 | `/status` |
| `/model` | 切換模型 | `/model gpt-4` |
| `/preview` | 預覽連結 | `/preview` |
| `/help` | 顯示說明 | `/help` |

### 範例使用

```
你: /task 幫我建立一個 React Todo 應用

Bot: 📋 任務已建立 #task-001
     正在分析需求...

Bot: 📝 任務已拆分為 5 個子任務:
     1. 初始化 React 專案
     2. 建立 Todo 組件
     3. 實作新增/刪除功能
     4. 添加樣式
     5. 測試功能

Bot: 🔄 [1/5] 正在初始化專案...

Bot: ✅ [1/5] 專案初始化完成
     🔄 [2/5] 正在建立 Todo 組件...

... (持續更新進度)

Bot: 🎉 任務完成！
     📁 檔案: src/components/Todo.tsx
     🔗 預覽: https://xxx.ngrok.io
```

## 🔐 安全建議

1. **保護你的 Token**: 不要分享或上傳到公開儲存庫
2. **使用環境變數**: 將敏感資訊放在 `.env` 檔案
3. **限制權限**: 只授予 Bot 必要的權限
4. **本地運行**: Gateway 在你的電腦上運行，資料不會外洩

## 🛠️ 常見問題

### Gateway 無法啟動

```bash
# 檢查配置
cd packages/gateway
pnpm exec ts-node bin/cli.ts doctor
```

### VS Code 無法連接

1. 確認 Gateway 正在運行
2. 檢查 Gateway URL 設定 (預設 `ws://localhost:3000`)
3. 查看 VS Code 輸出面板的錯誤訊息

### Bot 沒有回應

1. 確認頻道配置正確
2. 檢查 Webhook URL (LINE) 或 Token (Telegram/Discord)
3. 查看 Gateway 終端機的日誌

## 📚 進階主題

- [MCP 服務器整合](mcp-usage.md)
- [自訂頻道適配器](custom-channel.md)
- [Docker 部署](docker-deploy.md)
- [API 參考](api-reference.md)

## 🆘 需要幫助？

- 📖 [完整文件](https://github.com/your-username/VSMONSTER/docs)
- 🐛 [問題回報](https://github.com/your-username/VSMONSTER/issues)
- 💬 [討論區](https://github.com/your-username/VSMONSTER/discussions)

---

🎉 恭喜！你已經完成 VSMONSTER 的基本設定。

現在就試試透過手機發送指令給 VS Code Copilot 吧！
