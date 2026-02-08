<h1 align="center">Holography 🛰️</h1>

<p align="center">
  <strong>The Messaging Bridge</strong><br>
  <em>Your phone talks. VS Code listens.</em>
</p>

---

## What is Holography?

Holography is the messaging bridge that connects your phone to VSMONSTER.

It receives messages from LINE, Telegram, and Discord, translates them into commands, and sends results back — all through a single unified interface.

It's the reason you can text your computer from your phone and it starts coding.

---

## Supported Platforms

| Platform | Library | Difficulty |
|----------|---------|-----------|
| 💚 **LINE** | @line/bot-sdk | Medium |
| 🔵 **Telegram** | grammy | Easy (recommended for beginners) |
| 🟣 **Discord** | discord.js | Advanced |

You can enable one, two, or all three — they all work simultaneously.

---

## What Holography Handles

**Message routing** — Incoming messages from any platform get normalized into a unified format, then forwarded to UFO and Gateway.

**Response delivery** — When BlueMonster finishes a task, Holography sends the results back to the same platform and user who requested it.

**Media support** — Images, files, and other media from messaging apps are received and stored locally for processing.

**Security** — Two layers of protection:
- **Whitelist** — Only approved users can interact with your VSMONSTER
- **Handshake verification** — Time-limited authentication for new devices

**Real-time sync** — WebSocket transport keeps VS Code extensions connected and updated in real-time.

---

## How It Fits Together

```
📱 LINE / Telegram / Discord
          ↓ webhook
   ┌──────────────┐
   │ Holography 🛰️ │
   │              │
   │  Receives    │
   │  Translates  │
   │  Delivers    │
   └──────┬───────┘
          ↓ WebSocket
   ┌──────────────┐
   │   Gateway    │ → UFO 🛸 → BlueMonster 👾
   └──────────────┘
```

Holography is the first thing that touches your message and the last thing that delivers your result.

---

## Quick Setup

### 1. Install

```bash
pnpm add @vsmonster/holography
```

### 2. Configure your platform

Choose one (or more) and get your tokens:

| Platform | Where to get tokens |
|----------|-------------------|
| Telegram | Talk to [@BotFather](https://t.me/BotFather) |
| LINE | [LINE Developers Console](https://developers.line.biz/) |
| Discord | [Discord Developer Portal](https://discord.com/developers/) |

### 3. Set environment variables

```env
# Pick one or more:
TELEGRAM_BOT_TOKEN=your_token
LINE_CHANNEL_ACCESS_TOKEN=your_token
LINE_CHANNEL_SECRET=your_secret
DISCORD_BOT_TOKEN=your_token
```

> Never share your tokens with anyone — including AI assistants.

### 4. Start

Holography starts automatically with the Gateway:

```bash
pnpm dev:gateway
```

---

## Tunnel (Public URL)

To receive webhooks from messaging platforms, you need a public URL. Holography works with:

| Method | Best for |
|--------|----------|
| **Cloudflare Tunnel** | Production — hides your IP completely, free |
| **ngrok** | Development — easy setup, temporary URL |

See the [setup guides](../../docs/setup/) for step-by-step instructions.

---

## Part of VSMONSTER

Holography 🛰️ is the messaging bridge. It works with:
- **UFO** 🛸 — The control center that plans and dispatches tasks
- **BlueMonster** 👾 — The AI worker that writes code

Together, they form VSMONSTER.

---

MIT License
