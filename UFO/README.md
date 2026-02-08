<p align="center">
  <img src="extension/resources/ufo.svg" alt="UFO" width="120">
</p>

<h1 align="center">UFO 🛸</h1>

<p align="center">
  <strong>The Control Center of VSMONSTER</strong><br>
  <em>Plan it. Queue it. Let BlueMonster build it.</em>
</p>

---

## What is UFO?

UFO is the brain of VSMONSTER. It's a VS Code extension that sits in your sidebar and manages everything — from the moment a request comes in, to the moment the finished code gets delivered back to your phone.

When you send a message like *"Build me a login page with OAuth"*, UFO doesn't just blindly forward it. It:

1. **Interviews you** — Asks clarifying questions to understand exactly what you want
2. **Writes a spec** — Creates a detailed task specification document
3. **Manages the queue** — Organizes tasks by priority and dependencies
4. **Dispatches work** — Hands approved tasks to BlueMonster for execution
5. **Reports back** — Sends completion notifications to your phone

Think of UFO as the project manager that never sleeps.

---

## What You See

UFO provides a real-time dashboard in your VS Code sidebar:

- **Connection status** — Gateway, channels, and public URL at a glance
- **Task queue** — Pending → Approved → In Progress → Done, with counts
- **BlueMonster status** — What's currently being worked on
- **Channel info** — Which messaging platforms are connected
- **Live console** — Real-time logs of everything happening

---

## Task Workflow

```
📱 Your message arrives
       ↓
🛸 UFO creates a task spec
       ↓
📋 Task enters the queue (Pending)
       ↓
✅ You approve it (or UFO auto-approves)
       ↓
👾 BlueMonster picks it up and starts coding
       ↓
📱 You get notified when it's done
```

### Queue Folders

UFO organizes tasks into clear stages:

| Stage | What happens |
|-------|-------------|
| **Pending** | Task spec created, waiting for your approval |
| **Approved** | You approved it, ready for BlueMonster |
| **In Progress** | BlueMonster is actively working on it |
| **Done** | Completed and delivered |

You can approve, reject, or reprioritize tasks directly from the sidebar.

---

## Key Features

**Task Interview** — UFO doesn't just take orders. It has a conversation with you (via Copilot) to clarify requirements before creating a spec. This prevents "I didn't mean that" moments.

**Spec-Driven Development** — Every task gets a written spec before execution. This means BlueMonster knows exactly what to build, and you have a record of what was requested.

**Multi-Channel Awareness** — UFO knows which messaging platform the request came from (LINE, Telegram, Discord) and responds through the same channel.

**Prompt Studio** — Built-in editor for managing and customizing prompts and personas.

**Settings Panel** — Configure messaging platforms, models, and Gateway connection without touching config files.

---

## Getting Started

1. Install the VSMONSTER extension in VS Code
2. Look for the 🛸 UFO icon in the sidebar
3. Connect to your Gateway (default: `ws://localhost:3000`)
4. Start creating tasks — either from VS Code or from your phone

---

## Requirements

- VS Code 1.90.0+
- GitHub Copilot extension (any plan)
- VSMONSTER Gateway running

---

## Part of VSMONSTER

UFO 🛸 is the control center. It works with:
- **BlueMonster** 👾 — The one who actually writes code
- **Holography** 🛰️ — The one who translates your phone messages

Together, they form VSMONSTER.

---

MIT License
