# 👾 VSMONSTER

> 把 LINE / Telegram / Discord 的訊息帶進 VS Code Copilot 的本地橋接平台

**Version**: 0.0.1 (Preview)

VSMONSTER 讓你在社群軟體中下指令、追蹤任務進度，所有執行都在你的 VS Code 本機環境完成。
專案以 🦞 Moltbot 作為社群連接層，VSMONSTER 專注於 Copilot 與任務流程。

---

## ✨ 核心特色

- **Local-first**：Gateway 與任務執行都在本機，資料不離開你的電腦
- **多平台整合**：LINE / Telegram / Discord 三選一，統一指令介面
- **VS Code 視覺化**：任務列表、頻道狀態、MCP 服務一目了然
- **任務分解與回報**：支援 `/task` 指令、任務拆分與進度回報
- **MCP 擴充**：可選的 MCP 服務整合（Email / Browser / File 等）
- **隧道支援**：可用 ngrok 產生公開預覽連結

## 📣 支援平台

| 平台 | 說明 | 設定指南 |
|------|------|----------|
| LINE | 適合台灣/日本用戶 | `docs/setup-line.md` |
| Telegram | 設定最簡單 | `docs/setup-telegram.md` |
| Discord | 團隊協作首選 | `docs/setup-discord.md` |

## 🧠 工作原理

```
User → 社群平台 → Moltbot → VSMONSTER Gateway → VS Code Extension → Copilot Chat
   ↘ 任務更新 / 進度回報 / 預覽連結 ←───────────────────────────────────────────↗
```

VSMONSTER 將社群訊息轉成任務，交給 VS Code Copilot 執行，並回傳進度與結果到原平台。

---

## 🚀 快速開始（本地開發）

### 1) 複製專案與安裝依賴

```bash
git clone https://github.com/your-username/vsmonster.git
cd vsmonster
pnpm install
```

### 2) 設定社群平台

- **推薦方式**：使用 Moltbot 設定向導
  ```bash
  moltbot onboard
  ```

- **或手動建立設定檔**：放在 `configs/config.json`

### 3) 啟動 Gateway

```bash
pnpm dev
```

啟動後可用以下 API 驗證狀態：

```
http://localhost:3000/health
```

### 4) 安裝 VS Code Extension

目前擴展尚未發布到 Marketplace，請手動安裝：

```bash
pnpm extension:build
```

在 VS Code 中：
1. `Cmd+Shift+P` / `Ctrl+Shift+P`
2. 選擇 **Install from VSIX**
3. 選取 `packages/vscode-extension/vsmonster-*.vsix`

---

## ⚙️ 設定檔與環境變數

VSMONSTER 會依序搜尋以下位置：

1. `configs/config.json`
2. `./config.json`
3. `~/.vsmonster/config.json`

### 範例設定檔

```json
{
  "port": 3000,
  "channels": {
    "telegram": {
      "botToken": "YOUR_BOT_TOKEN"
    }
  },
  "tunnel": {
    "enabled": false,
    "authtoken": "YOUR_NGROK_TOKEN",
    "region": "ap"
  }
}
```

### 環境變數

- `VSMONSTER_PORT`
- `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_CHANNEL_SECRET`
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_URL`
- `DISCORD_BOT_TOKEN`, `DISCORD_APPLICATION_ID`, `DISCORD_PUBLIC_KEY`
- `NGROK_AUTHTOKEN`, `NGROK_ENABLED`, `NGROK_REGION`

---

## 💬 社群指令

VSMONSTER 支援指令與自然語句：

| 指令 | 說明 | 範例 |
|------|------|------|
| `/task` | 建立任務 | `/task 建立登入頁面` |
| `/status` | 查看任務狀態 | `/status` 或 `/status task-001` |
| `/model` | 切換模型 | `/model gpt-4` |
| `/preview` | 取得預覽連結 | `/preview` |
| `/cancel` | 取消任務 | `/cancel task-001` |
| `/help` | 顯示指令說明 | `/help` |
| `/mcp` | 觸發 MCP 服務 | `/mcp email send ...` |

> 非指令訊息會被視為新任務，直接交給 Copilot 處理。

---

## 🧩 VS Code Extension 功能

- Gateway 連線狀態顯示
- 任務列表與進度
- 頻道狀態檢視
- MCP 服務管理

VS Code 設定：

- `vsmonster.gatewayUrl`（預設：`ws://localhost:3000`）
- `vsmonster.autoConnect`
- `vsmonster.showNotifications`
- `vsmonster.defaultModel`

---

## 📚 文件

- 快速開始：`docs/quick-start.md`
- 平台設定：`docs/setup-line.md` / `docs/setup-telegram.md` / `docs/setup-discord.md`
- Moltbot 整合：`docs/moltbot-integration.md`
- 企業應用案例：`docs/enterprise-use-cases.md`（Apple 案例）
- 多品牌節流案例：`docs/enterprise-cases-brands.md`（效率提升、成本降低）
- 多品牌開源案例：`docs/enterprise-cases-revenue.md`（營收增長、新商業模式）
- **🛠️ 實作指南**：`docs/enterprise-implementation-guide.md`（詳細設定與程式碼）
- VSMONSTER vs Moltbot：`docs/vsmonster-vs-moltbot-analysis.md`

---

## 🤝 VSMONSTER × Moltbot

VSMONSTER 專注於 **VS Code + Copilot + 任務流程**，
社群平台連接能力由 **🦞 Moltbot** 提供支援。

如果你要深入了解 Moltbot 或自行擴充頻道連接器，請參考：
`docs/moltbot-integration.md`

---

## 🔐 安全與隱私

- 全程本地執行，不依賴雲端
- Token 不上傳，僅保留在本機設定檔或環境變數中
- 可透過權限與指令規範限制可用功能

---

## 📝 License

MIT

---

## 🦞 致謝

特別感謝 Moltbot 的開源貢獻，
讓 VSMONSTER 能專注於 VS Code Copilot 整合與任務流程。

```
👾 VSMONSTER + 🦞 Moltbot = ❤️
```
