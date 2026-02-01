# VSMONSTER

> 將 LINE、Telegram、Discord 的訊息帶進 VS Code！

![Version](https://img.shields.io/badge/version-0.0.2-blue)
![VS Code](https://img.shields.io/badge/VS%20Code-1.85+-green)

## ✨ 功能特色

- **🔗 社群連接**：LINE / Telegram / Discord 訊息即時同步
- **🤖 AI 整合**：社群訊息自動轉為開發任務
- **📋 任務追蹤**：視覺化任務列表與進度
- **🔌 MCP 支援**：擴充 AI 能力（Email、Browser、File 等）
- **🏠 本地運行**：資料不離開你的電腦

## 🚀 快速開始

### 1. 安裝擴充功能

**Marketplace（最簡單）**
- 在 VS Code Extensions 搜尋「VSMONSTER」並安裝

**VSIX（不透過 Marketplace）**
- GitHub Releases: https://github.com/akaiHuang/vsmonster/releases/latest
- VS Code：Extensions → `...` → Install from VSIX...
- CLI：`code --install-extension /path/to/vsmonster-*.vsix`

Windows 一行安裝（PowerShell）：
```powershell
powershell -ExecutionPolicy Bypass -File scripts/install-extension.ps1
```

macOS/Linux 一行安裝（從原始碼打包）：
```bash
bash scripts/install-extension.sh
```

---

### 2. 安裝 VSMONSTER Gateway

```bash
git clone https://github.com/akaiHuang/vsmonster.git
cd vsmonster
pnpm install
```

### 3. 設定社群平台

編輯 `.env` 檔案，填入你的 Bot Token：

```env
# 選擇一個平台
TELEGRAM_BOT_TOKEN=your_token
# 或
LINE_CHANNEL_ACCESS_TOKEN=your_token
# 或
DISCORD_BOT_TOKEN=your_token
```

### 4. 啟動 Gateway

```bash
pnpm dev
```

### 5. 連接擴充功能

擴充功能會自動連接到 `ws://localhost:3000`。

## 📱 支援平台

| 平台 | 狀態 | 說明 |
|------|------|------|
| 💚 LINE | ✅ | 適合台灣/日本用戶 |
| 🔵 Telegram | ✅ | 最簡單，推薦新手 |
| 🟣 Discord | ✅ | 團隊協作首選 |

## ⚙️ 設定

| 設定項 | 預設值 | 說明 |
|--------|--------|------|
| `vsmonster.gatewayUrl` | `ws://localhost:3000` | Gateway WebSocket URL |
| `vsmonster.autoConnect` | `true` | 自動連接 Gateway |
| `vsmonster.showNotifications` | `true` | 顯示任務通知 |
| `vsmonster.defaultModel` | `gpt-4` | 預設 AI 模型 |

## 🎮 命令

開啟命令面板（`Cmd+Shift+P` / `Ctrl+Shift+P`），輸入 "VSMONSTER"：

| 命令 | 說明 |
|------|------|
| VSMONSTER: 連接 Gateway | 手動連接 Gateway |
| VSMONSTER: 斷開連接 | 斷開 Gateway 連接 |
| VSMONSTER: 顯示狀態 | 顯示連接狀態 |
| VSMONSTER: 啟動 Gateway | 在終端機啟動 Gateway |
| VSMONSTER: 執行設定向導 | 互動式設定 |

## 🔒 安全與隱私

- ✅ **本地優先**：所有資料都在你的電腦上處理
- ✅ **Token 安全**：敏感資訊只存在本機 `.env`
- ✅ **開源透明**：完整程式碼可審查

## 📚 更多資訊

- [GitHub Repository](https://github.com/akaiHuang/vsmonster)
- [完整文檔](https://github.com/akaiHuang/vsmonster/tree/main/docs)
- [問題回報](https://github.com/akaiHuang/vsmonster/issues)

## 📝 License

MIT

---

**VSMONSTER** + **Moltbot** = ❤️
