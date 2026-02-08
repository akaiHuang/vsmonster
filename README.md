<p align="center">
  <img src="packages/blue-monster/resources/blueMonster.svg" alt="VSMONSTER" width="220">
</p>

<h1 align="center">VSMONSTER</h1>

<p align="center">
  <strong>Text from your phone.<br>Your computer codes while you sleep.</strong>
</p>

<p align="center">
  The first <strong>Gemini 3</strong> multi-agent swarm for VS Code.<br>
  <a href="https://vsmonster.pages.dev">Live Demo</a> ·
  <a href="CHANGELOG.md">Changelog</a> ·
  <a href="README.zh-TW.md">中文版</a>
</p>

---

## What is VSMONSTER?

VSMONSTER turns VS Code into an autonomous AI factory you control from your phone.
Send one message → a squad of agents starts coding for you in parallel.

It's made up of three core agents:

| Agent | Role | What It Does |
|-------|---------|-------------|
| **UFO** 🛸 | Control Center | Manages, plans, and dispatches tasks. When a request comes in, UFO breaks it into specs, organizes the work queue, and hands off approved tasks to BlueMonster. |
| **BlueMonster** 👾 | Task Worker | The one who actually writes code. BlueMonster uses GitHub Copilot SDK to execute tasks — reading files, writing code, running terminals, analyzing images — all in parallel. |
| **Holography** 🛰️ | Message Translator (the messaging bridge) | Translates messages from your phone (LINE / Telegram / Discord) into commands that UFO understands, and sends results back to you. |

```
You (on your phone)
  📱 "Fix the login bug and add dark mode"
    ↓
Holography 🛰️ translates your message
    ↓
UFO 🛸 creates task specs, plans the work
    ↓
BlueMonster 👾 writes code using Copilot
    ↓
📱 You get a notification: "Done. Here's the preview."
```

---

## What Can It Do For You?

**Code from anywhere** — Send tasks from your phone while commuting, eating, or walking the dog. Your computer does the work.

**Run multiple tasks at once** — Unlike regular Copilot (one thing at a time), BlueMonster handles parallel tasks in the background. Queue 10 refactoring jobs, go get coffee, come back to all green.

**See everything happening** — Real-time task dashboard in VS Code sidebar + Mission Control web portal on your phone. Watch tasks move from Pending → Running → Done.

**Use Gemini 3, Claude, GPT — all at flat rate** — Powered by your GitHub Copilot subscription, which gives you access to Gemini 3 Pro, Claude Opus, GPT-5 and more. No per-token API bills. Run 100 complex tasks a day and pay the same $10–$39/month.

**Review & approve from your phone** — When tasks complete, get a delivery link on your messaging app. Preview results, check the code, then approve or reject.

**Stay secure** — Everything runs locally on your machine. Your code never leaves your computer. Tokens are never exposed to AI.

---

## Getting Started (4 Steps)

### Step 1: Get VS Code + Copilot

1. **Download VS Code**

