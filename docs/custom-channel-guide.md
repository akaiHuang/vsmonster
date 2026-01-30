# 🔌 Custom Channel Connector Guide

> How to add your own messaging platform to VSMONSTER

[中文版](custom-channel-guide.zh-TW.md)

---

## 📚 Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Creating a Channel Connector](#creating-a-channel-connector)
4. [Security Best Practices](#security-best-practices)
5. [Testing Your Connector](#testing-your-connector)
6. [Popular Platform Examples](#popular-platform-examples)

---

## Overview

VSMONSTER supports custom channel connectors, allowing you to integrate any messaging platform with VS Code Copilot. This guide explains how to create your own connector safely and securely.

### Supported Connector Types

| Type | Description | Examples |
|------|-------------|----------|
| **Webhook-based** | Platform sends HTTP requests to your endpoint | LINE, Slack, Microsoft Teams |
| **Polling-based** | Your connector polls the platform API | Email (IMAP), RSS feeds |
| **WebSocket-based** | Real-time bidirectional communication | Telegram, Discord |
| **SDK-based** | Using official platform SDK | WhatsApp Business, WeChat |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        VSMONSTER Gateway                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │
│  │    LINE      │  │   Telegram   │  │   Discord    │  ← Built-in   │
│  │  Connector   │  │  Connector   │  │  Connector   │               │
│  └──────────────┘  └──────────────┘  └──────────────┘               │
│                                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │
│  │   Custom     │  │   Custom     │  │   Custom     │  ← Your own   │
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

## Creating a Channel Connector

### Step 1: Create the Connector File

Create a new file in `packages/gateway/src/channels/`:

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
    // Verify credentials
    await this.verifyCredentials();
    
    // Set up webhook handlers or polling
    this.setupEventHandlers();
    
    this.logger.info('YourPlatform channel initialized');
  }

  async sendMessage(message: OutgoingMessage): Promise<void> {
    try {
      await this.client.sendMessage({
        to: message.channelId,
        text: message.content,
        // ... other options
      });
    } catch (error) {
      this.logger.error('Failed to send message', error);
      throw error;
    }
  }

  async handleWebhook(payload: unknown, signature?: string): Promise<void> {
    // ⚠️ IMPORTANT: Always verify webhook signatures!
    if (!this.verifyWebhookSignature(payload, signature)) {
      throw new Error('Invalid webhook signature');
    }

    const message = this.parseIncomingMessage(payload);
    await this.onMessage(message);
  }

  private verifyWebhookSignature(payload: unknown, signature?: string): boolean {
    // Implement signature verification for your platform
    // This is CRITICAL for security!
    return true; // Replace with actual verification
  }

  private parseIncomingMessage(payload: unknown): IncomingMessage {
    // Parse platform-specific payload into standard format
    return {
      id: '', // message ID
      channelId: '', // channel/chat ID
      userId: '', // sender ID
      content: '', // message text
      timestamp: new Date(),
      raw: payload, // keep original for debugging
    };
  }

  async disconnect(): Promise<void> {
    // Clean up resources
    await this.client.disconnect();
  }
}
```

### Step 2: Register the Connector

Add your connector to the channel manager:

```typescript
// packages/gateway/src/channels/manager.ts

import { YourPlatformChannel } from './your-platform';

// In the ChannelManager class:
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
    case 'your-platform':  // Add your platform
      channel = new YourPlatformChannel(config);
      break;
    default:
      throw new Error(`Unknown channel type: ${type}`);
  }
  
  await channel.initialize();
  this.channels.set(type, channel);
}
```

### Step 3: Add Environment Variables

```env
# .env
YOUR_PLATFORM_API_TOKEN=your_api_token_here
YOUR_PLATFORM_API_SECRET=your_api_secret_here
YOUR_PLATFORM_WEBHOOK_SECRET=your_webhook_secret_here
```

---

## 🔐 Security Best Practices

### ⚠️ CRITICAL Security Requirements

| Requirement | Description | Risk if Ignored |
|-------------|-------------|-----------------|
| **Webhook Signature Verification** | Always verify webhook signatures | Attackers can send fake messages |
| **Token Encryption** | Never store tokens in plain text | Token theft |
| **Input Validation** | Sanitize all incoming data | Code injection, XSS |
| **Rate Limiting** | Implement request rate limits | DoS attacks |
| **HTTPS Only** | All external communications via HTTPS | Man-in-the-middle attacks |

### 1. Webhook Signature Verification

**NEVER skip signature verification!** Each platform has its own method:

```typescript
// Example: HMAC-SHA256 verification (common pattern)
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
  
  // Use timing-safe comparison to prevent timing attacks
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}
```

### 2. Token Storage

```typescript
// ❌ BAD: Hardcoded token
const token = 'abc123secret';

// ❌ BAD: Readable environment variable
const token = process.env.TOKEN; // Without validation

// ✅ GOOD: Validated environment variable
const token = process.env.YOUR_PLATFORM_TOKEN;
if (!token) {
  throw new Error('YOUR_PLATFORM_TOKEN is required');
}

// ✅ BETTER: Using a secret manager
import { SecretManager } from '../utils/secrets';
const token = await SecretManager.get('your-platform-token');
```

### 3. Input Validation

```typescript
import { z } from 'zod';

// Define strict schema for incoming messages
const IncomingMessageSchema = z.object({
  type: z.enum(['message', 'command', 'callback']),
  userId: z.string().min(1).max(100),
  chatId: z.string().min(1).max(100),
  text: z.string().max(4000), // Limit message length
  timestamp: z.number().positive(),
});

