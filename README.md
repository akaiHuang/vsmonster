<p align="center">
  <img src="packages/vscode-extension/resources/banner.svg" alt="VSMONSTER Banner" width="600">
</p>

# 👾 VSMONSTER

> Connect LINE / Telegram / Discord messages to VS Code Copilot - A local-first bridge platform

**Version**: 0.2.0 | [CHANGELOG](CHANGELOG.md) | [中文版](README.zh-TW.md)

VSMONSTER lets you send commands and track task progress from messaging apps, with all execution happening locally in your VS Code environment.
The project uses 🦞 Moltbot as the messaging layer, while VSMONSTER focuses on Copilot and task workflow.

---

## ✨ Core Features

- **Local-first**: Gateway and task execution run locally - your data never leaves your computer
- **Multi-platform**: LINE / Telegram / Discord - unified command interface
- **VS Code Visualization**: Task list, channel status, MCP services at a glance
- **Task Decomposition**: Support for `/task` commands, task splitting, and progress reporting
- **MCP Extension**: Optional MCP service integration (Email / Browser / File, etc.)
- **Tunnel Support**: Generate public preview links with ngrok

---

## 🧭 Message Flow (Simple Diagram)

```
User (LINE/Telegram/Discord)
          |
       Webhook
          |
VSMONSTER Gateway (Express + WS)
          |
     WebSocket
          |
 VS Code Extension
          |
  Copilot (LM API or Chat UI)
```

---

## 🚀 Quick Start

### Step 0️⃣ Prerequisites (One-time)

- **VS Code** (see Step 1 below)
- **Git** (for cloning the repo)
- **Node.js 20+** and **pnpm 8+** (for running the Gateway)
- Optional: **VS Code CLI** (`code` or `code-insiders`) for one-line VSIX install

> If you only want to install the extension (no Gateway), you can skip Node.js/pnpm.

### Step 1️⃣ Install VS Code & Set Up GitHub Copilot

#### Download VS Code

Download and install from the official website:

