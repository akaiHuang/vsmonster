# VSMONSTER — Command your AI squad from your phone

## Executive Summary

**VSMONSTER** turns VS Code into an autonomous AI development factory you can control from your phone. 🚀

You text an idea on LINE / Telegram / Discord  
→ **UFO 🛸** (Gemini 3 Pro Reasoning Engine) breaks it down  
→ **BlueMonster 👾** (Gemini 3 Pro Parallel Executor) writes code in parallel  
→ results are sent back to your phone.

**Key innovations:**
- Powered entirely by **Gemini 3 Pro** (1M+ token context + native multimodal Vision) ✨
- True parallel execution (5–10 tasks at once) ⚡
- Full phone-based workflow (no need to sit at desk) 📱
- Zero extra API cost (runs on your Copilot subscription) 💰

From napkin sketch to production code — **while you sleep.** 😴

## Inspiration

Every developer has been there: you're on the train, in bed, or walking the dog — and suddenly you have an idea or a bug to fix.
Traditional AI tools force you to sit at your desk and babysit every prompt.

**What if your computer could just… start coding the moment you text it?**

That's VSMONSTER.

## What It Does

VSMONSTER turns VS Code into an autonomous AI development factory with three core agents:

- **UFO 🛸 (Control Center)** — Receives your requests, breaks them into task specs, manages the work queue, and dispatches approved tasks
- **BlueMonster 👾 (Task Worker)** — Executes tasks using AI models including Gemini 3 Pro — writing code, running terminals, analyzing images, all in parallel
- **Holography 🛰️ (Message Translator)** — Bridges your phone messages (LINE/Telegram/Discord) into commands the system understands

**Real-world scenario:**
1. You're walking your dog
2. You text on Telegram: "Create a REST API with user authentication and write tests"
3. UFO 🛸 decomposes this into subtasks (schema, routes, middleware, tests)
4. BlueMonster 👾 executes them in parallel using Gemini 3 Pro
5. Your phone buzzes: "4/4 tasks complete. Preview ready."
6. You approve from your phone — code is committed

## How We Built It

VSMONSTER is built as three independent modules, all powered by **Gemini 3 Pro**:

**🛸 UFO – Gemini 3 Pro Reasoning Engine**  
UFO uses Gemini 3 Pro's advanced reasoning to run a "Task Interview" system: analyzes project context, asks clarifying questions, and generates a formal Task Spec with dependency graph before dispatching.

**👾 BlueMonster – Gemini 3 Pro Parallel Executor**  
BlueMonster runs tasks in true parallel. Thanks to Gemini 3 Pro’s native multimodal capabilities, it can directly understand screenshots, UI mockups, and error images sent from the phone.

**🛰️ Holography – Gemini 3 Pro Context Bridge**  
Holography normalizes messages, images, and media from LINE/Telegram/Discord into a unified Gemini context object, allowing Gemini 3 Pro to maintain long-term conversation memory across platforms.

**Module READMEs** → [UFO 🛸](UFO/README.md) · [BlueMonster 👾](packages/blue-monster/README.md) · [Holography 🛰️](packages/holography/README.md)

**Tech Stack:**  
TypeScript monorepo (pnpm workspaces) · VS Code Extension API + Copilot SDK · Express + WebSocket · Next.js 14 · LINE Bot SDK / grammy / discord.js

## Challenges We Ran Into

- **VS Code Webview CSP**: Inline scripts are blocked by VS Code's HTTP-level Content Security Policy, even with correct nonces. Solved by using external JS files loaded via `webview.asWebviewUri()` and passing configuration through HTML `data-*` attributes.
- **Parallel task isolation**: Each BlueMonster task needs independent state, chat history, and terminal sessions. Built a task isolation system with per-task memory and context switching.
- **Real-time coordination**: Synchronizing task status across Gateway, VS Code extensions, and the Mission Control dashboard required careful WebSocket event design and state reconciliation.
- **Security**: Ensuring tokens and API keys are never exposed to the AI agent, while still allowing the agent to execute code freely. Implemented whitelist + handshake verification and token detection guards.

## Accomplishments We're Proud Of

- **True AFK development** — We actually fix bugs and ship features from our phones daily
- **Zero marginal cost** — Complex multi-step tasks run on flat-rate Copilot subscription, no per-token billing anxiety
- **Parallel execution** — BlueMonster runs multiple tasks simultaneously, unlike traditional one-at-a-time Copilot usage
- **Phone-based code review** — Mission Control lets you review diffs, approve tasks, and check media output from mobile

## What We Learned

- The biggest insight: **AI agents don't need new interfaces — they need to live where developers already work.** VS Code is the world's most popular editor. By making it the "brain" and phones the "remote control", we eliminated the adoption friction that kills most AI tools.
- Gemini 3 Pro's reasoning capabilities were crucial for task decomposition — breaking "build me a dashboard" into concrete, ordered subtasks is fundamentally a reasoning problem.

## What's Next

- **MCP (Model Context Protocol) expansion** — Plug in email, browser automation, database management as tools BlueMonster can use
- **Self-evolution system** — Let BlueMonster write its own tool scripts when it encounters capabilities it doesn't have yet
- **Voice control** — Integration with speech-to-text for truly hands-free development
- **Team mode** — Multiple developers sharing a VSMONSTER instance, with role-based task assignment

## Built With

`typescript` `vscode` `gemini-3-pro-preview` `copilot-sdk` `express` `websocket` `nextjs` `line-bot-sdk` `telegram` `discord` `tailwindcss` `zustand` `pnpm`

## Try It

- **GitHub**: [github.com/akaiHuang/vsmonster](https://github.com/akaiHuang/vsmonster)
- **VS Code Marketplace**: [VSMONSTER Extension](https://marketplace.visualstudio.com/items?itemName=vsmonster.vsmonster)

---

*UFO 🛸 + BlueMonster 👾 + Holography 🛰️ = VSMONSTER — Stop sitting at your desk. Start coding from anywhere.*
