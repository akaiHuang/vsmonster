# vsMolt - VS Code Copilot 社群整合平台

> 將 LINE、Telegram、Discord 等社群軟體直接串接到 VS Code Copilot，讓你隨時隨地透過手機指揮 AI 編程

## 🎯 專案願景

**痛點**: moltbot 功能強大但設定繁瑣，權限和接口太多
**解決方案**: 專注於 VS Code Copilot 整合，簡化配置，一鍵部署

## 🏗️ 系統架構

```
┌─────────────────────────────────────────────────────────────────────┐
│                         社群軟體層 (Channels)                        │
├───────────┬───────────┬───────────┬───────────┬───────────────────┤
│   LINE    │ Telegram  │  Discord  │  Slack    │    WeChat等       │
└─────┬─────┴─────┬─────┴─────┬─────┴─────┬─────┴─────────┬─────────┘
      │           │           │           │               │
      └───────────┴───────────┴───────────┴───────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      vsMolt Gateway (Node.js)                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌────────────┐ │
│  │   Webhook   │  │   Message   │  │    Task     │  │   Tunnel   │ │
│  │   Handler   │  │   Router    │  │   Manager   │  │  (ngrok)   │ │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬─────┘ │
│         └────────────────┼────────────────┼────────────────┘       │
│                          ▼                ▼                         │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                   VS Code Extension API                      │   │
│  │  • Copilot Chat Integration                                  │   │
│  │  • Terminal Control                                          │   │
│  │  • File System Access                                        │   │
│  │  • MCP Server Management                                     │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      VS Code Workspace                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌────────────┐ │
│  │   Copilot   │  │   Terminal  │  │    MCP      │  │   Tasks    │ │
│  │    Chat     │  │   Manager   │  │   Servers   │  │   Output   │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

## 📁 專案結構

```
vsMolt/
├── packages/
│   ├── gateway/                    # 核心 Gateway 服務
│   │   ├── src/
│   │   │   ├── server.ts          # Express + WebSocket 服務器
│   │   │   ├── channels/          # 社群頻道適配器
│   │   │   │   ├── line/          # LINE Messaging API
│   │   │   │   ├── telegram/      # Telegram Bot API
│   │   │   │   ├── discord/       # Discord Bot
│   │   │   │   └── base.ts        # 基礎頻道接口
│   │   │   ├── task/              # 任務管理
│   │   │   │   ├── manager.ts     # 任務拆分與調度
│   │   │   │   ├── progress.ts    # 進度追蹤
│   │   │   │   └── types.ts       # 任務類型定義
│   │   │   ├── tunnel/            # ngrok 隧道管理
│   │   │   ├── copilot/           # Copilot 指令橋接
│   │   │   └── mcp/               # MCP 服務器控制
│   │   ├── config/                # 配置文件
│   │   └── package.json
│   │
│   ├── vscode-extension/          # VS Code 擴展
│   │   ├── src/
│   │   │   ├── extension.ts       # 擴展入口
│   │   │   ├── gateway-client.ts  # Gateway 客戶端
│   │   │   ├── copilot-bridge.ts  # Copilot 橋接
│   │   │   ├── terminal-manager.ts# 終端管理
│   │   │   └── task-view.ts       # 任務視圖
│   │   └── package.json
│   │
│   └── shared/                    # 共享類型和工具
│       ├── types/
│       │   ├── message.ts         # 訊息類型
│       │   ├── task.ts            # 任務類型
│       │   └── channel.ts         # 頻道類型
│       └── utils/
│
├── configs/                       # 全局配置
│   ├── channels.json             # 頻道配置 (簡化版)
│   └── mcp-servers.json          # MCP 服務器配置
│
├── docs/                          # 文檔
│   ├── setup-line.md             # LINE 設定指南
│   ├── setup-telegram.md         # Telegram 設定指南
│   └── mcp-usage.md              # MCP 使用指南
│
├── docker-compose.yml            # Docker 部署
├── package.json                  # Monorepo 配置
└── README.md
```

## 🔧 核心功能

### 1. 簡化的頻道配置 (對比 moltbot)

```json
// vsMolt 簡化配置 (configs/channels.json)
{
  "activeChannel": "line",
  "channels": {
    "line": {
      "channelAccessToken": "YOUR_TOKEN",
      "channelSecret": "YOUR_SECRET"
    },
    "telegram": {
      "botToken": "YOUR_BOT_TOKEN"
    }
  }
}
```

### 2. 社群訊息 → Copilot 指令流程

```
用戶 (LINE): "幫我建立一個 React 專案，要有登入功能"
     ↓