function parseMessage(raw: unknown): IncomingMessage {
  // This will throw if validation fails
  const validated = IncomingMessageSchema.parse(raw);
  
  // Additional sanitization
  return {
    ...validated,
    text: sanitizeHtml(validated.text), // Remove HTML tags
  };
}
```

### 4. Rate Limiting

```typescript
import rateLimit from 'express-rate-limit';

// Apply rate limiting to webhook endpoints
const webhookLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute per IP
  message: 'Too many requests',
  standardHeaders: true,
  legacyHeaders: false,
});

app.post('/webhook/your-platform', webhookLimiter, handleWebhook);
```

### 5. Audit Logging

```typescript
// Log all sensitive operations (without logging actual tokens!)
logger.info('Channel initialized', {
  platform: 'your-platform',
  userId: config.userId,
  // ❌ NEVER log: token, secret, apiKey
});

logger.info('Message received', {
  platform: 'your-platform',
  messageId: message.id,
  userId: message.userId, // Or hash it for privacy
  // ❌ NEVER log: message content (may contain sensitive data)
});
```

---

## Testing Your Connector

### Unit Tests

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

  it('should verify valid webhook signature', () => {
    const payload = '{"type":"message","text":"hello"}';
    const validSignature = createValidSignature(payload, 'test-secret');
    
    expect(channel.verifyWebhookSignature(payload, validSignature)).toBe(true);
  });

  it('should reject invalid webhook signature', () => {
    const payload = '{"type":"message","text":"hello"}';
    const invalidSignature = 'invalid';
    
    expect(channel.verifyWebhookSignature(payload, invalidSignature)).toBe(false);
  });

  it('should parse incoming messages correctly', () => {
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

### Integration Tests

```bash
# Start the gateway in test mode
VSMONSTER_ENV=test pnpm dev

# Send a test webhook
curl -X POST http://localhost:3000/webhook/your-platform \
  -H "Content-Type: application/json" \
  -H "X-Signature: your-test-signature" \
  -d '{"type":"message","text":"test"}'
```

---

## Popular Platform Examples

### WhatsApp Business API

```typescript
// packages/gateway/src/channels/whatsapp/index.ts
import { Client } from 'whatsapp-web.js';

export class WhatsAppChannel extends BaseChannel {
  // WhatsApp Business API requires:
  // 1. Business verification
  // 2. Phone number registration
  // 3. Message template approval for outbound messages
  
  // Security considerations:
  // - Use official Meta Business SDK
  // - Verify webhook signatures using app secret
  // - Implement end-to-end encryption where required
}
```

### Slack

```typescript
// packages/gateway/src/channels/slack/index.ts
import { App } from '@slack/bolt';

export class SlackChannel extends BaseChannel {
  // Slack requires:
  // 1. OAuth 2.0 app configuration
  // 2. Event subscriptions
  // 3. Proper scopes (chat:write, commands, etc.)
  
  // Security considerations:
  // - Verify request signatures using signing secret
  // - Use token rotation
  // - Implement proper OAuth flow for team installations
}
```

### Microsoft Teams

```typescript
// packages/gateway/src/channels/teams/index.ts
import { BotFrameworkAdapter } from 'botbuilder';

export class TeamsChannel extends BaseChannel {
  // Teams requires:
  // 1. Azure Bot registration
  // 2. Teams app manifest
  // 3. Proper API permissions
  
  // Security considerations:
  // - Validate JWT tokens from Bot Framework
  // - Use Azure AD for authentication
  // - Implement proper tenant isolation
}
```

### WeChat (微信)

```typescript
// packages/gateway/src/channels/wechat/index.ts

export class WeChatChannel extends BaseChannel {
  // WeChat requires:
  // 1. Official Account or Mini Program registration
  // 2. ICP registration (for China hosting)
  // 3. Server configuration verification
  
  // Security considerations:
  // - Verify message signatures (signature, timestamp, nonce)
  // - Handle access token refresh
  // - Comply with Chinese data regulations
}
```

### Kakao Talk (카카오톡)

```typescript
// packages/gateway/src/channels/kakao/index.ts

export class KakaoChannel extends BaseChannel {
  // Kakao requires:
  // 1. Kakao Developers registration
  // 2. Channel creation and verification
  // 3. API key configuration
  
  // Security considerations:
  // - Use REST API key for server-to-server
  // - Implement proper callback URL verification
}
```

---

## 🚨 Security Checklist

Before deploying your custom connector:

- [ ] Webhook signature verification implemented
- [ ] All tokens stored in environment variables
- [ ] Input validation with strict schemas
- [ ] Rate limiting configured
- [ ] HTTPS enforced for all external calls
- [ ] Audit logging enabled (without sensitive data)
- [ ] Error messages don't leak internal details
- [ ] Unit and integration tests passing
- [ ] Security review completed

---

## 📚 Additional Resources

- [OWASP API Security Top 10](https://owasp.org/www-project-api-security/)
- [Webhook Security Best Practices](https://webhooks.fyi/security)
- [VS Code Extension Security](https://code.visualstudio.com/api/extension-guides/security)

---

## 🤝 Contributing

Found a bug or want to add a new connector? See [CONTRIBUTING.md](../CONTRIBUTING.md)

Questions? Open an issue on [GitHub](https://github.com/akaiHuang/vsmonster/issues)
