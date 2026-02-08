# VSMONSTER vs Moltbot 功能差異分析

> 本文件分析 VSMONSTER 專案與 [Moltbot](https://github.com/moltbot/moltbot) 的關係，釐清哪些功能依賴 Moltbot，哪些是 VSMONSTER 原創。

## 📊 總覽

```
┌─────────────────────────────────────────────────────────────────┐
│                         使用者                                   │
│              (LINE / Telegram / Discord / ...)                  │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                   🦞 Moltbot (依賴)                              │
│                                                                  │
│  • 社群軟體連接 (10+ 平台)                                        │
│  • 訊息收發處理                                                   │
│  • DM Pairing 安全機制                                           │
│  • 速率限制 / 訊息重試                                            │
│  • Webhook 管理                                                  │
│                                                                  │
│                    ws://127.0.0.1:18789                         │
└───────────────────────────┬─────────────────────────────────────┘
                            │ WebSocket
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                   👾 VSMONSTER (原創)                            │
│                                                                  │
│  • Gateway 橋接服務                                              │
│  • 任務管理與智能拆分                                             │
│  • VS Code Extension                                            │
│  • Copilot 整合                                                  │
│  • MCP 服務器控制                                                │
│  • 進度回報系統                                                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🦞 依賴 Moltbot 的功能

以下功能**完全由 Moltbot 提供**，VSMONSTER 僅作為消費者使用：

### 1. 社群軟體連接

| 平台 | SDK/技術 | 由 Moltbot 處理 |
|------|---------|----------------|
| LINE | @line/bot-sdk | ✅ |
| Telegram | grammY | ✅ |
| Discord | discord.js | ✅ |
| Slack | Bolt | ✅ |
| WhatsApp | Baileys | ✅ |
| Signal | signal-cli | ✅ |
| iMessage | imsg (macOS) | ✅ |
| Microsoft Teams | Bot Framework | ✅ |
| Google Chat | Chat API | ✅ |
| Matrix | Extension | ✅ |

**VSMONSTER 程式碼位置**：
- `packages/gateway/src/moltbot-integration.ts` - 連接 Moltbot Gateway 的 WebSocket 客戶端

### 2. 訊息處理基礎設施

| 功能 | 說明 | 提供者 |
|------|------|-------|
| 訊息接收 | 從各平台接收訊息 | 🦞 Moltbot |
| 訊息發送 | 發送訊息到各平台 | 🦞 Moltbot |
| 訊息重試 | 失敗自動重試機制 | 🦞 Moltbot |
| 速率限制 | 避免 API 限流 | 🦞 Moltbot |
| 媒體處理 | 圖片/影片/檔案上傳 | 🦞 Moltbot |
| 群組管理 | 群組訊息路由 | 🦞 Moltbot |

### 3. 安全機制

| 功能 | 說明 | 提供者 |
|------|------|-------|
| DM Pairing | 陌生人需配對碼才能使用 | 🦞 Moltbot |
| Allowlist | 允許清單控制 | 🦞 Moltbot |
| Token 管理 | 各平台 API Token 管理 | 🦞 Moltbot |

### 4. Webhook 處理

| 功能 | 說明 | 提供者 |
|------|------|-------|
| Webhook 接收 | HTTP Webhook 端點 | 🦞 Moltbot |
| 簽名驗證 | LINE/Telegram 等簽名驗證 | 🦞 Moltbot |
| SSL/TLS | HTTPS 處理 | 🦞 Moltbot |

---

## ![VSMONSTER](../../packages/blue-monster/resources/blueMonster.svg) VSMONSTER 原創功能

以下功能是 **VSMONSTER 獨立開發**，不依賴 Moltbot：

### 1. Gateway 橋接服務

**程式碼位置**：`packages/gateway/src/server.ts`

```typescript
// VSMONSTER 原創：Express + WebSocket 服務器
export class VSMONSTERGateway {
  private channelManager: ChannelManager;
  private taskManager: TaskManager;        // 原創
  private tunnelService: TunnelService;
  private copilotBridge: CopilotBridge;    // 原創
  private mcpController: MCPController;    // 原創
}
```

| 功能 | 說明 | 檔案 |
|------|------|-----|
| HTTP API | RESTful API 端點 | `server.ts` |
| WebSocket Server | 與 VS Code Extension 通訊 | `server.ts` |
| 路由處理 | `/health`, `/tasks`, `/channels` 等 | `server.ts` |

### 2. 任務管理系統

**程式碼位置**：`packages/gateway/src/task/manager.ts`

這是 VSMONSTER 的**核心原創功能**：

```typescript
// VSMONSTER 原創：智能任務拆分
export class TaskManager {
  // 分析指令並自動拆分成子任務
  private analyzeAndSplitTask(task: Task): void {
    // 專案類任務 → 5 個子任務
    // UI 組件任務 → 5 個子任務
    // API 類任務 → 5 個子任務
    // Bug 修復任務 → 4 個子任務
  }
}
```

| 功能 | 說明 |
|------|------|
| 任務建立 | `createTask()` |
| 智能拆分 | 根據關鍵字自動拆解任務 |
| 進度追蹤 | 子任務狀態管理 |
| 用戶任務關聯 | 追蹤每個用戶的任務 |
| 事件發射 | `task:created`, `task:updated` 等 |

### 3. VS Code Extension

**程式碼位置**：`packages/vscode-extension/src/`

| 檔案 | 功能 |
|------|------|
| `extension.ts` | 擴展入口、命令註冊、首次啟動引導 |
| `gateway-client.ts` | 連接 VSMONSTER Gateway |
| `copilot-bridge.ts` | **核心：與 Copilot 整合** |
| `task-view.ts` | 任務視圖面板 |
| `terminal-manager.ts` | 終端機控制 |

### 4. Copilot 整合

**程式碼位置**：`packages/vscode-extension/src/copilot-bridge.ts`

這是 VSMONSTER 最重要的**原創功能**：

```typescript
// VSMONSTER 原創：將訊息轉換為 Copilot 指令
export class CopilotBridge {
  async executeSubtask(subtask: SubTask, fullInstruction: string) {
    // 1. 構建 Copilot 提示詞
    // 2. 使用 VS Code Language Model API
    // 3. 發送到 Copilot Chat
  }

  private async sendToCopilotChat(prompt: string) {
    // 使用 vscode.lm.selectChatModels() API
    const chatModels = await vscode.lm.selectChatModels({
      vendor: 'copilot',
      family: 'gpt-4'
    });
  }
}
```

### 5. MCP 服務器控制

**程式碼位置**：`packages/gateway/src/mcp/controller.ts`

| 功能 | 說明 |
|------|------|
| MCP 服務器管理 | 啟動/停止 MCP 服務器 |
| 工具調用 | 調用 MCP 提供的工具 |
| 瀏覽器控制 | @mcp/puppeteer |
| 檔案系統 | @mcp/filesystem |

### 6. ngrok 隧道服務

**程式碼位置**：`packages/gateway/src/tunnel/service.ts`

| 功能 | 說明 |
|------|------|
| 自動隧道 | 自動建立 ngrok 隧道 |
| URL 提供 | 提供外部可訪問的 URL |

### 7. 設定向導

**程式碼位置**：`packages/gateway/src/setup/wizard.ts`

| 功能 | 說明 |
|------|------|
| 互動式設定 | 引導用戶完成設定 |
| 自動檢測 | 檢測 VS Code、Copilot 等 |
| 配置生成 | 自動生成配置檔 |

### 8. 共享類型定義

**程式碼位置**：`packages/shared/types/`

| 檔案 | 定義 |
|------|------|
| `message.ts` | `IncomingMessage`, `MediaItem`, `LocationData` |
| `task.ts` | `Task`, `SubTask`, `TaskStatus` |
| `channel.ts` | `ChannelConfig`, `ChannelType` |

---

## 📁 程式碼歸屬分析

### 按檔案分類

| 目錄/檔案 | 歸屬 | 說明 |
|----------|------|------|
| `packages/gateway/src/moltbot-integration.ts` | 🦞 依賴 | Moltbot WebSocket 客戶端 |
| `packages/gateway/src/server.ts` | ![VSMONSTER](../../packages/blue-monster/resources/blueMonster.svg) 原創 | Gateway 服務器 |
| `packages/gateway/src/task/` | ![VSMONSTER](../../packages/blue-monster/resources/blueMonster.svg) 原創 | 任務管理 |
| `packages/gateway/src/copilot/` | ![VSMONSTER](../../packages/blue-monster/resources/blueMonster.svg) 原創 | Copilot 橋接 (Gateway 端) |
| `packages/gateway/src/mcp/` | ![VSMONSTER](../../packages/blue-monster/resources/blueMonster.svg) 原創 | MCP 控制器 |
| `packages/gateway/src/tunnel/` | ![VSMONSTER](../../packages/blue-monster/resources/blueMonster.svg) 原創 | ngrok 隧道 |
| `packages/gateway/src/setup/` | ![VSMONSTER](../../packages/blue-monster/resources/blueMonster.svg) 原創 | 設定向導 |
| `packages/gateway/src/channels/` | 🔀 混合 | 頻道抽象層 (使用 Moltbot 但有原創抽象) |
| `packages/blue-monster/` | ![VSMONSTER](../../packages/blue-monster/resources/blueMonster.svg) 原創 | VS Code Extension |
| `packages/shared/` | ![VSMONSTER](../../packages/blue-monster/resources/blueMonster.svg) 原創 | 類型定義 |
| `configs/` | ![VSMONSTER](../../packages/blue-monster/resources/blueMonster.svg) 原創 | 配置格式 |
| `docs/` | 👾 原創 | 文件 |
| `scripts/` | 👾 原創 | 腳本 |

### 按功能分類

```
100% 依賴 Moltbot:
├── LINE 連接
├── Telegram 連接
├── Discord 連接
├── WhatsApp 連接
├── Slack 連接
├── Signal 連接
├── 訊息重試機制
├── 速率限制
└── DM Pairing 安全機制

100% VSMONSTER 原創:
├── Gateway 服務架構
├── 任務管理與智能拆分
├── VS Code Extension
├── Copilot 整合 (核心價值)
├── MCP 服務器控制
├── 任務視圖面板
├── 終端機控制
├── ngrok 隧道管理
├── 設定向導
└── 進度回報系統

混合 (使用 Moltbot API 但有原創邏輯):
├── 頻道管理器 (抽象層)
└── 訊息格式轉換
```

---

## 🎯 核心價值定位

### Moltbot 解決的問題

> 「如何連接 10+ 個社群軟體平台？」

Moltbot 是一個**成熟的開源專案** (102k+ stars, 334 contributors)，提供：
- 穩定的社群軟體 SDK 封裝
- 完善的錯誤處理和重試機制
- 安全機制 (DM Pairing, Allowlist)
- 活躍的社群維護

### VSMONSTER 解決的問題

> 「如何讓社群軟體訊息驅動 VS Code Copilot 執行編程任務？」

VSMONSTER 專注於**開發者體驗**：
- 將自然語言指令轉換為結構化任務
- 智能拆分大任務為可執行的子任務
- 與 VS Code Copilot 深度整合
- 即時進度回報到社群軟體
- MCP 服務器擴展能力

---

## 📈 程式碼量估算

| 部分 | 預估行數 | 歸屬 |
|------|---------|------|
| Moltbot 核心 | ~50,000+ | 🦞 Moltbot |
| Gateway 服務 | ~1,500 | 👾 原創 |
| VS Code Extension | ~1,200 | 👾 原創 |
| 任務管理 | ~400 | 👾 原創 |
| Moltbot 整合層 | ~300 | 🔀 混合 |
| 共享類型 | ~200 | 👾 原創 |
| 配置/腳本 | ~300 | 👾 原創 |

**VSMONSTER 原創程式碼約 3,600+ 行**

---

## 🔗 依賴關係圖

```
┌──────────────────────────────────────────────────────────────┐
│                    npm install -g moltbot                    │
│                                                              │
│  moltbot onboard          moltbot gateway --port 18789       │
│  (設定平台)                (啟動 Gateway)                     │
└──────────────────────────────────────────────────────────────┘
                               │
                               │ WebSocket (ws://127.0.0.1:18789)
                               ▼
┌──────────────────────────────────────────────────────────────┐
│                    pnpm dev (VSMONSTER)                      │
│                                                              │
│  packages/gateway/                                           │
│  ├── moltbot-integration.ts  ← 連接 Moltbot                  │
│  ├── server.ts               ← HTTP + WebSocket 服務         │
│  └── task/manager.ts         ← 任務管理                      │
└──────────────────────────────────────────────────────────────┘
                               │
                               │ WebSocket (ws://localhost:3000)
                               ▼
┌──────────────────────────────────────────────────────────────┐
│                VS Code + VSMONSTER Extension                 │
│                                                              │
│  packages/vscode-extension/                                  │
│  ├── extension.ts           ← 擴展入口                       │
│  ├── gateway-client.ts      ← 連接 VSMONSTER Gateway         │
│  └── copilot-bridge.ts      ← 驅動 Copilot                   │
└──────────────────────────────────────────────────────────────┘
```

---

## ✅ 結論

| 類別 | 比例 | 說明 |
|------|------|------|
| 🦞 依賴 Moltbot | ~30% | 社群軟體連接基礎設施 |
| 👾 VSMONSTER 原創 | ~70% | VS Code Copilot 整合、任務管理、擴展 |

**VSMONSTER 的核心價值在於：**

1. **橋接層設計** - 將 Moltbot 的訊息轉換為 Copilot 可執行的任務
2. **智能任務拆分** - 自動將大任務分解為子任務
3. **Copilot 深度整合** - 使用 VS Code Language Model API
4. **開發者體驗** - 設定向導、任務視圖、進度追蹤

這是一個典型的「站在巨人肩膀上」的設計：
- **Moltbot** 處理複雜的社群軟體整合（這是它的專長）
- **VSMONSTER** 專注於 VS Code Copilot 整合（這是它的獨特價值）

---

*文件建立時間：2026-01-30*
*VSMONSTER 版本：0.1.0*