[vsMolt Gateway]
     ↓ 解析指令
[Task Manager] 拆分任務:
  1. 建立 React 專案結構
  2. 安裝依賴 (react-router, axios)
  3. 建立登入頁面組件
  4. 建立 API 服務層
  5. 設定路由
     ↓
[VS Code Extension]
     ↓ 透過 Copilot API 執行
[Copilot Chat] 逐一完成任務
     ↓
[進度回報] → LINE 顯示進度
     ↓
[ngrok URL] → 提供預覽連結
```

### 3. MCP 服務器整合

```typescript
// 支援的 MCP 功能
const mcpCapabilities = {
  email: {
    name: "@mcp/email",
    actions: ["send", "receive", "search"]
  },
  browser: {
    name: "@mcp/puppeteer", 
    actions: ["navigate", "screenshot", "scrape"]
  },
  filesystem: {
    name: "@mcp/filesystem",
    actions: ["read", "write", "search"]
  },
  shopping: {
    name: "@mcp/shopping",
    actions: ["search", "compare", "checkout"]
  }
};
```

## 🚀 快速開始

### 1. 一鍵安裝

```bash
# 安裝 vsMolt
npm install -g vsmolt

# 初始化配置 (互動式)
vsmolt init

# 啟動 Gateway
vsmolt start
```

### 2. VS Code 擴展

在 VS Code 中搜尋並安裝 `vsMolt` 擴展

### 3. 連接社群軟體

```bash
# LINE 設定
vsmolt channel add line

# Telegram 設定
vsmolt channel add telegram
```

## 💬 使用方式

### LINE 指令範例

| 指令 | 說明 |
|------|------|
| `/task 建立登入頁面` | 建立新任務 |
| `/model claude-4` | 切換模型 |
| `/image [圖片]` | 上傳圖片讓 Copilot 分析 |
| `/mcp email send` | 使用 MCP 發送郵件 |
| `/status` | 查看當前任務狀態 |
| `/preview` | 獲取 ngrok 預覽連結 |

### 進階指令

```
/task 建立電商網站
├── 前端: React + TailwindCSS
├── 後端: Node.js + Express
├── 資料庫: PostgreSQL
└── 部署: Docker
```

系統會自動拆分為多個子任務並逐一執行

## 📊 任務狀態追蹤

```
📋 任務: 建立電商網站
├── ✅ [1/5] 初始化專案結構
├── ✅ [2/5] 設定前端框架
├── 🔄 [3/5] 建立商品列表頁面 (進行中...)
├── ⏳ [4/5] 建立購物車功能
└── ⏳ [5/5] 設定資料庫連接

預估完成時間: 15 分鐘
```

## 🔐 安全特性

- **本地運行**: Gateway 運行在你的電腦上
- **Token 加密**: 所有 API Token 本地加密存儲
- **權限控制**: 可設定允許的操作類型
- **審計日誌**: 所有操作都有記錄

## 🛠️ 技術棧

- **Gateway**: Node.js + TypeScript + Express + WebSocket
- **VS Code Extension**: VS Code Extension API
- **社群 SDK**: 
  - LINE: @line/bot-sdk
  - Telegram: grammy
  - Discord: discord.js
- **隧道**: ngrok
- **MCP**: Model Context Protocol

## 🤝 vs moltbot 對比

| 功能 | moltbot | vsMolt |
|------|---------|--------|
| 配置複雜度 | 高 (多層配置) | 低 (單一配置檔) |
| 安裝步驟 | 繁瑣 | 一鍵安裝 |
| VS Code 整合 | 無 | 原生整合 |
| Copilot 支援 | 無 | 完整支援 |
| MCP 控制 | 部分 | 完整 |
| 任務拆分 | 無 | 自動拆分 |
| 預覽功能 | 無 | ngrok 自動部署 |

## 📝 License

MIT License

## 🦞 致謝

本專案受 [moltbot](https://github.com/moltbot/moltbot) 啟發，感謝他們的開源貢獻。