| Platform | Link |
|----------|------|
| macOS | [Download](https://code.visualstudio.com/sha/download?build=stable&os=darwin-universal) |
| Windows | [Download](https://code.visualstudio.com/sha/download?build=stable&os=win32-x64-user) |
| Linux | [Download](https://code.visualstudio.com/sha/download?build=stable&os=linux-x64) |

2. **Install GitHub Copilot extension** — Open VS Code → Extensions (`Cmd+Shift+X`) → Search "GitHub Copilot" → Install

3. **Choose a plan**

| Plan | Price | Best For |
|------|-------|----------|
| Free | $0/mo | Try it out |
| Pro | $10/mo | General use |
| **Pro+** | **$39/mo** | **Best models (Claude Opus, GPT-5 Codex)** |

> The author uses Pro+ because the top-tier models handle complex multi-file tasks significantly better.

---

### Step 2: Install VSMONSTER

**Option A: One-click with Copilot (Recommended)**

Open Copilot Chat in VS Code and paste:

```
Help me install 👾 VSMONSTER 👾
https://github.com/akaiHuang/vsmonster.git
```

Copilot will clone, install dependencies, and guide you through setup automatically.

**Option B: Manual**

```bash
git clone https://github.com/akaiHuang/vsmonster.git
cd vsmonster
pnpm install
cp .env.example .env
```

Then install the VS Code extension:
- From Marketplace: Search "VSMONSTER" in Extensions
- Or from VSIX: [Download latest release](https://github.com/akaiHuang/vsmonster/releases/latest)

**Set up your messaging platform:**

> Tokens are sensitive — do this step yourself, don't show tokens to AI.

| Platform | Difficulty | Guide |
|----------|-----------|-------|
| Telegram | Easiest | [Setup Guide](docs/setup/setup-telegram.md) |
| LINE | Medium | [Setup Guide](docs/setup/setup-line.md) |
| Discord | Advanced | [Setup Guide](docs/setup/setup-discord.md) |

Edit your `.env` file with your platform tokens, then start the Gateway:

```bash
pnpm dev:gateway
```

---

### Step 3: Your First Hello World

Before using it from your phone, try it inside VS Code first:

1. Open VS Code with your project
2. Look for the VSMONSTER icon in the sidebar — click it
3. You'll see the UFO 🛸 dashboard with connection status, task list, and channels
4. Try creating a task: open a new file and ask BlueMonster to write a "Hello World" program
5. Watch BlueMonster work — it plans, writes code, and reports completion

Congratulations — you just let AI write code for you while you watched.

---

### Step 4: Go Mobile

Now the fun part — control everything from your phone:

1. Open your messaging app (LINE / Telegram / Discord)
2. Send a message to your VSMONSTER bot:
   ```
   Create a landing page with a hero section and contact form
   ```
3. Watch your computer start coding (or check Mission Control on your phone at `http://your-tunnel-url:3001`)
4. Get notified when it's done — review, approve, and ship

You're now coding from your couch. Enjoy your life.

---

## Architecture

```
📱 Phone (LINE / Telegram / Discord)
         ↓ webhook
   ┌─────────────────┐
   │ Holography 🛰️    │  Message translation layer
   └────────┬────────┘
            ↓
   ┌─────────────────┐
   │ Gateway          │  Orchestration hub (port 3000)
   └──┬─────┬─────┬──┘
      ↓     ↓     ↓
   UFO 🛸  👾    Mission Control
   Spec &  BlueMonster  Dashboard
   Queue   Execution    (port 3001)
            ↓
      GitHub Copilot SDK
```

| Component | What | Where |
|-----------|------|-------|
| **UFO** 🛸 | VS Code extension — task specs & queue | `UFO/extension/` |
| **BlueMonster** 👾 | VS Code extension — AI task execution | `packages/blue-monster/` |
| **Holography** 🛰️ | Messaging integration (LINE/TG/Discord) | `packages/holography/` |
| **Gateway** | HTTP + WebSocket server | `packages/gateway/` |
| **Mission Control** | Next.js task dashboard | `packages/mission-control/` |

---

## Commands

Send these from your messaging app or use them in VS Code:

| Command | What It Does |
|---------|-------------|
| `/task create login page` | Create a new task |
| `/status` | Check all task progress |
| `/model gpt-4` | Switch AI model |
| `/preview` | Get a preview link |
| `/cancel task-001` | Cancel a task |
| `/help` | Show available commands |

> Any non-command message is automatically treated as a new task.

---

## Tunnel Setup (Exposing to Internet)

To receive messages from LINE/Telegram/Discord, your Gateway needs a public URL:

| Method | Security | Difficulty |
|--------|----------|------------|
| **Cloudflare Tunnel** | Best (hides IP completely) | Medium |
| **ngrok** | Good (temporary URL) | Easy |

> Never expose your home IP directly. Always use a tunnel.

See: [Cloudflare Setup](docs/setup/setup-cloudflare-tunnel.md) · [ngrok Setup](docs/setup/setup-ngrok.md)

---

## Security

- All execution is local — your code never leaves your computer
- Tokens stored only in `.env` (gitignored, chmod 600)
- Token detection prevents accidental exposure in chat
- Whitelist + handshake verification for messaging platforms

---

## License

MIT

---

<p align="center">
  <strong>UFO 🛸 + BlueMonster 👾 + Holography 🛰️ = VSMONSTER</strong><br>
  <em>Stop sitting at your desk. Start coding from anywhere.</em>
</p>
