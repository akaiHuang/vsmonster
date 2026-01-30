# 👾 VSMONSTER

> 把 LINE / Telegram / Discord 的訊息帶進 VS Code Copilot 的本地橋接平台

**Version**: 0.2.0 | [CHANGELOG](CHANGELOG.md)

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

---

## 🚀 快速開始

### Step 1️⃣ 安裝 VS Code 與設定 GitHub Copilot

#### 下載 VS Code

前往 [code.visualstudio.com](https://code.visualstudio.com/) 下載並安裝。

#### 設定 GitHub Copilot

在 VS Code 中安裝 **GitHub Copilot** 擴充功能：
1. 開啟 Extensions（`Cmd+Shift+X` / `Ctrl+Shift+X`）
2. 搜尋 "GitHub Copilot"
3. 點擊 Install

#### 💰 免費 vs 付費方案

| 方案 | 價格 | 模型 | 適合對象 |
|------|------|------|----------|
| **Free** | $0 | GPT-4o mini, Claude 3.5 Sonnet | 學生、輕度使用者 |
| **Pro** | $10/月 | GPT-4o, Claude 3.5 Sonnet | 一般開發者 |
| **Pro+** | $39/月 | **Claude Opus 4.5**, **GPT-5.2 Codex** | 專業開發者 ⭐ |
| **Business** | $19/用戶/月 | 同 Pro，含管理功能 | 團隊 |

> 💡 **作者推薦**：我個人使用 **$39 Pro+** 方案，因為 **Claude Opus 4.5** 和 **GPT-5.2 Codex** 是目前最能勝任複雜編程任務的模型組合。在處理大型專案重構、跨文件修改、架構設計時，這兩個模型的表現遠超其他選項。

---

### Step 2️⃣ 安裝 VSMONSTER VS Code 擴充功能

目前擴展尚未發布到 Marketplace，請手動安裝：

```bash
# 先完成 Step 3 的安裝，再執行此指令
pnpm extension:build
```

在 VS Code 中：
1. `Cmd+Shift+P` / `Ctrl+Shift+P`
2. 選擇 **Install from VSIX**
3. 選取 `packages/vscode-extension/vsmonster-*.vsix`

---

### Step 3️⃣ 安裝 VSMONSTER Gateway

```bash
# 1. 複製專案
git clone https://github.com/akaiHuang/vsmonster.git
cd vsmonster

# 2. 安裝依賴
pnpm install

# 3. 複製環境變數範本
cp .env.example .env

# 4. 啟動 Gateway
pnpm dev
```

啟動後可驗證狀態：
```
http://localhost:3000/health
```

---

### Step 4️⃣ 設定社群平台（擇一）

> ⚠️ **安全警告**：以下取得的 Token 是高度敏感資料，請：
> - ❌ **絕對不要**分享給任何人
> - ❌ **絕對不要**上傳到 GitHub
> - ❌ **絕對不要**截圖傳到群組
> - ✅ 只存放在本機的 `.env` 檔案中

#### 選擇你的平台：

| 平台 | 難易度 | 適合對象 | 設定教學 |
|------|--------|----------|----------|
| 💚 **LINE** | ⭐⭐ | 台灣/日本用戶 | [📖 docs/setup-line.md](docs/setup-line.md) |
| 🔵 **Telegram** | ⭐ | 最簡單，推薦新手 | [📖 docs/setup-telegram.md](docs/setup-telegram.md) |
| 🟣 **Discord** | ⭐⭐⭐ | 團隊協作 | [📖 docs/setup-discord.md](docs/setup-discord.md) |

#### 設定方式

1. 依照上方教學取得你的平台 Token
2. 編輯 `.env` 檔案，填入對應的 Token：

```bash
# 編輯環境變數
nano .env   # 或用你喜歡的編輯器
```

```env
# 💚 LINE（擇一填寫）
LINE_CHANNEL_ACCESS_TOKEN=你的_LINE_Token
LINE_CHANNEL_SECRET=你的_LINE_Secret

# 🔵 Telegram（擇一填寫）
TELEGRAM_BOT_TOKEN=你的_Telegram_Token

# 🟣 Discord（擇一填寫）
DISCORD_BOT_TOKEN=你的_Discord_Token
DISCORD_APPLICATION_ID=你的_Application_ID
```

3. 重新啟動 Gateway：
```bash
pnpm dev
```

---

## 📣 支援平台

| 平台 | 說明 | 設定指南 |
|------|------|----------|
| 💚 LINE | 適合台灣/日本用戶 | [docs/setup-line.md](docs/setup-line.md) |
| 🔵 Telegram | 設定最簡單 | [docs/setup-telegram.md](docs/setup-telegram.md) |
| 🟣 Discord | 團隊協作首選 | [docs/setup-discord.md](docs/setup-discord.md) |

---

## 🧠 工作原理

```
User → 社群平台 → Moltbot → VSMONSTER Gateway → VS Code Extension → Copilot Chat
   ↘ 任務更新 / 進度回報 / 預覽連結 ←───────────────────────────────────────────↗
```

VSMONSTER 將社群訊息轉成任務，交給 VS Code Copilot 執行，並回傳進度與結果到原平台。

---

## ⚙️ 環境變數設定

所有敏感設定都放在 `.env` 檔案中（已加入 `.gitignore`，不會上傳）。

### 快速設定

```bash
cp .env.example .env   # 複製範本
nano .env              # 編輯並填入你的 Token
```

### 環境變數說明

| 變數 | 說明 | 必填 |
|------|------|------|
| `VSMONSTER_PORT` | Gateway 埠號（預設 3000） | ❌ |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE Bot Token | LINE 用戶 |
| `LINE_CHANNEL_SECRET` | LINE Channel Secret | LINE 用戶 |
| `TELEGRAM_BOT_TOKEN` | Telegram Bot Token | Telegram 用戶 |
| `DISCORD_BOT_TOKEN` | Discord Bot Token | Discord 用戶 |
| `DISCORD_APPLICATION_ID` | Discord App ID | Discord 用戶 |
| `NGROK_AUTHTOKEN` | ngrok 認證 Token | ❌ 可選 |

> 💡 詳細範本請參考 [.env.example](.env.example)

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
