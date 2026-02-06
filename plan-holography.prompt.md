# Plan: Holography - VSMonster 獨立通訊模組

**TL;DR**: 建立一個名為 Holography 的獨立通訊模組，完全取代 Moltbot/Clawdbot 依賴，整合 LINE/Telegram/Discord 通訊，並統一 BlueMonster 和 UFO 的社群功能。

## 現有架構摘要

| 元件 | 位置 | 功能 |
|------|------|------|
| **Gateway Server** | `packages/gateway/src/server.ts` | 主伺服器，Webhook 接收、WebSocket 廣播 |
| **Channel Manager** | `packages/gateway/src/channels/manager.ts` | 頻道管理器，整合各平台 |
| **LINE Channel** | `packages/gateway/src/channels/line/index.ts` | LINE Messaging API 整合 |
| **Telegram Channel** | `packages/gateway/src/channels/telegram/index.ts` | Telegram Bot API 整合 |
| **Discord Channel** | `packages/gateway/src/channels/discord/index.ts` | Discord Bot 整合 |
| **Moltbot Integration** | `packages/gateway/src/moltbot-integration.ts` | ⚠️ **待移除** - 外部 Moltbot 依賴 |
| **Server Simplified** | `packages/gateway/src/server-simplified.ts` | ⚠️ **待移除** - Moltbot 專用簡化版 |
| **UFO Extension** | `UFO/extension/src/extension.ts` | VS Code 擴展，透過 Gateway 通訊 |
| **GatewayClient** | `UFO/extension/src/gateway-client.ts` | WebSocket 客戶端 |
| **BlueMonster** | `packages/blue-monster/` | ❌ 無社群整合（獨立 AI 助手） |

## 訊息流程 (現有)

```
社群平台 → Webhook → Gateway → WebSocket → UFO Extension → Copilot SDK
                                                              ↓
社群平台 ← Channel API ← Gateway ← WebSocket ← UFO Extension
```

## Steps

1. **建立 Holography 套件結構** - 在 `packages/holography/` 建立新模組，包含 `src/core/`, `src/channels/`, `src/transports/`, `src/security/` 目錄結構

2. **遷移並優化 Channel 實現** - 將現有 LINE/Telegram/Discord channel 移植到 Holography，統一介面為 `HologramChannel`，新增 `removeFromWhitelist()` 等方法

3. **建立 HolographyServer 核心** - 整合 Express + WebSocket 伺服器，取代現有 `server.ts` 的通訊部分，移除 Moltbot 依賴

4. **建立 HolographyClient SDK** - 基於現有 `GatewayClient` 擴展，讓 BlueMonster 和 UFO 都能使用，提供統一的 API

5. **無痛轉移策略** - 建立相容層讓新舊系統並存，逐步遷移配置檔案格式，最後移除舊檔案

## Holography 模組規劃

```
packages/holography/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                    # 主入口點
│   ├── core/
│   │   ├── server.ts               # HolographyServer
│   │   ├── manager.ts              # ChannelManager
│   │   └── types.ts                # 核心型別定義
│   ├── channels/
│   │   ├── base.ts                 # HologramChannel 基底類別
│   │   ├── line.ts                 # LINE 實現
│   │   ├── telegram.ts             # Telegram 實現
│   │   └── discord.ts              # Discord 實現
│   ├── transports/
│   │   ├── websocket.ts            # WebSocket 傳輸層
│   │   └── webhook.ts              # Webhook 處理
│   ├── security/
│   │   ├── whitelist.ts            # 白名單管理
│   │   ├── handshake.ts            # 握手驗證
│   │   └── storage.ts              # 持久化存儲
│   └── client/
│       └── index.ts                # HolographyClient (給 Extension 用)
```

## Further Considerations

1. **BlueMonster 整合方式？** - 是否讓 BlueMonster 也能接收社群訊息，還是保持它為純 VS Code 助手？

2. **Moltbot 相容性？** - 是否保留 Moltbot 作為備用選項，還是完全移除依賴？

3. **套件分割策略？** - Holography 是獨立 npm 套件 (`@vsmonster/holography`)，還是保持在 monorepo 內部使用？