| Platform | Download Link |
|----------|---------------|
| 🍎 **macOS** | [Download VS Code for Mac](https://code.visualstudio.com/sha/download?build=stable&os=darwin-universal) |
| 🪟 **Windows** | [Download VS Code for Windows](https://code.visualstudio.com/sha/download?build=stable&os=win32-x64-user) |
| 🐧 **Linux** | [Download VS Code for Linux](https://code.visualstudio.com/sha/download?build=stable&os=linux-x64) |

> Or visit [code.visualstudio.com](https://code.visualstudio.com/) for other versions.

#### Set Up GitHub Copilot

Install the **GitHub Copilot** extension in VS Code:
1. Open Extensions (`Cmd+Shift+X` / `Ctrl+Shift+X`)
2. Search for "GitHub Copilot"
3. Click Install

#### 💰 Free vs Paid Plans

| Plan | Price | Models | Best For |
|------|-------|--------|----------|
| **Free** | $0 | GPT-4o mini, Claude 3.5 Sonnet | Students, light users |
| **Pro** | $10/mo | GPT-4o, Claude 3.5 Sonnet | General developers |
| **Pro+** | $39/mo | **Claude Opus 4.5**, **GPT-5.2 Codex** | Professional developers ⭐ |
| **Business** | $19/user/mo | Same as Pro, with admin features | Teams |

> 💡 **Author's Pick**: I personally use the **$39 Pro+** plan because **Claude Opus 4.5** and **GPT-5.2 Codex** are currently the best models for complex programming tasks. They excel at large-scale refactoring, cross-file modifications, and architecture design.

---

### Step 2️⃣ Install VSMONSTER VS Code Extension

Install the **VSMONSTER** extension in VS Code:

1. Open Extensions (`Cmd+Shift+X` / `Ctrl+Shift+X`)
2. Search for "VSMONSTER"
3. Click Install

Or click directly: [Install VSMONSTER in VS Code](vscode:extension/vsmonster.vsmonster)

> 📦 **Marketplace Link**: [marketplace.visualstudio.com/items?itemName=vsmonster.vsmonster](https://marketplace.visualstudio.com/items?itemName=vsmonster.vsmonster)

#### 🧩 Option B: Install via VSIX (No Marketplace)

If you can't use Marketplace, install from a VSIX:

**Download (no pnpm required):**
- GitHub Releases: [github.com/akaiHuang/vsmonster/releases/latest](https://github.com/akaiHuang/vsmonster/releases/latest)
- Install via **Extensions → ... → Install from VSIX...**  
  or CLI: `code --install-extension /path/to/vsmonster-*.vsix`

**One-line (Windows, PowerShell):**
```powershell
powershell -ExecutionPolicy Bypass -File scripts/install-extension.ps1
```

**One-line (macOS/Linux, build from source):**
```bash
bash scripts/install-extension.sh
```

**Manual build from source:**
```bash
bash packages/vscode-extension/scripts/package.sh
code --install-extension packages/vscode-extension/vsmonster-0.0.2.vsix
```

> If `code` is not found, open VS Code and run: **"Shell Command: Install 'code' command in PATH"**  
> The PowerShell script will download the latest VSIX from GitHub Releases if no local VSIX is found.

---

#### 🪟 Single-Window Mode

VSMONSTER runs in **one** VS Code window at a time. The first window that activates becomes the **primary** window.
Other windows will show VSMONSTER as inactive. To switch, run **"VSMONSTER: Set Primary Window"** or click the
status bar indicator in the window you want to make primary.

---

### Step 3️⃣ Install 👾 VSMONSTER 👾 Gateway

#### 🤖 One-Click Install with Copilot (Recommended)

Open Copilot Chat in VS Code and type:

```
Help me install 👾 VSMONSTER 👾
https://github.com/akaiHuang/vsmonster.git
```

Copilot will automatically:
1. Clone the project to your specified directory
2. Run `pnpm install`
3. Copy `.env.example` to `.env`
4. Guide you through the setup process

#### 📦 Manual Installation

```bash
git clone https://github.com/akaiHuang/vsmonster.git
cd vsmonster
pnpm install
cp .env.example .env
```

#### 🌐 Domain & Tunnel Setup

VSMONSTER will guide you through setting up external connections, **while keeping your real IP hidden**:

| Option | Security | Difficulty | Description |
|--------|----------|------------|-------------|
| ☁️ **Cloudflare Tunnel** | ⭐⭐⭐ | ⭐⭐ | **Recommended**: Completely hides IP, free |
| 🌐 **GoDaddy + Cloudflare** | ⭐⭐⭐ | ⭐⭐⭐ | Professional domain + hidden IP |
| 🚇 **ngrok** | ⭐⭐ | ⭐ | Easiest, but IP changes frequently |

> 🔒 **IP Security Notes**:
> - With **Cloudflare Tunnel**, the outside world only sees Cloudflare's IP - your real IP is completely hidden
> - With **ngrok**, ngrok provides a temporary URL, but ngrok servers know your IP
> - **Never recommended** to directly expose your home IP to messaging platforms

Setup instructions will be provided during installation, or refer to:
- [Cloudflare Tunnel Setup Guide](docs/setup-cloudflare-tunnel.md)
- [ngrok Setup Guide](docs/setup-ngrok.md)

#### 🔌 Start Gateway

```bash
pnpm dev:gateway
```

> Need Mission Control too? Use `pnpm dev`.

Verify status: `http://localhost:3000/health`

---

### Step 4️⃣ ⚠️ Human Setup for Messaging Platforms ⚠️

> 🛡️ **Why Manual Setup?**
> 
> Tokens and Secret Keys are **extremely sensitive** data - equivalent to your account password.
> For security, this step must be completed **manually by a human**, not through AI.

#### 🔐 Secure Setup Process

```
┌─────────────────────────────────────────────────────────────┐
│  ⚠️  Complete the following steps yourself - don't let AI  │
│      see your Tokens!                                       │
└─────────────────────────────────────────────────────────────┘
```

**Step 1: Choose a platform and get your Token**

| Platform | Difficulty | Best For | Setup Guide |
|----------|------------|----------|-------------|
| 💚 **LINE** | ⭐⭐ | Taiwan/Japan users | [📖 docs/setup-line.md](docs/setup-line.md) |
| 🔵 **Telegram** | ⭐ | Easiest, recommended for beginners | [📖 docs/setup-telegram.md](docs/setup-telegram.md) |
| 🟣 **Discord** | ⭐⭐⭐ | Team collaboration | [📖 docs/setup-discord.md](docs/setup-discord.md) |

**Step 2: Manually edit the `.env` file**

```bash
# Open .env with your favorite editor
nano .env
# or
code .env
```

```env
# ⚠️ Paste the following Tokens manually - don't show to AI!

# 💚 LINE (fill one)
LINE_CHANNEL_ACCESS_TOKEN=your_LINE_Token
LINE_CHANNEL_SECRET=your_LINE_Secret

# 🔵 Telegram (fill one)
TELEGRAM_BOT_TOKEN=your_Telegram_Token

# 🟣 Discord (fill one)
DISCORD_BOT_TOKEN=your_Discord_Token
DISCORD_APPLICATION_ID=your_Application_ID
```

**Step 3: Tell Copilot you're done**

In VS Code Copilot Chat, type:

```
I've configured .env, help me set up the messaging platform
```

Copilot will:
1. ✅ Verify `.env` file exists (without reading contents)
2. ✅ Test connection to messaging platform
3. ✅ Guide you through Webhook setup
4. ✅ Send a test message to confirm connection

> 🔒 **Security Guarantee**: Copilot **will not read** your Token contents, only checks connection status.

#### 🛡️ Security Enhancements

After setup, VSMONSTER automatically:

| Measure | Description |
|---------|-------------|
| 🔐 **File Permissions** | Sets `.env` to `600` (only you can read) |
| 🚫 **Git Ignore** | `.env` is already in `.gitignore` |
| 🔍 **Token Detection** | Prevents accidentally pasting Tokens in chat |
| 📝 **Operation Logs** | Records all sensitive operations (without Tokens) |

---

## 📣 Supported Platforms

| Platform | Description | Setup Guide |
|----------|-------------|-------------|
| 💚 LINE | Best for Taiwan/Japan users | [docs/setup-line.md](docs/setup-line.md) |
| 🔵 Telegram | Easiest setup | [docs/setup-telegram.md](docs/setup-telegram.md) |
| 🟣 Discord | Best for team collaboration | [docs/setup-discord.md](docs/setup-discord.md) |

---

## 🧠 How It Works

```
User → Messaging Platform → Moltbot → VSMONSTER Gateway → VS Code Extension → Copilot Chat
   ↘ Task updates / Progress reports / Preview links ←───────────────────────────────────↗
```

VSMONSTER converts messaging app messages into tasks, hands them to VS Code Copilot for execution, and returns progress and results to the original platform.

---

## ⚙️ Environment Variables

All sensitive settings are stored in the `.env` file (already in `.gitignore`, won't be uploaded).

### Quick Setup

```bash
cp .env.example .env   # Copy template
nano .env              # Edit and fill in your Tokens
```

### Variable Reference

| Variable | Description | Required |
|----------|-------------|----------|
| `VSMONSTER_PORT` | Gateway port (default 3000) | ❌ |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE Bot Token | LINE users |
| `LINE_CHANNEL_SECRET` | LINE Channel Secret | LINE users |
| `TELEGRAM_BOT_TOKEN` | Telegram Bot Token | Telegram users |
| `DISCORD_BOT_TOKEN` | Discord Bot Token | Discord users |
| `DISCORD_APPLICATION_ID` | Discord App ID | Discord users |
| `NGROK_AUTHTOKEN` | ngrok Auth Token | ❌ Optional |

> 💡 See [.env.example](.env.example) for detailed template

---

## 💬 Chat Commands

VSMONSTER supports commands and natural language:

| Command | Description | Example |
|---------|-------------|---------|
| `/task` | Create a task | `/task create login page` |
| `/status` | Check task status | `/status` or `/status task-001` |
| `/model` | Switch model | `/model gpt-4` |
| `/preview` | Get preview link | `/preview` |
| `/cancel` | Cancel task | `/cancel task-001` |
| `/help` | Show help | `/help` |
| `/mcp` | Trigger MCP service | `/mcp email send ...` |

> Non-command messages are treated as new tasks and sent directly to Copilot.

---

## 🧩 VS Code Extension Features

- Gateway connection status display
- Task list with progress
- Channel status view
- MCP service management

VS Code Settings:

- `vsmonster.gatewayUrl` (default: `ws://localhost:3000`)
- `vsmonster.autoConnect`
- `vsmonster.showNotifications`
- `vsmonster.defaultModel`
- `vsmonster.copilotMode` (`lm` or `chat-ui`)

---

## 📚 Documentation

- Quick Start: `docs/quick-start.md`
- Platform Setup: `docs/setup-line.md` / `docs/setup-telegram.md` / `docs/setup-discord.md`
- Moltbot Integration: `docs/moltbot-integration.md`
- Enterprise Use Cases: `docs/enterprise-use-cases.md` (Apple case study)
- Multi-brand Throttling: `docs/enterprise-cases-brands.md` (Efficiency, cost reduction)
- Multi-brand Open Source: `docs/enterprise-cases-revenue.md` (Revenue growth, new business models)
- **🛠️ Implementation Guide**: `docs/enterprise-implementation-guide.md` (Detailed setup & code)
- VSMONSTER vs Moltbot: `docs/vsmonster-vs-moltbot-analysis.md`

---

## 🤝 VSMONSTER × Moltbot

VSMONSTER focuses on **VS Code + Copilot + Task Workflow**,
while messaging platform connectivity is powered by **🦞 Moltbot**.

To learn more about Moltbot or extend channel connectors, see:
`docs/moltbot-integration.md`

---

## 🔐 Security & Privacy

- Runs entirely locally, no cloud dependency
- Tokens never uploaded, stored only in local config files or environment variables
- Restrict available features through permissions and command rules

---

## 📝 License

MIT

---

## 🦞 Acknowledgments

Special thanks to Moltbot for their open source contribution,
enabling VSMONSTER to focus on VS Code Copilot integration and task workflow.

👾 VSMONSTER + 🦞 Moltbot = ❤️
