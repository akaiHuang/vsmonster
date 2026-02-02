# 🔵 BlueMonster

> AI Chat Assistant powered by GitHub Copilot - Execute commands, analyze images, and automate tasks directly in VS Code.

![BlueMonster](resources/bluemonster.png)

## ✨ Features

### 🤖 AI-Powered Chat
- **Multiple Modes**: Agent, Ask, Edit, and Plan modes for different use cases
- **Copilot Integration**: Powered by VS Code Language Model API (GitHub Copilot)
- **Smart Conversations**: Context-aware responses with conversation history

### 🖼️ Image Analysis
- Upload multiple images for AI analysis
- Support for screenshots, diagrams, and code images
- Visual preview before sending

### 💻 Terminal Integration
- Execute shell commands directly from chat
- View command output in the chat window
- Confirmation prompts for safety

### 📁 File Operations (Danger Mode)
- Read, write, and open files
- Automatic file change notifications
- Side-by-side file preview

## 🚀 Quick Start

1. **Open BlueMonster**: Click the BlueMonster icon in the Activity Bar (sidebar)
2. **Select Mode**: Choose from Agent, Ask, Edit, or Plan
3. **Start Chatting**: Type your message and press Enter

## 📖 Commands

| Command | Description |
|---------|-------------|
| `/help` | Show all available commands |
| `/model [name\|list]` | View or change the AI model |
| `/terminal <command>` | Execute a terminal command |

## 🎯 Modes

BlueMonster 提供三種操作模式，適合不同的使用場景：

| Mode | Icon | Description |
|------|------|-------------|
| **計畫** | 📋 | 純聊天模式，無法執行任何命令 |
| **代理-安全** | 🔒 | 敏感命令需要確認才能執行 |
| **代理-危險** | ⚡ | 全自動執行，無需確認 |

### 📋 計畫模式 (Plan)
- 無法執行任何終端命令或工具
- 只能進行純文字聊天和顯示程式碼
- 適合規劃、討論和學習

### 🔒 代理-安全模式 (Agent-Safe)
在設定中可勾選/取消哪些敏感操作需要確認（預設全部勾選）：

| 設定 | 說明 | 命令範例 |
|------|------|----------|
| `confirmDelete` | 🗑️ 刪除檔案 | rm, rmdir, unlink |
| `confirmMove` | 📁 移動檔案 | mv |
| `confirmSudo` | 🔐 管理員權限 | sudo, su |
| `confirmNetwork` | 🌐 遠端連線 | ssh, scp, rsync |
| `confirmDownload` | ⬇️ 網路下載 | curl, wget |
| `confirmPackage` | 📦 套件安裝 | npm, yarn, pnpm, pip, brew, apt |
| `confirmGit` | 📤 Git 操作 | git push, git reset --hard |
| `confirmDocker` | 🐳 Docker 操作 | docker rm, docker stop |
| `confirmPermission` | 🔒 權限變更 | chmod, chown |
| `confirmKill` | 💀 終止進程 | kill, killall, pkill |
| `confirmSystem` | ⚡ 系統操作 | reboot, shutdown, eval, exec |

設定位置：VS Code Settings → 搜尋 `blueMonster.safeMode`

### ⚡ 代理-危險模式 (Agent-Danger)
- 所有命令自動執行，不需確認
- 適合完全信任 AI 的自動化工作流程
- ⚠️ **警告**：請謹慎使用，AI 可能會執行破壞性操作

## ⚙️ Settings

| Setting | Description | Default |
|---------|-------------|---------|
| `blueMonster.backend` | Chat backend (lm or cli) | `lm` |
| `blueMonster.model` | Preferred Copilot model ID | (auto) |
| `blueMonster.terminalConfirmation` | Terminal command confirmation mode | `chat` |
| `blueMonster.dangerMode` | Enable file and VS Code command tools | `false` |

### Terminal Confirmation Modes

- **chat**: Confirm commands in the chat UI
- **modal**: Show a VS Code modal dialog
- **off**: Run without confirmation (use with caution)

### Danger Mode

Enable `blueMonster.dangerMode` to unlock additional tools:
- Read/write files
- Execute VS Code commands
- Open files in editor

⚠️ **Warning**: Only enable if you trust the AI's actions.

## 🔒 Requirements

- **VS Code** 1.90.0 or higher
- **GitHub Copilot** extension installed and logged in
- **Copilot subscription** (Free, Pro, Pro+, or Business)

## 📸 Screenshots

### Chat Interface
The main chat interface with mode selector and image upload:

```
┌─────────────────────────────────────────┐
│  BlueMonster         [Clear][Term][Model]
├─────────────────────────────────────────┤
│  User: Explain this code               │
│  Assistant: This code implements...     │
├─────────────────────────────────────────┤
│  🔄 Thinking...                         │
├─────────────────────────────────────────┤
│  [🤖 Agent ▼] [📎]                      │
│  ┌─────────────────────────────────┐    │
│  │ Ask BlueMonster...               │    │
│  └─────────────────────────────────┘    │
└─────────────────────────────────────────┘
```

## 🐛 Known Issues

- Image analysis requires a Copilot model that supports vision
- Some interactive terminal commands may not work properly

## 📝 Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history.

## 🤝 Contributing

Contributions are welcome! Please visit our [GitHub repository](https://github.com/akaiHuang/vsmonster).

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

---

**Enjoy BlueMonster!** 🔵🦖
