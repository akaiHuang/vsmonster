# VSMONSTER + Moltbot 整合指南

> 🦞 不重複造輪子！使用 Moltbot 處理社群軟體，VSMONSTER 專注於 VS Code Copilot 整合

## 架構概覽

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Moltbot (社群軟體連接)                            │
│  • LINE • Telegram • Discord • Slack • Signal • WhatsApp           │
│  • 成熟的插件系統、訊息處理、安全機制                                  │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │ WebSocket
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    VSMONSTER Gateway (橋接服務)                         │
│  • 接收 Moltbot 轉發的訊息                                           │
│  • 任務管理                                                         │
│  • VS Code Extension 通訊                                           │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │ WebSocket
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    VS Code Extension                                 │
│  • Copilot 整合                                                      │
│  • 終端機控制                                                        │
│  • 任務視圖                                                         │
└─────────────────────────────────────────────────────────────────────┘
```

## 為什麼使用 Moltbot？

| 功能 | 自己實作 | 使用 Moltbot |
|------|---------|-------------|
| LINE 連接 | 需要寫 400+ 行 | ✅ 內建 |
| Telegram 連接 | 需要寫 500+ 行 | ✅ 內建 |
| Discord 連接 | 需要寫 600+ 行 | ✅ 內建 |
| 訊息重試 | 需要自己實作 | ✅ 內建 |
| 速率限制 | 需要自己實作 | ✅ 內建 |
| 群組管理 | 需要自己實作 | ✅ 內建 |
| 安全機制 | 需要自己實作 | ✅ 內建 (DM pairing) |
| Webhook 處理 | 需要自己實作 | ✅ 內建 |
| 指令系統 | 需要自己實作 | ✅ 內建 (50+ 指令) |
| 維護更新 | 自己維護 | ✅ 社群維護 (300+ contributors) |

## 快速開始

### 1. 安裝 Moltbot

```bash
# 安裝 moltbot
npm install -g moltbot@latest

# 執行設定向導（設定 LINE/Telegram/Discord 等）
moltbot onboard --install-daemon

# 啟動 Moltbot Gateway（背景執行）
moltbot gateway --port 18789
```

### 2. 安裝 VSMONSTER

```bash
cd VSMONSTER
pnpm install
pnpm dev
```

### 3. 安裝 VS Code Extension

在 VS Code 中開啟 VSMONSTER 專案的 `packages/vscode-extension`，按 F5 啟動調試。

## 設定檔

### Moltbot 設定 (`~/.clawdbot/moltbot.json`)

```json
{
  "channels": {
    "telegram": {
      "botToken": "YOUR_TELEGRAM_BOT_TOKEN"
    },
    "discord": {
      "token": "YOUR_DISCORD_BOT_TOKEN"
    },
    "line": {
      "channelAccessToken": "YOUR_LINE_TOKEN",
      "channelSecret": "YOUR_LINE_SECRET"
    }
  }
}
```

詳細設定請參考 [Moltbot 文件](https://docs.molt.bot/)。

### VSMONSTER 設定 (`configs/config.json`)

```json
{
  "moltbotGatewayUrl": "ws://127.0.0.1:18789",
  "port": 3000,
  "mcp": {
    "servers": []
  }
}
```

## API 使用

### 從 VSMONSTER 發送訊息

```typescript
import MoltbotClient from './moltbot-integration';

// 方法 1: 透過 WebSocket（持續連接）
const client = new MoltbotClient('ws://127.0.0.1:18789');
await client.connect();

client.on('message', async (msg) => {
  console.log(`收到訊息: ${msg.body}`);
  
  // 回覆
  await client.sendReply({
    text: 'Hello from VSMONSTER!',
    channel: msg.channel,
    to: msg.from,
    sessionKey: msg.sessionKey
  });
});

// 方法 2: 透過 CLI（一次性）
await MoltbotClient.sendViaCLI('telegram', '@user123', 'Hello!');
```

## Moltbot 內建指令

在社群軟體中可以直接使用 Moltbot 的指令：

| 指令 | 說明 |
|------|------|
| `/status` | 查看狀態 |
| `/new` | 重置 session |
| `/model <name>` | 切換 AI 模型 |
| `/think <level>` | 設定思考層級 |
| `/help` | 顯示幫助 |

完整指令列表請參考 [Moltbot Commands](https://docs.molt.bot/start/getting-started#chat-commands)。

## 常見問題

### Q: Moltbot Gateway 沒有啟動？

```bash
# 檢查 Moltbot 狀態
moltbot doctor

# 手動啟動 Gateway
moltbot gateway --verbose
```

### Q: 無法連接到社群軟體？

1. 確認 `~/.clawdbot/moltbot.json` 設定正確
2. 執行 `moltbot onboard` 重新設定
3. 查看日誌: `moltbot gateway --verbose`

### Q: VSMONSTER 和 Moltbot 的分工？

- **Moltbot**: 處理所有社群軟體連接、訊息收發、安全機制
- **VSMONSTER**: 專注於 VS Code Copilot 整合、任務管理、開發者體驗

## 參考資料

- [Moltbot GitHub](https://github.com/moltbot/moltbot)
- [Moltbot 文件](https://docs.molt.bot/)
- [Moltbot Gateway Protocol](https://docs.molt.bot/concepts/architecture)
