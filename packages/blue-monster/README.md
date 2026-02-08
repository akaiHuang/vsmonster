<p align="center">
  <img src="resources/blueMonster.svg" alt="BlueMonster" width="120">
</p>

<h1 align="center">BlueMonster 👾</h1>

<p align="center">
  <strong>The AI Worker of VSMONSTER</strong><br>
  <em>Give it a task. It writes the code. In parallel.</em>
</p>

---

## What is BlueMonster?

BlueMonster is the one who actually does the work. It's a VS Code extension powered by GitHub Copilot SDK that can write code, run terminal commands, read files, analyze images — and do all of it **simultaneously across multiple tasks**.

While regular Copilot handles one conversation at a time, BlueMonster runs tasks in parallel in the background. Queue 10 tasks, go get coffee, come back to all of them done.

---

## Three Modes

BlueMonster is the only agent that actually writes code — and it can run multiple tasks in parallel.

It adapts to your comfort level:

| Mode | What it does | Best for |
|------|-------------|----------|
| **Plan** 📋 | Chat only — no commands, no file changes | Discussing ideas, learning, planning |
| **Agent-Safe** 🔒 | Executes freely, but asks before anything risky | Daily development (recommended) |
| **Agent-Danger** ⚡ | Full autonomy — no confirmations needed | Trusted automation, batch jobs |

### Safe Mode — You Stay in Control

In Agent-Safe mode, BlueMonster asks for your permission before:

| Action | Example |
|--------|---------|
| Deleting files | `rm`, `rmdir` |
| Git operations | `git push`, `git reset --hard` |
| Package installs | `npm install`, `pip install` |
| Network access | `curl`, `ssh`, `wget` |
| System commands | `sudo`, `chmod`, `kill` |
| Docker operations | `docker rm`, `docker stop` |

When prompted, you choose:
1. **Yes** — run it this time
2. **Yes, always for this project** — never ask again in this workspace
3. **No** — reject
4. **Other idea** — suggest an alternative

---

## Parallel Task Execution

This is BlueMonster's superpower. Each task runs independently with:

- Its own conversation context
- Its own file operations
- Its own terminal session

You can switch between active tasks without interrupting any of them. The sidebar shows real-time status:

| Status | Meaning |
|--------|---------|
| 🔵 **Running** | AI is actively working |
| 🟠 **Waiting** | Needs your confirmation |
| 🟢 **Active** | In memory, ready to continue |
| ⚪ **History** | Saved to disk, loadable anytime |

---

## What BlueMonster Can Do

**Write & edit code** — Create files, modify existing code, refactor across files

**Run terminal commands** — Install packages, run builds, execute scripts, run tests

**Analyze images** — Send screenshots, mockups, or error images — BlueMonster sees and understands them

**Read your project** — Understands your codebase structure, reads files, checks git status

**Task memory** — Each task remembers its full conversation history, even after you switch away

---

## Quick Start

1. Click the 👾 BlueMonster icon in the VS Code sidebar
2. Choose your mode (Agent-Safe recommended for starters)
3. Type a task: *"Create a REST API with Express and add unit tests"*
4. Watch it work — or start another task while it runs

### Commands

| Command | What it does |
|---------|-------------|
| `/help` | Show available commands |
| `/model list` | See available AI models |
| `/model <name>` | Switch to a different model |

---

## Settings

| Setting | What it controls | Default |
|---------|-----------------|---------|
| `blueMonster.model` | Preferred AI model | auto |
| `blueMonster.reasoningEffort` | How deep the AI thinks | medium |
| `blueMonster.dangerMode` | Enable file & VS Code tools | off |
| `blueMonster.safeMode.*` | Which actions need confirmation | all on |

---

## Requirements

- VS Code 1.90.0+
- GitHub Copilot extension (any plan — Free, Pro, Pro+, or Business)
- Works with Gemini 3 Pro, Claude, GPT, and other models available through Copilot

---

## Part of VSMONSTER

BlueMonster 👾 is the task worker. It works with:
- **UFO** 🛸 — The control center that plans and dispatches tasks
- **Holography** 🛰️ — The messaging bridge that connects your phone

Together, they form VSMONSTER.

---

MIT License
