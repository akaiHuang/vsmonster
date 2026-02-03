# 🔵 BlueMonster

> AI Chat Assistant powered by GitHub Copilot - Execute commands, analyze images, and automate tasks directly in VS Code.

![BlueMonster](resources/bluemonster.png)

## ✨ Features

### 🤖 AI-Powered Chat
- **Three Modes**: 計畫 / 代理-安全 / 代理-危險
- **Copilot SDK**: SDK-only backend with parallel worker sessions
- **Task Memory**: Each task has isolated context and history

### 🖼️ Image Analysis
- Upload multiple images for AI analysis
- Support for screenshots, diagrams, and code images
- Visual preview before sending

### 💻 Terminal Integration
- Execute shell commands directly from chat
- View command output in the chat window
- Confirmation prompts with 1/2/3/4 options (包含「專案永遠同意」)

### 📁 File Operations (Danger Mode)
- Read, write, and open files
- Automatic file change notifications
- Side-by-side file preview

### 🔄 Multi-Task Parallel Execution
- Run multiple tasks simultaneously in the background
- Switch between tasks without interrupting execution
- Each task has independent state and chat history
- Visual status indicators in task list

### 🧠 Task Persona & Instructions
- 每個任務建立獨立資料夾：`.bluemonster/tasks/<taskId>/`
- 任務指引：`.vscode/copilot-instructions.md`
- 個性設定：`.vscode/me.md`
- 會在該任務的 system prompt 內被注入（確保生效）

## 🏷️ Task Status Tags

BlueMonster 使用狀態標籤幫助你追蹤任務狀態：

| 標籤 | 顏色 | 說明 |
|------|------|------|
| **#LIVE** | - | 任務編號標籤，表示在記憶體中的活動任務 |
| **🔄 執行中** | 🔵 藍色閃爍 | AI 正在處理回應或執行工具 |
| **⏳ 等待中** | 🟠 橘色閃爍 | 等待用戶確認操作（如執行危險命令） |
| **● 活動中** | 🟢 綠色 | 任務在記憶體中保持活動，可隨時繼續 |
| **📁 歷史** | ⚪ 灰色 | 已存檔的歷史任務 |

### 任務狀態流程

```
新任務 → 活動中 → 執行中 ←→ 等待中
           ↓
         歷史（關閉 VS Code 後）
```

- **活動中**：任務在記憶體中，可隨時切換回來繼續對話
- **執行中**：AI 正在生成回應，即使切換到其他任務也會在背景繼續執行
- **等待中**：AI 需要你的確認才能繼續（例如執行刪除檔案的命令）
- **歷史**：任務已保存到硬碟，點擊後會載入到新的活動任務

## 🚀 Quick Start

1. **Open BlueMonster**: Click the BlueMonster icon in the Activity Bar (sidebar)
2. **Select Mode**: Choose 計畫 / 代理-安全 / 代理-危險
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

#### ✅ 確認選項（安全模式）
當出現確認視窗時，提供 1/2/3/4 選項：
1. Yes，開始執行
2. Yes，在這專案中永遠同意這件事（寫入 workspace settings）
3. No，拒絕
4. 其他想法（輸入自定義回覆）

### ⚡ 代理-危險模式 (Agent-Danger)
- 所有命令自動執行，不需確認
- 適合完全信任 AI 的自動化工作流程
- ⚠️ **警告**：請謹慎使用，AI 可能會執行破壞性操作

## ⚙️ Settings

| Setting | Description | Default |
|---------|-------------|---------|
| `blueMonster.model` | Preferred Copilot model ID | (auto) |
| `blueMonster.reasoningEffort` | Reasoning effort for supported models | `medium` |
| `blueMonster.terminalConfirmation` | Terminal command confirmation mode | `chat` |
| `blueMonster.dangerMode` | Enable file and VS Code command tools | `false` |
| `blueMonster.safeMode.*` | Safe-mode confirmation toggles | `true` |

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
