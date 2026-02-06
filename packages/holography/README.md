# @vsmonster/holography

> VSMonster 獨立通訊模組 - 完全取代 Moltbot/Clawdbot 依賴

## 概述

Holography 是一個獨立的通訊模組，提供：

- **多頻道支援**：LINE、Telegram、Discord
- **安全機制**：Whitelist + Handshake 雙重認證
- **傳輸層**：WebSocket 與 Webhook 整合
- **API 層**：UFO ↔ BlueMonster 任務派發協議

## 安裝

```bash
pnpm add @vsmonster/holography
```

## 快速開始

### 啟動 Holography Server

```typescript
import { HolographyServer } from '@vsmonster/holography';

const server = new HolographyServer({
  port: 3000,
  wsPath: '/ws',
  
  // 頻道設定
  channels: {
    line: {
      channelSecret: process.env.LINE_CHANNEL_SECRET!,
      accessToken: process.env.LINE_ACCESS_TOKEN!,
    },
    telegram: {
      botToken: process.env.TELEGRAM_BOT_TOKEN!,
    },
  },
  
  // 安全設定
  security: {
    whitelist: {
      enabled: true,
      users: ['U1234567890'],
    },
    handshake: {
      enabled: true,
      code: 'your-secret-code',
    },
  },
});

// 監聽訊息
server.on('message', (message) => {
  console.log(`收到來自 ${message.channel} 的訊息:`, message.content);
});

// 啟動
await server.start();
```

### 使用 Holography Client (VS Code Extension)

```typescript
import { HolographyClient } from '@vsmonster/holography';

const client = new HolographyClient({
  wsUrl: 'ws://localhost:3000/ws',
  reconnect: true,
});

client.on('message', (message) => {
  // 處理來自 Gateway 的訊息
});

await client.connect();
```

### UFO ↔ BlueMonster API

```typescript
import { BlueMonsterAPI } from '@vsmonster/holography';

const api = new BlueMonsterAPI({
  wsUrl: 'ws://localhost:3000/api',
});

await api.connect();

// 派發任務
const result = await api.dispatchTask('修復登入問題', {
  description: '用戶無法登入，錯誤代碼 500',
  priority: 'high',
  channel: 'line',
  userId: 'U1234567890',
});

// 取得任務列表
const tasks = await api.getTasks({ status: 'pending' });

// 取得聊天歷史
const { messages } = await api.getChatHistory({ userId: 'U1234567890' });
```

## 架構

```
                    ┌─────────────────────────────────────┐
                    │        HolographyServer             │
                    │  ┌───────────────────────────────┐  │
  LINE ────────────▶│  │      ChannelManager          │  │
  Telegram ────────▶│  │  (LINE, Telegram, Discord)    │  │
  Discord ─────────▶│  └───────────────────────────────┘  │
                    │                 │                    │
                    │                 ▼                    │
                    │  ┌───────────────────────────────┐  │
                    │  │     SecurityManager           │  │
                    │  │  (Whitelist + Handshake)      │  │
                    │  └───────────────────────────────┘  │
                    │                 │                    │
                    │                 ▼                    │
                    │  ┌───────────────────────────────┐  │
                    │  │    WebSocket Transport        │◀─┼──── VS Code Extension
                    │  │     + Webhook Router          │  │      (HolographyClient)
                    │  └───────────────────────────────┘  │
                    └─────────────────────────────────────┘
```

## 模組結構

```
packages/holography/
├── src/
│   ├── core/           # 核心元件
│   │   ├── server.ts   # HolographyServer
│   │   ├── manager.ts  # ChannelManager
│   │   └── types.ts    # 型別定義
│   │
│   ├── channels/       # 頻道實作
│   │   ├── base.ts     # HologramChannel 基類
│   │   ├── line.ts     # LINE Channel
│   │   ├── telegram.ts # Telegram Channel
│   │   └── discord.ts  # Discord Channel
│   │
│   ├── security/       # 安全機制
│   │   ├── whitelist.ts # Whitelist 管理
│   │   ├── handshake.ts # Handshake 認證
│   │   └── storage.ts   # 永久儲存
│   │
│   ├── transports/     # 傳輸層
│   │   ├── websocket.ts # WebSocket 處理
│   │   └── webhook.ts   # Webhook 路由
│   │
│   ├── api/            # UFO ↔ BlueMonster API
│   │   ├── types.ts    # API 型別定義
│   │   └── client.ts   # BlueMonsterAPI Client
│   │
│   ├── client.ts       # HolographyClient (for Extension)
│   └── index.ts        # 統一匯出
│
├── package.json
├── tsconfig.json
└── README.md
```

## 與舊版比較

| 功能 | Moltbot 整合 | Holography |
|------|-------------|------------|
| LINE 支援 | ✅ 依賴 Moltbot | ✅ 獨立實作 |
| Telegram 支援 | ✅ 依賴 Moltbot | ✅ 獨立實作 |
| Discord 支援 | ✅ 依賴 Moltbot | ✅ 獨立實作 |
| Whitelist | ✅ Moltbot 提供 | ✅ 自建 |
| Handshake | ❌ | ✅ 自建 |
| 外部依賴 | moltbot-sdk | 僅 axios, ws |
| 型別安全 | 部分 | ✅ 完整 |

## License

MIT
