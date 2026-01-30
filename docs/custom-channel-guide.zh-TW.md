# 🔌 自訂通訊軟體連接器指南

> 如何將你自己的通訊平台加入 VSMONSTER

[English](custom-channel-guide.md)

---

## 📚 目錄

1. [概述](#概述)
2. [架構說明](#架構說明)
3. [建立 Channel Connector](#建立-channel-connector)
4. [安全性最佳實踐](#安全性最佳實踐)
5. [測試你的 Connector](#測試你的-connector)
6. [常見平台範例](#常見平台範例)

---

## 概述

VSMONSTER 支援自訂 channel connector，讓你能將任何通訊平台與 VS Code Copilot 整合。本指南說明如何安全地建立自己的 connector。

### 支援的 Connector 類型

| 類型 | 說明 | 範例 |
|------|------|------|
| **Webhook 型** | 平台發送 HTTP 請求到你的端點 | LINE、Slack、Microsoft Teams |
| **輪詢型** | 你的 connector 定期呼叫平台 API | Email (IMAP)、RSS feeds |
| **WebSocket 型** | 即時雙向通訊 | Telegram、Discord |
| **SDK 型** | 使用官方平台 SDK | WhatsApp Business、微信 |

---

## 架構說明

```
┌─────────────────────────────────────────────────────────────────────┐
│                        VSMONSTER Gateway                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │
│  │    LINE      │  │   Telegram   │  │   Discord    │  ← 內建      │
│  │  Connector   │  │  Connector   │  │  Connector   │               │
│  └──────────────┘  └──────────────┘  └──────────────┘               │
│                                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │
│  │   自訂       │  │   自訂       │  │   自訂       │  ← 你自己的   │
│  │  Connector   │  │  Connector   │  │  Connector   │               │
│  └──────────────┘  └──────────────┘  └──────────────┘               │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │                    Channel Manager (base.ts)                     ││
│  └─────────────────────────────────────────────────────────────────┘│
│                              ↓                                       │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │                    Command Processor                             ││
│  └─────────────────────────────────────────────────────────────────┘│
│                              ↓                                       │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │                    Copilot Bridge                                ││
│  └─────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────┘
```

---

## 建立 Channel Connector

### 步驟 1：建立 Connector 檔案

在 `packages/gateway/src/channels/` 建立新檔案：

```typescript
// packages/gateway/src/channels/your-platform/index.ts

import { BaseChannel, ChannelConfig, IncomingMessage, OutgoingMessage } from '../base';

export interface YourPlatformConfig extends ChannelConfig {
  apiToken: string;
  apiSecret?: string;
  webhookSecret?: string;
}

export class YourPlatformChannel extends BaseChannel {
  private client: YourPlatformSDK;
  
  constructor(config: YourPlatformConfig) {
    super('your-platform', config);
    this.client = new YourPlatformSDK(config.apiToken);
  }

  async initialize(): Promise<void> {
    // 驗證憑證
    await this.verifyCredentials();
    
    // 設定 webhook 處理器或輪詢
    this.setupEventHandlers();
    
    this.logger.info('YourPlatform channel 已初始化');
  }

  async sendMessage(message: OutgoingMessage): Promise<void> {
    try {
      await this.client.sendMessage({
        to: message.channelId,
        text: message.content,
        // ... 其他選項
      });
    } catch (error) {
      this.logger.error('發送訊息失敗', error);
      throw error;
    }
  }

  async handleWebhook(payload: unknown, signature?: string): Promise<void> {
    // ⚠️ 重要：一定要驗證 webhook 簽名！
    if (!this.verifyWebhookSignature(payload, signature)) {
      throw new Error('無效的 webhook 簽名');
    }

    const message = this.parseIncomingMessage(payload);
    await this.onMessage(message);
  }

  private verifyWebhookSignature(payload: unknown, signature?: string): boolean {
    // 實作你平台的簽名驗證
    // 這對安全性來說非常重要！
    return true; // 替換成實際的驗證邏輯
  }

  private parseIncomingMessage(payload: unknown): IncomingMessage {
    // 將平台特定的 payload 轉換成標準格式
    return {
      id: '', // 訊息 ID
      channelId: '', // 頻道/聊天 ID
      userId: '', // 發送者 ID
      content: '', // 訊息文字
      timestamp: new Date(),
      raw: payload, // 保留原始資料供除錯用
    };
  }

  async disconnect(): Promise<void> {
    // 清理資源
    await this.client.disconnect();
  }
}
```

### 步驟 2：註冊 Connector

將你的 connector 加入 channel manager：

```typescript
// packages/gateway/src/channels/manager.ts

import { YourPlatformChannel } from './your-platform';

// 在 ChannelManager class 中：
async initializeChannel(type: string, config: ChannelConfig): Promise<void> {
  let channel: BaseChannel;
  
  switch (type) {
    case 'line':
      channel = new LineChannel(config);
      break;
    case 'telegram':
      channel = new TelegramChannel(config);
      break;
    case 'discord':
      channel = new DiscordChannel(config);
      break;
    case 'your-platform':  // 加入你的平台
      channel = new YourPlatformChannel(config);
      break;
    default:
      throw new Error(`未知的 channel 類型: ${type}`);
  }
  
  await channel.initialize();
  this.channels.set(type, channel);
}
```

### 步驟 3：新增環境變數

```env
# .env
YOUR_PLATFORM_API_TOKEN=你的_api_token
YOUR_PLATFORM_API_SECRET=你的_api_secret
YOUR_PLATFORM_WEBHOOK_SECRET=你的_webhook_secret
```

---

## 🔐 安全性最佳實踐

### ⚠️ 關鍵安全要求

| 要求 | 說明 | 忽略的風險 |
|------|------|----------|
| **Webhook 簽名驗證** | 一定要驗證 webhook 簽名 | 攻擊者可以發送假訊息 |
| **Token 加密** | 絕不以明文儲存 token | Token 被盜 |
| **輸入驗證** | 清理所有傳入的資料 | 程式碼注入、XSS |
| **速率限制** | 實作請求速率限制 | DoS 攻擊 |
| **僅限 HTTPS** | 所有外部通訊都透過 HTTPS | 中間人攻擊 |

### 1. Webhook 簽名驗證

**絕對不要跳過簽名驗證！** 每個平台都有自己的方法：

```typescript
// 範例：HMAC-SHA256 驗證（常見模式）
import crypto from 'crypto';

function verifySignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  
  // 使用時間安全的比較來防止計時攻擊
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}
```

### 2. Token 儲存

```typescript
// ❌ 錯誤：寫死 token
const token = 'abc123secret';

// ❌ 錯誤：未驗證的環境變數
const token = process.env.TOKEN; // 沒有驗證

// ✅ 正確：驗證過的環境變數
const token = process.env.YOUR_PLATFORM_TOKEN;
if (!token) {
  throw new Error('YOUR_PLATFORM_TOKEN 是必要的');
}

// ✅ 更好：使用密鑰管理器
import { SecretManager } from '../utils/secrets';
const token = await SecretManager.get('your-platform-token');
```

### 3. 輸入驗證

```typescript
import { z } from 'zod';

// 為傳入訊息定義嚴格的 schema
const IncomingMessageSchema = z.object({
  type: z.enum(['message', 'command', 'callback']),
  userId: z.string().min(1).max(100),
  chatId: z.string().min(1).max(100),
  text: z.string().max(4000), // 限制訊息長度
  timestamp: z.number().positive(),
});

function parseMessage(raw: unknown): IncomingMessage {
  // 驗證失敗時會拋出錯誤
  const validated = IncomingMessageSchema.parse(raw);
  
  // 額外的清理
  return {
    ...validated,
    text: sanitizeHtml(validated.text), // 移除 HTML 標籤
  };
}
```

### 4. 速率限制

```typescript
import rateLimit from 'express-rate-limit';

// 對 webhook 端點套用速率限制
const webhookLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 分鐘
  max: 100, // 每個 IP 每分鐘 100 個請求
  message: '請求太多',
  standardHeaders: true,
  legacyHeaders: false,
});

app.post('/webhook/your-platform', webhookLimiter, handleWebhook);
```

### 5. 稽核日誌

```typescript
// 記錄所有敏感操作（不記錄實際的 token！）
logger.info('Channel 已初始化', {
  platform: 'your-platform',
  userId: config.userId,
  // ❌ 絕不記錄：token、secret、apiKey
});

logger.info('收到訊息', {
  platform: 'your-platform',
  messageId: message.id,
  userId: message.userId, // 或將其雜湊以保護隱私
  // ❌ 絕不記錄：訊息內容（可能包含敏感資料）
});
```

---

## 測試你的 Connector

### 單元測試

```typescript
// packages/gateway/src/channels/your-platform/index.test.ts

import { YourPlatformChannel } from './index';

describe('YourPlatformChannel', () => {
  let channel: YourPlatformChannel;

  beforeEach(() => {
    channel = new YourPlatformChannel({
      apiToken: 'test-token',
      webhookSecret: 'test-secret',
    });
  });

  it('應該驗證有效的 webhook 簽名', () => {
    const payload = '{"type":"message","text":"hello"}';
    const validSignature = createValidSignature(payload, 'test-secret');
    
    expect(channel.verifyWebhookSignature(payload, validSignature)).toBe(true);
  });

  it('應該拒絕無效的 webhook 簽名', () => {
    const payload = '{"type":"message","text":"hello"}';
    const invalidSignature = 'invalid';
    
    expect(channel.verifyWebhookSignature(payload, invalidSignature)).toBe(false);
  });

  it('應該正確解析傳入訊息', () => {
    const rawPayload = {
      type: 'message',
      user: { id: 'user123' },
      text: 'Hello world',
    };
    
    const message = channel.parseIncomingMessage(rawPayload);
    
    expect(message.userId).toBe('user123');
    expect(message.content).toBe('Hello world');
  });
});
```

### 整合測試

```bash
# 以測試模式啟動 gateway
VSMONSTER_ENV=test pnpm dev

# 發送測試 webhook
curl -X POST http://localhost:3000/webhook/your-platform \
  -H "Content-Type: application/json" \
  -H "X-Signature: your-test-signature" \
  -d '{"type":"message","text":"test"}'
```

---

## 常見平台範例

### WhatsApp Business API

```typescript
// packages/gateway/src/channels/whatsapp/index.ts
import { Client } from 'whatsapp-web.js';

export class WhatsAppChannel extends BaseChannel {
  // WhatsApp Business API 需要：
  // 1. 商業驗證
  // 2. 電話號碼註冊
  // 3. 外發訊息的訊息範本審核
  
  // 安全考量：
  // - 使用官方 Meta Business SDK
  // - 使用 app secret 驗證 webhook 簽名
  // - 在需要時實作端對端加密
}
```

### Slack

```typescript
// packages/gateway/src/channels/slack/index.ts
import { App } from '@slack/bolt';

export class SlackChannel extends BaseChannel {
  // Slack 需要：
  // 1. OAuth 2.0 app 設定
  // 2. Event subscriptions
  // 3. 適當的權限範圍（chat:write、commands 等）
  
  // 安全考量：
  // - 使用 signing secret 驗證請求簽名
  // - 使用 token 輪換
  // - 為團隊安裝實作適當的 OAuth 流程
}
```

### Microsoft Teams

```typescript
// packages/gateway/src/channels/teams/index.ts
import { BotFrameworkAdapter } from 'botbuilder';

export class TeamsChannel extends BaseChannel {
  // Teams 需要：
  // 1. Azure Bot 註冊
  // 2. Teams app manifest
  // 3. 適當的 API 權限
  
  // 安全考量：
  // - 驗證來自 Bot Framework 的 JWT token
  // - 使用 Azure AD 進行身份驗證
  // - 實作適當的租戶隔離
}
```

### 微信

```typescript
// packages/gateway/src/channels/wechat/index.ts

export class WeChatChannel extends BaseChannel {
  // 微信需要：
  // 1. 公眾號或小程式註冊
  // 2. ICP 備案（中國境內託管）
  // 3. 伺服器設定驗證
  
  // 安全考量：
  // - 驗證訊息簽名（signature、timestamp、nonce）
  // - 處理 access token 刷新
  // - 遵守中國資料法規
}
```

### Kakao Talk (카카오톡)

```typescript
// packages/gateway/src/channels/kakao/index.ts

export class KakaoChannel extends BaseChannel {
  // Kakao 需要：
  // 1. Kakao Developers 註冊
  // 2. Channel 建立和驗證
  // 3. API key 設定
  
  // 安全考量：
  // - 伺服器對伺服器使用 REST API key
  // - 實作適當的 callback URL 驗證
}
```

---

## 🚨 安全檢查清單

部署你的自訂 connector 前：

- [ ] 已實作 Webhook 簽名驗證
- [ ] 所有 token 都儲存在環境變數中
- [ ] 使用嚴格 schema 進行輸入驗證
- [ ] 已設定速率限制
- [ ] 所有外部呼叫都強制使用 HTTPS
- [ ] 已啟用稽核日誌（不含敏感資料）
- [ ] 錯誤訊息不會洩露內部細節
- [ ] 單元測試和整合測試通過
- [ ] 安全審查完成

---

## 📚 其他資源

- [OWASP API 安全前 10 大風險](https://owasp.org/www-project-api-security/)
- [Webhook 安全最佳實踐](https://webhooks.fyi/security)
- [VS Code 擴充功能安全性](https://code.visualstudio.com/api/extension-guides/security)

---

## 🤝 貢獻

發現 bug 或想加入新的 connector？請參閱 [CONTRIBUTING.md](../CONTRIBUTING.md)

有問題？在 [GitHub](https://github.com/akaiHuang/vsmonster/issues) 開啟 issue
