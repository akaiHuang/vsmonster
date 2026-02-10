import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { spawn, type ChildProcessWithoutNullStreams } from "child_process";
import { geminiClient } from "./gemini-client";
import { GatewayClient } from "./gateway-client";
import { getDashboardHtml, type DashboardState } from "./dashboard";
import {
  getPromptStudioHtml,
  loadPromptStudioState,
  savePromptStudioState,
  type PromptStudioState
} from "./prompt-studio";

const STATUS_DIRS = [
  { id: "pending", label: "⏳ Pending", icon: "clock" },
  { id: "approved", label: "✅ Approved", icon: "pass" },
  { id: "in-progress", label: "🔄 Running", icon: "sync~spin" },
  { id: "done", label: "✨ Done", icon: "check-all" }
] as const;

// Suppress noisy Node.js warnings in Extension Host console
const originalEmitWarning = process.emitWarning;
process.emitWarning = (warning, ...args) => {
  if (typeof warning === "string") {
    if (warning.includes("punycode") || warning.includes("SQLite")) {
      return;
    }
  } else if (typeof warning === "object" && warning?.message) {
    if (warning.message.includes("punycode") || warning.message.includes("SQLite")) {
      return;
    }
  }
  return (originalEmitWarning as any).call(process, warning, ...args);
};

type TaskStatus = (typeof STATUS_DIRS)[number]["id"];
const MAX_RECENT_MESSAGE_IDS = 200;
const DEFAULT_TASK_FOLDER = "pending";

// ============================================================
// Public URL / Tunnel helpers
// ============================================================

function stripTrailingSlashes(url: string): string {
  return String(url || "").replace(/\/+$/, "");
}

function isLocalhostUrl(url: string): boolean {
  return /^(https?:\/\/)?(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(String(url || ""));
}

/** Convert a WebSocket gateway URL (ws:// / wss://) to its HTTP equivalent. */
function gatewayWsToHttp(wsUrl: string): string {
  return String(wsUrl || "")
    .replace(/^ws:/, "http:")
    .replace(/^wss:/, "https:")
    .replace(/\/+$/, "");
}

type CloudflaredQuickTunnelState = {
  localUrl: string;
  publicUrl?: string;
  proc?: ChildProcessWithoutNullStreams;
  inFlight?: Promise<string>;
};

const cloudflaredTunnel: CloudflaredQuickTunnelState = { localUrl: "" };

async function ensureCloudflaredQuickTunnel(localUrlRaw: string, output?: vscode.OutputChannel): Promise<string> {
  const localUrl = stripTrailingSlashes(localUrlRaw);
  if (!localUrl) {
    throw new Error("No localUrl provided for tunnel");
  }

  // Reuse active tunnel for the same local URL.
  if (cloudflaredTunnel.publicUrl && cloudflaredTunnel.proc && !cloudflaredTunnel.proc.killed && cloudflaredTunnel.localUrl === localUrl) {
    return cloudflaredTunnel.publicUrl;
  }
  if (cloudflaredTunnel.inFlight && cloudflaredTunnel.localUrl === localUrl) {
    return cloudflaredTunnel.inFlight;
  }

  // If previous proc exists (or URL changed), stop it before starting a new one.
  try {
    if (cloudflaredTunnel.proc && !cloudflaredTunnel.proc.killed) {
      cloudflaredTunnel.proc.kill();
    }
  } catch {}

  cloudflaredTunnel.localUrl = localUrl;
  cloudflaredTunnel.publicUrl = undefined;

  const startedAt = Date.now();
  const promise = new Promise<string>((resolve, reject) => {
    let settled = false;
    let timer: NodeJS.Timeout | undefined;
    const settle = (err?: any, value?: string) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      try { proc.stdout.removeAllListeners(); } catch {}
      try { proc.stderr.removeAllListeners(); } catch {}
      if (err) reject(err);
      else resolve(value || "");
    };

    const proc = spawn(
      "cloudflared",
      ["tunnel", "--url", localUrl, "--no-autoupdate"]
    );
    cloudflaredTunnel.proc = proc;

    const buf: { text: string } = { text: "" };
    const tryExtract = (chunk: Buffer | string) => {
      buf.text += chunk.toString();
      const m = buf.text.match(/https?:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (m && m[0]) {
        const url = stripTrailingSlashes(m[0]);
        cloudflaredTunnel.publicUrl = url;
        output?.appendLine?.(`[UFO] Cloudflared tunnel ready: ${url} -> ${localUrl}`);
        settle(undefined, url);
      }
    };

    proc.stdout.on("data", tryExtract);
    proc.stderr.on("data", tryExtract);
    proc.on("error", (err) => settle(err));
    proc.on("exit", (code) => {
      if (cloudflaredTunnel.publicUrl) return;
      settle(new Error(`cloudflared exited before URL was ready (code=${code ?? "unknown"})`));
    });

    // Quick tunnel should be ready fast; fail closed if it doesn't.
    timer = setTimeout(() => {
      settle(new Error(`cloudflared tunnel timed out after ${Math.round((Date.now() - startedAt) / 1000)}s`));
    }, 20000);
  });

  cloudflaredTunnel.inFlight = promise.finally(() => {
    if (cloudflaredTunnel.inFlight === promise) cloudflaredTunnel.inFlight = undefined;
  });
  return cloudflaredTunnel.inFlight;
}

function stopCloudflaredQuickTunnel(): void {
  try {
    if (cloudflaredTunnel.proc && !cloudflaredTunnel.proc.killed) {
      cloudflaredTunnel.proc.kill();
    }
  } catch {}
  cloudflaredTunnel.proc = undefined;
  cloudflaredTunnel.publicUrl = undefined;
  cloudflaredTunnel.inFlight = undefined;
  cloudflaredTunnel.localUrl = "";
}

type UfoRole = "user" | "assistant";

interface UfoChatEntry {
  role: UfoRole;
  content: string;
}

interface UfoSession {
  key: string;
  userId: string;
  channel: string;
  history: UfoChatEntry[];
  todoItems?: Array<{ question: string; answer?: string }>;
  todoIndex?: number;
  taskTitle?: string;
  taskId?: string;
  taskDir?: string;
  mode?: "chat" | "work_advice" | "awaiting_confirmation" | "awaiting_approval";
  pendingDelegation?: {
    originalText: string;
    askedAt: string;
    taskId?: string;
    taskDir?: string;
    readmePath?: string;
    // Multi-agent: multiple task bundles created from one request.
    tasks?: Array<{ taskId: string; taskDir: string; readmePath: string; title: string }>;
    multiAgent?: boolean;
  };
  pendingBmConfirmations?: Array<{ id: string; command: string; category: string; timestamp: number; age: number }>;
  bmRun?: {
    taskId?: string;
    taskDir?: string;
    startedAt: string;
    // Multi-agent group metadata (best-effort)
    runId?: string;
    tasks?: Array<{ taskId: string; taskDir: string; title: string }>;
    remaining?: number;
  };
}

let promptStudioState: PromptStudioState | null = null;
const ENV_KEYS = {
  port: "VSMONSTER_PORT",
  publicUrl: "VSMONSTER_PUBLIC_URL",
  lineAccessToken: "LINE_CHANNEL_ACCESS_TOKEN",
  lineSecret: "LINE_CHANNEL_SECRET",
  lineWebhookSecret: "LINE_WEBHOOK_SECRET",
  telegramBotToken: "TELEGRAM_BOT_TOKEN",
  telegramWebhookUrl: "TELEGRAM_WEBHOOK_URL",
  telegramWebhookSecret: "TELEGRAM_WEBHOOK_SECRET",
  discordBotToken: "DISCORD_BOT_TOKEN",
  discordApplicationId: "DISCORD_APPLICATION_ID",
  discordPublicKey: "DISCORD_PUBLIC_KEY"
} as const;

class TaskItem extends vscode.TreeItem {
  public readonly fullPath?: string;
  public readonly status?: TaskStatus;
  public readonly isDirectory: boolean;

  constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    fullPath?: string,
    status?: TaskStatus,
    isDirectory: boolean = false
  ) {
    // 解析任務名稱，讓顯示更友善
    const displayLabel = TaskItem.formatLabel(label, isDirectory);
    super(displayLabel, collapsibleState);
    this.fullPath = fullPath;
    this.status = status;
    this.isDirectory = isDirectory;

    // 設定圖示
    if (isDirectory) {
      this.iconPath = new vscode.ThemeIcon("folder");
      this.contextValue = "taskFolder"; // 用於顯示 inline 按鈕
    } else if (fullPath) {
      this.iconPath = new vscode.ThemeIcon("file-text");
      this.resourceUri = vscode.Uri.file(fullPath);
      this.command = {
        command: "vscode.open",
        title: "Open",
        arguments: [vscode.Uri.file(fullPath)]
      };
      // 加入說明文字（顯示在右側）
      this.description = TaskItem.formatDescription(label);
    }
  }

  // 將檔名轉換成友善的顯示名稱
  private static formatLabel(label: string, isDirectory: boolean): string {
    if (isDirectory) {
      // 如果是資料夾，試著提取任務名稱
      const parts = label.split("-");
      if (parts.length > 4) {
        // 格式: 2026-02-03T05-31-08-171Z-hello-world
        // 提取最後部分作為任務名
        const taskName = parts.slice(4).join("-");
        return taskName || label;
      }
      return label;
    }
    
    // 如果是 .md 檔案
    if (label.endsWith(".md")) {
      const nameWithoutExt = label.slice(0, -3);
      // 嘗試提取有意義的名稱
      const parts = nameWithoutExt.split("-");
      if (parts.length > 4) {
        const taskName = parts.slice(4).join(" ");
        return taskName || nameWithoutExt;
      }
      return nameWithoutExt;
    }
    
    return label;
  }

  // 產生說明文字（顯示時間或其他資訊）
  private static formatDescription(label: string): string {
    // 嘗試從檔名提取時間
    const match = label.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})/);
    if (match) {
      const [, year, month, day, hour, minute] = match;
      return `${month}/${day} ${hour}:${minute}`;
    }
    return "";
  }
}

class TaskQueueProvider implements vscode.TreeDataProvider<TaskItem> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<TaskItem | undefined>();
  public readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  constructor(
    private readonly tasksRoot: string,
    private readonly onRefresh?: () => void
  ) {}

  refresh(): void {
    this.onDidChangeTreeDataEmitter.fire(undefined);
    if (this.onRefresh) {
      this.onRefresh();
    }
  }

  getTreeItem(element: TaskItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: TaskItem): TaskItem[] {
    if (!element) {
      return STATUS_DIRS.map((status) => {
        const item = new TaskItem(status.label, vscode.TreeItemCollapsibleState.Collapsed, undefined, status.id);
        item.iconPath = new vscode.ThemeIcon(status.icon);
        return item;
      });
    }

    if (!element.status) {
      return [];
    }

    const dirPath = element.isDirectory && element.fullPath
      ? element.fullPath
      : path.join(this.tasksRoot, element.status);
    if (!fs.existsSync(dirPath)) {
      return [];
    }

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const items: TaskItem[] = [];

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        items.push(
          new TaskItem(entry.name, vscode.TreeItemCollapsibleState.Collapsed, fullPath, element.status, true)
        );
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        items.push(new TaskItem(entry.name, vscode.TreeItemCollapsibleState.None, fullPath, element.status));
      }
    }

    return items;
  }
}

// 單一狀態的 TaskProvider（用於獨立視窗）
class SingleStatusTaskProvider implements vscode.TreeDataProvider<TaskItem> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<TaskItem | undefined>();
  public readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  constructor(
    private readonly tasksRoot: string,
    private readonly status: TaskStatus,
    private readonly onRefresh?: () => void
  ) {}

  refresh(): void {
    this.onDidChangeTreeDataEmitter.fire(undefined);
    if (this.onRefresh) {
      this.onRefresh();
    }
  }

  getTreeItem(element: TaskItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: TaskItem): TaskItem[] {
    const dirPath = element?.fullPath ?? path.join(this.tasksRoot, this.status);
    
    if (!fs.existsSync(dirPath)) {
      return [];
    }

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const items: TaskItem[] = [];

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        items.push(
          new TaskItem(entry.name, vscode.TreeItemCollapsibleState.Collapsed, fullPath, this.status, true)
        );
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        items.push(new TaskItem(entry.name, vscode.TreeItemCollapsibleState.None, fullPath, this.status));
      }
    }

    // 按時間排序（最新的在前）
    items.sort((a, b) => {
      const nameA = a.label?.toString() || "";
      const nameB = b.label?.toString() || "";
      return nameB.localeCompare(nameA);
    });

    return items;
  }
}

class UfoDashboardProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private readonly consoleHistoryKey = "ufo.consoleHistory.v1";
  private readonly maxConsoleEntries = 500;
  private consoleHistory: Array<{ ts: number; tag: string; message: string; tagClass: string }> = [];
  private persistTimer?: NodeJS.Timeout;
  private interview: null | {
    id: string;
    createdAt: number;
    step: number;
    answers: { goal?: string; output?: string; acceptance?: string; constraints?: string };
    transcript: Array<{ role: "user" | "assistant"; content: string; ts: number }>;
    createdTask?: { taskId: string; taskDir: string; title: string };
  } = null;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly getState: () => DashboardState,
    private readonly onCommand: (command: string) => void,
    private readonly onCreateTaskFromInterview: (payload: {
      title: string;
      summary: string;
      interview: { goal: string; output: string; acceptance: string; constraints: string; transcript: string };
    }) => Promise<{ taskId: string; taskDir: string; title: string }>,
    private readonly onRunTaskInBlueMonster: (payload: { taskId: string; taskDir: string; title: string }) => Promise<{ text: string; previewUrl?: string; pendingConfirmations?: any[] }>,
    private readonly output: vscode.OutputChannel
  ) {
    // Load persisted console history for the webview console tab.
    const existing = this.context.globalState.get<any[]>(this.consoleHistoryKey, []);
    if (Array.isArray(existing)) {
      this.consoleHistory = existing
        .filter((e) => e && typeof e === "object")
        .map((e: any) => ({
          ts: typeof e.ts === "number" ? e.ts : Date.now(),
          tag: typeof e.tag === "string" ? e.tag : "info",
          message: typeof e.message === "string" ? e.message : "",
          tagClass: typeof e.tagClass === "string" ? e.tagClass : "info"
        }))
        .slice(-this.maxConsoleEntries);
    }
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri]
    };
    view.webview.html = getDashboardHtml(view.webview, this.getState(), this.context.extensionUri);
    // Hydrate console history on first render.
    try {
      if (this.consoleHistory.length > 0) {
        view.webview.postMessage({ type: "log_history", entries: this.consoleHistory });
      }
    } catch {}
    view.webview.onDidReceiveMessage((message) => {
      if (!message || typeof message !== "object") {
        return;
      }
      if (message.type === "command" && typeof message.command === "string") {
        this.onCommand(message.command);
      }
      if (message.type === "task_open_folder" && typeof message.taskDir === "string") {
        const taskDir = String(message.taskDir || "");
        if (taskDir) {
          void vscode.commands.executeCommand("revealFileInOS", vscode.Uri.file(taskDir));
        }
      }
      if (message.type === "task_open_bm") {
        const taskId = typeof message.taskId === "string" ? message.taskId : "";
        const taskDir = typeof message.taskDir === "string" ? message.taskDir : "";
        const title = typeof message.title === "string" ? message.title : "";
        if (taskId && taskDir) {
          void (async () => {
            try { await vscode.commands.executeCommand("blueMonster.createExternalTask", taskId, taskDir, title || taskId); } catch {}
            try { await vscode.commands.executeCommand("blueMonster.openView"); } catch {}
            try { await vscode.commands.executeCommand("blueMonster.setTaskFolder", taskDir); } catch {}
          })();
        }
      }
      if (message.type === "console_clear") {
        this.clearConsoleHistory();
      }
      if (message.type === "task_interview_start") {
        void this.startInterview();
      }
      if (message.type === "task_interview_user" && typeof message.text === "string") {
        void this.handleInterviewUserMessage(message.text);
      }
      if (message.type === "task_interview_create") {
        void this.finalizeInterviewTask();
      }
      if (message.type === "task_send_to_bm") {
        const taskId = typeof message.taskId === "string" ? message.taskId : "";
        const taskDir = typeof message.taskDir === "string" ? message.taskDir : "";
        const title = typeof message.title === "string" ? message.title : "";
        if (taskId && taskDir) {
          void this.runTaskInBlueMonster({ taskId, taskDir, title: title || taskId });
        }
      }
      if (message.type === "task_split_multi_agent") {
        const taskId = typeof message.taskId === "string" ? message.taskId : "";
        const taskDir = typeof message.taskDir === "string" ? message.taskDir : "";
        const title = typeof message.title === "string" ? message.title : "";
        if (taskDir) {
          void this.splitTaskIntoMultiAgent({ taskId: taskId || path.basename(taskDir), taskDir, title: title || taskId || path.basename(taskDir) });
        }
      }
      // Sync settings saved via Gateway API back to VS Code config
      if (message.type === "settings_synced" && message.ufoSettings) {
        const config = vscode.workspace.getConfiguration("ufo");
        const s = message.ufoSettings;
        if (s.chatModel) { config.update("models.chat", s.chatModel, true); }
        if (s.specModel) { config.update("models.spec", s.specModel, true); }
        if (s.opusModel) { config.update("models.opus", s.opusModel, true); }
      }
    });
  }

  update(): void {
    if (!this.view) {
      return;
    }
    this.view.webview.postMessage({
      type: "state",
      state: this.getState()
    });
  }

  rerender(): void {
    if (!this.view) {
      return;
    }
    this.view.webview.html = getDashboardHtml(this.view.webview, this.getState(), this.context.extensionUri);
  }

  log(tag: string, message: string, tagClass: string = "info"): void {
    try {
      const entry = { ts: Date.now(), tag, message, tagClass };
      this.consoleHistory.push(entry);
      if (this.consoleHistory.length > this.maxConsoleEntries) {
        this.consoleHistory = this.consoleHistory.slice(-this.maxConsoleEntries);
      }
      this.schedulePersistConsoleHistory();
      if (this.view) {
        this.view.webview.postMessage({ type: "log", ...entry });
      }
    } catch {
      // webview may be disposed
    }
  }

  private schedulePersistConsoleHistory(): void {
    if (this.persistTimer) {
      return;
    }
    this.persistTimer = setTimeout(() => {
      this.persistTimer = undefined;
      // Best effort persistence; don't block UI.
      void this.context.globalState.update(this.consoleHistoryKey, this.consoleHistory).then(
        () => undefined,
        () => undefined
      );
    }, 500);
  }

  private clearConsoleHistory(): void {
    this.consoleHistory = [];
    try {
      void this.context.globalState.update(this.consoleHistoryKey, this.consoleHistory);
    } catch {}
  }

  private post(payload: any): void {
    try {
      this.view?.webview.postMessage(payload);
    } catch {}
  }

  private async startInterview(): Promise<void> {
    this.interview = {
      id: `iv-${Date.now().toString(36)}`,
      createdAt: Date.now(),
      step: 0,
      answers: {},
      transcript: [],
    };
    this.post({ type: "task_interview_reset" });
    this.appendInterviewAssistant(
      "我會用 4 個問題把需求釐清，然後幫你建立 UFO 任務。\n" +
      "你也可以直接一次回覆四項（目標/交付物/驗收/限制），我會自動填好。\n\n" +
      "第一題：你想完成什麼？一句話描述就好。"
    );
    this.post({ type: "task_interview_state", canCreate: false, createdTask: null });
  }

  private appendInterviewAssistant(text: string): void {
    if (!this.interview) return;
    this.interview.transcript.push({ role: "assistant", content: text, ts: Date.now() });
    this.post({ type: "task_interview_message", role: "assistant", content: text });
  }

  private appendInterviewUser(text: string): void {
    if (!this.interview) return;
    this.interview.transcript.push({ role: "user", content: text, ts: Date.now() });
    this.post({ type: "task_interview_message", role: "user", content: text });
  }

  private async handleInterviewUserMessage(textRaw: string): Promise<void> {
    const text = String(textRaw || "").trim();
    if (!text) return;
    if (!this.interview) {
      await this.startInterview();
    }
    if (!this.interview) return;

    this.appendInterviewUser(text);

    const parseInterviewBlock = (
      raw: string
    ): Partial<{ goal: string; output: string; acceptance: string; constraints: string }> => {
      const normalized = String(raw || "").replace(/\r/g, "");
      const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const fieldKeys = {
        goal: ["目標", "目的", "需求", "Goal", "goal"],
        output: ["交付物", "交付", "產出", "Output", "output", "Deliverable", "deliverable"],
        acceptance: ["驗收標準", "驗收", "完成標準", "Acceptance", "acceptance", "Done", "done"],
        constraints: ["限制", "偏好", "注意事項", "Constraint", "constraint", "Constraints", "constraints"],
      } as const;

      const allKeys = Object.values(fieldKeys).flat().map(escapeRe).join("|");
      const extract = (keys: readonly string[]): string => {
        const ks = keys.map(escapeRe).join("|");
        const re = new RegExp(
          `(?:^|\\n)\\s*(?:[-*]\\s*)?(?:${ks})\\s*[:：]\\s*([\\s\\S]*?)(?=\\n\\s*(?:[-*]\\s*)?(?:${allKeys})\\s*[:：]|$)`,
          "i"
        );
        const m = normalized.match(re);
        return m && m[1] ? String(m[1]).trim() : "";
      };

      const out: Partial<{ goal: string; output: string; acceptance: string; constraints: string }> = {};
      const goal = extract(fieldKeys.goal);
      const output = extract(fieldKeys.output);
      const acceptance = extract(fieldKeys.acceptance);
      const constraints = extract(fieldKeys.constraints);
      if (goal) out.goal = goal;
      if (output) out.output = output;
      if (acceptance) out.acceptance = acceptance;
      if (constraints) out.constraints = constraints;
      return out;
    };

    const a = this.interview.answers;
    const wasComplete =
      Boolean(String(a.goal || "").trim()) &&
      Boolean(String(a.output || "").trim()) &&
      Boolean(String(a.acceptance || "").trim()) &&
      Boolean(String(a.constraints || "").trim());

    const parsed = parseInterviewBlock(text);
    const filledAny = Object.values(parsed).some((v) => typeof v === "string" && v.trim().length > 0);

    if (parsed.goal) a.goal = parsed.goal;
    if (parsed.output) a.output = parsed.output;
    if (parsed.acceptance) a.acceptance = parsed.acceptance;
    if (parsed.constraints) a.constraints = parsed.constraints;

    // If no labels were used, treat the message as the answer to the current step.
    const step = this.interview.step;
    if (!filledAny) {
      if (step === 0) a.goal = text;
      else if (step === 1) a.output = text;
      else if (step === 2) a.acceptance = text;
      else if (step === 3) a.constraints = text;
      else if (step >= 4 && a.constraints) {
        // Allow extra notes after completion.
        a.constraints = `${String(a.constraints).trim()}\n${text}`.trim();
      }
    }

    const isComplete =
      Boolean(String(a.goal || "").trim()) &&
      Boolean(String(a.output || "").trim()) &&
      Boolean(String(a.acceptance || "").trim()) &&
      Boolean(String(a.constraints || "").trim());

    if (!isComplete) {
      if (!String(a.goal || "").trim()) {
        this.interview.step = 0;
        this.appendInterviewAssistant("第一題：你想完成什麼？一句話描述就好。");
        return;
      }
      if (!String(a.output || "").trim()) {
        this.interview.step = 1;
        this.appendInterviewAssistant("第二題：你希望交付物是什麼？例如：一個網頁、某個功能、修一個 bug、寫文件、做部署。");
        return;
      }
      if (!String(a.acceptance || "").trim()) {
        this.interview.step = 2;
        this.appendInterviewAssistant("第三題：你的驗收標準是什麼？你怎麼判斷『完成了』？可以列 2-5 點。");
        return;
      }
      this.interview.step = 3;
      this.appendInterviewAssistant("第四題：有沒有任何限制/偏好？例如：不要動哪些資料夾、要用/不要用的技術、期限、額外注意事項。沒有就回『無』。");
      return;
    }

    this.interview.step = 4;

    if (!wasComplete) {
      const goal = a.goal || "";
      const output = a.output || "";
      const acceptance = a.acceptance || "";
      const constraints = a.constraints || "";
      this.appendInterviewAssistant(
        "收到。我已整理好訪談內容，可以建立任務。\n\n" +
          `- 目標：${goal}\n` +
          `- 交付：${output}\n` +
          `- 驗收：${acceptance}\n` +
          `- 限制：${constraints}\n\n` +
          "按下「建立任務」後，我會在 UFO/tasks/pending 建立交接包；接著到 Tasks 分頁的任務卡片按 Send / BlueMonster 就能啟動或切換過去。"
      );
    } else if (filledAny || step >= 4) {
      this.appendInterviewAssistant("已收到補充內容。如果 OK，請按「建立任務」。");
    }

    this.post({ type: "task_interview_state", canCreate: true, createdTask: null });
  }

  private async finalizeInterviewTask(): Promise<void> {
    if (!this.interview) {
      await this.startInterview();
    }
    if (!this.interview) return;
    const a = this.interview.answers;
    const goal = String(a.goal || "").trim();
    const output = String(a.output || "").trim();
    const acceptance = String(a.acceptance || "").trim();
    const constraints = String(a.constraints || "").trim();
    if (!goal || !output || !acceptance || !constraints) {
      this.appendInterviewAssistant("目前資訊還不完整。請把四題都回答完（或缺的補上）我才能建立任務。");
      return;
    }

    const transcriptText = this.interview.transcript
      .map((m) => `${m.role === "assistant" ? "UFO" : "User"}: ${m.content}`)
      .join("\n");

    this.post({ type: "task_interview_busy", busy: true });
    try {
      const title = goal.length > 60 ? goal.slice(0, 60) : goal;
      const summary = `${goal}\n\n交付物：${output}\n\n驗收：${acceptance}\n\n限制/偏好：${constraints}`;
      const created = await this.onCreateTaskFromInterview({
        title,
        summary,
        interview: { goal, output, acceptance, constraints, transcript: transcriptText }
      });
      this.interview.createdTask = created;
      this.appendInterviewAssistant(`✅ 已建立任務：${created.taskId}\n路徑：${created.taskDir}\n\n下一步：到 Tasks 分頁找到這個任務卡片，按 Send 送到 BlueMonster 執行，或按 BlueMonster 直接切換過去。`);
      this.post({ type: "task_interview_state", canCreate: true, createdTask: created });
    } catch (err) {
      this.appendInterviewAssistant(`❌ 建立任務失敗：${String(err)}`);
    } finally {
      this.post({ type: "task_interview_busy", busy: false });
    }
  }

  private async splitTaskIntoMultiAgent(payload: { taskId: string; taskDir: string; title: string }): Promise<void> {
    const taskId = String(payload.taskId || "").trim();
    const taskDir = String(payload.taskDir || "").trim();
    const title = String(payload.title || "").trim() || taskId;
    if (!taskDir || !fs.existsSync(taskDir)) {
      vscode.window.showWarningMessage("找不到任務資料夾，無法拆分。");
      return;
    }
    const readmePath = path.join(taskDir, "README.md");
    if (!fs.existsSync(readmePath)) {
      vscode.window.showWarningMessage("找不到 README.md，無法拆分。");
      return;
    }

    let sourceText = "";
    try {
      sourceText = fs.readFileSync(readmePath, "utf8");
    } catch (err) {
      vscode.window.showWarningMessage(`讀取 README.md 失敗：${String(err)}`);
      return;
    }

	    const cfg = vscode.workspace.getConfiguration("ufo");
	    const modelId = cfg.get<string>("models.spec", "gemini-3-pro-preview");
	    this.log("info", `[UFO] Multi-agent split requested: ${taskId}`, "info");

    let split: { groupTitle: string; tasks: MultiAgentSubtask[] } | null = null;
    try {
	      split = await splitTextToMultiAgentSubtasks({
	        sourceText,
	        modelId: modelId || "gemini-3-pro-preview",
	        output: this.output,
	        maxTasks: 6
	      });
    } catch (err) {
      this.log("error", `[UFO] Multi-agent split failed: ${String(err)}`, "error");
      vscode.window.showWarningMessage(`模型拆分失敗：${String(err)}`);
      return;
    }

    if (!split || !Array.isArray(split.tasks) || split.tasks.length < 2) {
      vscode.window.showWarningMessage("模型無法把任務拆成多個子任務（至少需要 2 個）。");
      return;
    }

    const groupSlug = slugify(split.groupTitle || title) || slugify(title) || "multi-agent";
    const groupId = `ma-${Date.now().toString(36)}-${groupSlug}`.replace(/-+$/g, "").slice(0, 80);
    const fakeSession: UfoSession = { key: "ui:local", userId: "local", channel: "ui", history: [] };
    const created = split.tasks.map((subtask, i) =>
      createPendingTaskBundleFromSubtask({
        context: this.context,
        session: fakeSession,
        groupId,
        index: i,
        total: split.tasks.length,
        requestText: sourceText,
        subtask
      })
    );

    // Leave a note in the original task folder for traceability.
    try {
      const note = [
        "# Multi-agent split",
        "",
        `- From: ${taskId}`,
        `- Group: ${groupId}`,
        `- At: ${new Date().toISOString()}`,
        "",
        "## Created subtasks (pending)",
        ...created.map((t, i) => `- (${i + 1}/${created.length}) ${t.title} [${t.taskId}]`),
        ""
      ].join("\n");
      fs.writeFileSync(path.join(taskDir, `split-${groupId}.md`), note, "utf8");
    } catch {}

    try {
      this.onCommand("ufo.refreshQueue");
    } catch {}

    vscode.window.showInformationMessage(`✅ 已拆成 ${created.length} 個子任務（pending）：${groupId}`);
  }

  private async runTaskInBlueMonster(payload: { taskId: string; taskDir: string; title: string }): Promise<void> {
    this.post({ type: "task_run_busy", busy: true });
    try {
      const res = await this.onRunTaskInBlueMonster(payload);
      this.appendInterviewAssistant(`🚀 已送出給 BlueMonster 執行。\n\n${res.text || ""}${res.previewUrl ? `\n\n預覽：${res.previewUrl}` : ""}`);
      if (Array.isArray(res.pendingConfirmations) && res.pendingConfirmations.length > 0) {
        this.appendInterviewAssistant(
          "⚠️ BlueMonster 需要確認一些動作（請到 BlueMonster 面板確認，或我之後也可以把確認按鈕加在這裡）。"
        );
      }
      this.post({ type: "task_interview_run_done", ok: true });
    } catch (err) {
      this.appendInterviewAssistant(`❌ 發送/執行失敗：${String(err)}`);
      this.post({ type: "task_interview_run_done", ok: false });
    } finally {
      this.post({ type: "task_run_busy", busy: false });
    }
  }
}

class PromptStudioPanel {
  private panel?: vscode.WebviewPanel;

  constructor(private readonly context: vscode.ExtensionContext) {}

  show(): void {
    if (this.panel) {
      this.panel.reveal();
      this.panel.webview.postMessage({ type: "state", state: promptStudioState });
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      "ufoPromptStudio",
      "UFO Prompt Studio",
      vscode.ViewColumn.Beside,
      { enableScripts: true }
    );
    this.panel.webview.html = getPromptStudioHtml(
      this.panel.webview,
      promptStudioState || loadPromptStudioState(this.context)
    );
    this.panel.webview.onDidReceiveMessage((message) => {
      if (!message || typeof message !== "object") return;
      if (message.type === "save") {
        const payload = message.payload as Partial<PromptStudioState>;
        const merged: PromptStudioState = {
          systemPrompt: payload.systemPrompt ?? promptStudioState?.systemPrompt ?? "",
          updatedAt: new Date().toISOString()
        };
        promptStudioState = merged;
        savePromptStudioState(this.context, merged);
        this.panel?.webview.postMessage({ type: "state", state: merged });
        vscode.window.showInformationMessage("UFO Prompt Studio 已儲存");
      }
      if (message.type === "reload") {
        const state = loadPromptStudioState(this.context);
        promptStudioState = state;
        this.panel?.webview.postMessage({ type: "state", state });
      }
    });
    this.panel.onDidDispose(() => {
      this.panel = undefined;
    });
  }
}

function getUfoRoot(context: vscode.ExtensionContext): string {
  return path.resolve(context.extensionPath, "..");
}

function getTasksRoot(context: vscode.ExtensionContext): string {
  return path.join(getUfoRoot(context), "tasks");
}

function getToolsPath(context: vscode.ExtensionContext): string {
  return path.join(getUfoRoot(context), "tools.md");
}

function getProjectRoot(context: vscode.ExtensionContext): string {
  return path.resolve(getUfoRoot(context), "..");
}

function getEnvPath(context: vscode.ExtensionContext): string {
  return path.join(getProjectRoot(context), ".env");
}

function ensureDirectory(pathToCreate: string): void {
  fs.mkdirSync(pathToCreate, { recursive: true });
}

function ensureUfoDirectories(context: vscode.ExtensionContext): void {
  const tasksRoot = getTasksRoot(context);
  ensureDirectory(tasksRoot);

  for (const status of STATUS_DIRS) {
    ensureDirectory(path.join(tasksRoot, status.id));
  }
}

function countTaskFolders(dirPath: string): number {
  if (!fs.existsSync(dirPath)) {
    return 0;
  }
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).length;
}

/**
 * 移動任務到新的狀態資料夾
 */
async function moveTask(
  tasksRoot: string,
  taskPath: string,
  fromStatus: string,
  toStatus: string,
  output: vscode.OutputChannel
): Promise<string> {
  const taskName = path.basename(taskPath);
  const destPath = path.join(tasksRoot, toStatus, taskName);
  
  try {
    await fs.promises.rename(taskPath, destPath);
    output.appendLine(`Task moved: ${fromStatus} → ${toStatus}: ${taskName}`);
    vscode.window.showInformationMessage(`✅ 任務已移至 ${toStatus}: ${taskName}`);
    return destPath;
  } catch (error) {
    output.appendLine(`Failed to move task: ${String(error)}`);
    vscode.window.showErrorMessage(`❌ 移動任務失敗: ${String(error)}`);
    return taskPath;
  }
}

/**
 * 自動執行任務 - 讀取 README.md 並發送給 Copilot Chat
 */
async function executeTaskWithCopilot(
  taskPath: string,
  output: vscode.OutputChannel
): Promise<void> {
  const readmePath = path.join(taskPath, "README.md");
  
  if (!fs.existsSync(readmePath)) {
    output.appendLine(`Task README not found: ${readmePath}`);
    vscode.window.showWarningMessage("找不到任務規格 README.md");
    return;
  }

  try {
    const content = fs.readFileSync(readmePath, "utf-8");
    output.appendLine(`Executing task from: ${readmePath}`);
    
    // 打開 README.md 讓用戶看到
    const doc = await vscode.workspace.openTextDocument(readmePath);
    await vscode.window.showTextDocument(doc);
    
    // 發送到 Copilot Chat
    const prompt = `請根據以下任務規格開始執行：\n\n${content}`;
    
    // 嘗試使用 Copilot Chat API
    try {
      await vscode.commands.executeCommand(
        "workbench.action.chat.open",
        { query: prompt }
      );
      output.appendLine("Task sent to Copilot Chat");
    } catch (chatError) {
      // 如果 Chat API 不可用，顯示提示
      output.appendLine(`Chat API error: ${String(chatError)}`);
      vscode.window.showInformationMessage(
        "請在 Copilot Chat 中輸入任務規格開始執行",
        "複製規格"
      ).then((selection) => {
        if (selection === "複製規格") {
          vscode.env.clipboard.writeText(prompt);
          vscode.window.showInformationMessage("已複製到剪貼簿");
        }
      });
    }
  } catch (error) {
    output.appendLine(`Failed to execute task: ${String(error)}`);
    vscode.window.showErrorMessage(`執行任務失敗: ${String(error)}`);
  }
}

function getTaskCounts(context: vscode.ExtensionContext): DashboardState["tasks"] {
  const tasksRoot = getTasksRoot(context);
  const pending = countTaskFolders(path.join(tasksRoot, "pending"));
  const approved = countTaskFolders(path.join(tasksRoot, "approved"));
  const inProgress = countTaskFolders(path.join(tasksRoot, "in-progress"));
  const done = countTaskFolders(path.join(tasksRoot, "done"));
  return {
    pending,
    approved,
    inProgress,
    done,
    total: pending + approved + inProgress + done
  };
}

function readTaskMeta(taskDir: string, taskId: string): { title: string; createdAtMs: number } {
  const fallbackTitle = taskId;
  let createdAtMs = 0;
  try {
    const st = fs.statSync(taskDir);
    createdAtMs = typeof (st as any).birthtimeMs === "number" ? Math.floor((st as any).birthtimeMs) : Math.floor(st.ctimeMs);
  } catch {
    createdAtMs = Date.now();
  }
  try {
    const readmePath = path.join(taskDir, "README.md");
    if (!fs.existsSync(readmePath)) return { title: fallbackTitle, createdAtMs };
    const raw = fs.readFileSync(readmePath, "utf8").slice(0, 20_000);
    const t = raw.match(/^\s*-\s*任務名稱[:：]\s*(.+)\s*$/m);
    const c = raw.match(/^\s*-\s*建立時間[:：]\s*(.+)\s*$/m);
    const title = t && t[1] ? String(t[1]).trim() : fallbackTitle;
    if (c && c[1]) {
      const parsed = Date.parse(String(c[1]).trim());
      if (Number.isFinite(parsed)) {
        createdAtMs = parsed;
      }
    }
    return { title: title || fallbackTitle, createdAtMs };
  } catch {
    return { title: fallbackTitle, createdAtMs };
  }
}

function readBmMeta(taskDir: string): { agentName?: string; agentEmoji?: string; modelId?: string; modelName?: string } {
  try {
    const p = path.join(taskDir, "bm.json");
    if (!fs.existsSync(p)) return {};
    const raw = fs.readFileSync(p, "utf8");
    const j = JSON.parse(raw);
    const agentName = typeof j?.agentName === "string" ? j.agentName : undefined;
    const agentEmoji = typeof j?.agentEmoji === "string" ? j.agentEmoji : undefined;
    const modelId = typeof j?.modelId === "string" ? j.modelId : undefined;
    const modelName = typeof j?.modelName === "string" ? j.modelName : undefined;
    return { agentName, agentEmoji, modelId, modelName };
  } catch {
    return {};
  }
}

function writeBmMeta(taskDir: string, meta: { agentName: string; agentEmoji: string; updatedAt: string; taskId?: string; modelId?: string; modelName?: string; requestedModelId?: string; agentMode?: string; reasoningEffort?: string }): void {
  try {
    const p = path.join(taskDir, "bm.json");
    fs.writeFileSync(p, JSON.stringify(meta, null, 2), "utf8");
  } catch {
    // ignore
  }
}

function listTaskItems(context: vscode.ExtensionContext): DashboardState["taskItems"] {
  const tasksRoot = getTasksRoot(context);
  const statuses: Array<DashboardState["taskItems"][number]["status"]> = ["pending", "approved", "in-progress", "done"];
  const items: DashboardState["taskItems"] = [];
  for (const status of statuses) {
    const dir = path.join(tasksRoot, status);
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      const taskId = ent.name;
      const taskDir = path.join(dir, taskId);
      let updatedAt = 0;
      try {
        const st = fs.statSync(taskDir);
        updatedAt = typeof st.mtimeMs === "number" ? Math.floor(st.mtimeMs) : Date.now();
      } catch {
        updatedAt = Date.now();
      }
      const meta = readTaskMeta(taskDir, taskId);
      const bm = readBmMeta(taskDir);
      items.push({ taskId, title: meta.title, status, taskDir, agentName: bm.agentName, agentEmoji: bm.agentEmoji, createdAt: meta.createdAtMs, updatedAt });
    }
  }
  return items;
}

function buildDashboardState(
  context: vscode.ExtensionContext,
  connected: boolean,
  connectionState: "connected" | "reconnecting" | "disconnected",
  channels?: { line: boolean; telegram: boolean; discord: boolean }
): DashboardState {
  const config = vscode.workspace.getConfiguration("ufo");
  const gatewayUrl = config.get<string>("gatewayUrl", "ws://localhost:3000");
  const configuredPublicUrl = config.get<string>("publicUrl", "") || "";
  const runtimePublicUrl =
    cloudflaredTunnel.publicUrl && cloudflaredTunnel.proc && !cloudflaredTunnel.proc.killed
      ? cloudflaredTunnel.publicUrl
      : "";
  const publicUrl =
    configuredPublicUrl && !isPlaceholder(configuredPublicUrl)
      ? configuredPublicUrl
      : runtimePublicUrl;
  const envAutoSync = config.get<boolean>("env.autoSync", true);
  const chatModel = config.get<string>("models.chat", "gemini-3-pro-preview");
  const specModel = config.get<string>("models.spec", "gemini-3-pro-preview");
  const opusModel = config.get<string>("models.opus", "gemini-3-pro-preview");

  const lineAccessToken = config.get<string>("line.channelAccessToken", "");
  const lineSecret = config.get<string>("line.channelSecret", "");
  const telegramBotToken = config.get<string>("telegram.botToken", "");
  const discordBotToken = config.get<string>("discord.botToken", "");
  const discordPublicKey = config.get<string>("discord.publicKey", "");

  const lineConfigured =
    !!lineAccessToken && !isPlaceholder(lineAccessToken) &&
    !!lineSecret && !isPlaceholder(lineSecret);
  const telegramConfigured =
    !!telegramBotToken && !isPlaceholder(telegramBotToken);
  const discordConfigured =
    !!discordBotToken && !isPlaceholder(discordBotToken) &&
    !!discordPublicKey && !isPlaceholder(discordPublicKey);

  const gatewayHttpUrl = gatewayWsToHttp(gatewayUrl);

  // Use gateway channels if provided (actual status from gateway), otherwise fall back to local config
  const effectiveChannels = channels || {
    line: lineConfigured,
    telegram: telegramConfigured,
    discord: discordConfigured
  };

  return {
    connected,
    connectionState,
    gatewayUrl,
    gatewayHttpUrl,
    publicUrl,
    envAutoSync,
    tasksRoot: getTasksRoot(context),
    tasks: getTaskCounts(context),
    blueMonsterTasks: listBlueMonsterTasks(getProjectRoot(context)),
    taskItems: listTaskItems(context),
    models: {
      chat: chatModel,
      spec: specModel,
      opus: opusModel
    },
    channels: effectiveChannels,
    lastUpdated: new Date().toLocaleTimeString()
  };
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

function buildTaskSpecContent(
  title: string,
  summary: string,
  createdAt: string,
  sourceLines: string[]
): string {
  const resolvedSourceLines = sourceLines.length > 0 ? sourceLines : ["- 手動建立"];
  return [
    "# 任務規格書",
    "",
    "## 基本資訊",
    `- 任務名稱：${title}`,
    `- 建立時間：${createdAt}`,
    "- 狀態：pending",
    "- 需求來源：",
    ...resolvedSourceLines,
    "",
    "## 背景與目標",
    "- 背景：",
    "- 目標：",
    "",
    "## 範圍",
    "- 納入：",
    "- 不納入：",
    "",
    "## 需求清單",
    "- ",
    "",
    "## 輸入與輸出",
    "- 輸入：",
    "- 輸出：",
    "",
    "## 驗收條件",
    "- ",
    "",
    "## 風險與假設",
    "- ",
    "",
    "## 確認欄位",
    "- 使用者確認：",
    "- 確認時間：",
    "",
    "## 初始摘要",
    summary
  ].join("\n");
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, Math.max(0, maxLength - 3))}...`;
}

function isPlaceholder(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return true;
  }
  const upper = trimmed.toUpperCase();
  return upper.startsWith("YOUR_") || upper === "CHANGEME";
}

function normalizeEnvValue(value: string): string {
  const trimmed = value.trim();
  if (trimmed.includes(" ")) {
    return `"${trimmed.replace(/\"/g, '\\"')}"`;
  }
  return trimmed;
}

function readEnvLines(envPath: string): string[] {
  if (!fs.existsSync(envPath)) {
    return [];
  }
  const raw = fs.readFileSync(envPath, "utf8");
  return raw.split(/\r?\n/);
}

function upsertEnvLine(lines: string[], key: string, value: string): boolean {
  const normalized = normalizeEnvValue(value);
  const pattern = new RegExp(`^\\s*${key}\\s*=`);
  const next = `${key}=${normalized}`;

  for (let i = 0; i < lines.length; i += 1) {
    if (pattern.test(lines[i])) {
      if (lines[i] !== next) {
        lines[i] = next;
        return true;
      }
      return false;
    }
  }

  lines.push(next);
  return true;
}

function syncEnvFromSettings(
  context: vscode.ExtensionContext,
  output: vscode.OutputChannel
): void {
  const config = vscode.workspace.getConfiguration("ufo");
  const autoSync = config.get<boolean>("env.autoSync", true);
  if (!autoSync) {
    return;
  }

  const port = config.get<number>("gateway.port", 3000);
  const publicUrl = config.get<string>("publicUrl", "");
  const lineAccessToken = config.get<string>("line.channelAccessToken", "");
  const lineSecret = config.get<string>("line.channelSecret", "");
  const lineWebhookSecret = config.get<string>("line.webhookSecret", "");
  const telegramBotToken = config.get<string>("telegram.botToken", "");
  const telegramWebhookUrl = config.get<string>("telegram.webhookUrl", "");
  const telegramWebhookSecret = config.get<string>("telegram.webhookSecret", "");
  const discordBotToken = config.get<string>("discord.botToken", "");
  const discordApplicationId = config.get<string>("discord.applicationId", "");
  const discordPublicKey = config.get<string>("discord.publicKey", "");

  const envPath = getEnvPath(context);
  const lines = readEnvLines(envPath);
  const updatedKeys: string[] = [];

  if (Number.isFinite(port)) {
    if (upsertEnvLine(lines, ENV_KEYS.port, String(port))) {
      updatedKeys.push(ENV_KEYS.port);
    }
  }

  if (publicUrl && !isPlaceholder(publicUrl)) {
    if (upsertEnvLine(lines, ENV_KEYS.publicUrl, publicUrl)) {
      updatedKeys.push(ENV_KEYS.publicUrl);
    }
  }

  if (lineAccessToken && !isPlaceholder(lineAccessToken)) {
    if (upsertEnvLine(lines, ENV_KEYS.lineAccessToken, lineAccessToken)) {
      updatedKeys.push(ENV_KEYS.lineAccessToken);
    }
  }
  if (lineSecret && !isPlaceholder(lineSecret)) {
    if (upsertEnvLine(lines, ENV_KEYS.lineSecret, lineSecret)) {
      updatedKeys.push(ENV_KEYS.lineSecret);
    }
  }
  if (lineWebhookSecret && !isPlaceholder(lineWebhookSecret)) {
    if (upsertEnvLine(lines, ENV_KEYS.lineWebhookSecret, lineWebhookSecret)) {
      updatedKeys.push(ENV_KEYS.lineWebhookSecret);
    }
  }

  if (telegramBotToken && !isPlaceholder(telegramBotToken)) {
    if (upsertEnvLine(lines, ENV_KEYS.telegramBotToken, telegramBotToken)) {
      updatedKeys.push(ENV_KEYS.telegramBotToken);
    }
  }
  if (telegramWebhookUrl && !isPlaceholder(telegramWebhookUrl)) {
    if (upsertEnvLine(lines, ENV_KEYS.telegramWebhookUrl, telegramWebhookUrl)) {
      updatedKeys.push(ENV_KEYS.telegramWebhookUrl);
    }
  }
  if (telegramWebhookSecret && !isPlaceholder(telegramWebhookSecret)) {
    if (upsertEnvLine(lines, ENV_KEYS.telegramWebhookSecret, telegramWebhookSecret)) {
      updatedKeys.push(ENV_KEYS.telegramWebhookSecret);
    }
  }

  if (discordBotToken && !isPlaceholder(discordBotToken)) {
    if (upsertEnvLine(lines, ENV_KEYS.discordBotToken, discordBotToken)) {
      updatedKeys.push(ENV_KEYS.discordBotToken);
    }
  }
  if (discordApplicationId && !isPlaceholder(discordApplicationId)) {
    if (upsertEnvLine(lines, ENV_KEYS.discordApplicationId, discordApplicationId)) {
      updatedKeys.push(ENV_KEYS.discordApplicationId);
    }
  }
  if (discordPublicKey && !isPlaceholder(discordPublicKey)) {
    if (upsertEnvLine(lines, ENV_KEYS.discordPublicKey, discordPublicKey)) {
      updatedKeys.push(ENV_KEYS.discordPublicKey);
    }
  }

  if (updatedKeys.length === 0) {
    return;
  }

  fs.writeFileSync(envPath, `${lines.join("\n")}\n`, "utf8");
  output.appendLine(`Synced UFO settings to .env (updated: ${updatedKeys.join(", ")})`);
}

// Gemini client is imported from ./gemini-client

function findExecutableInPath(name: string): string | null {
  const envPath = process.env.PATH || "";
  const parts = envPath.split(path.delimiter).filter(Boolean);
  for (const dir of parts) {
    const candidate = path.join(dir, name);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function ensureCopilotCliOnPath(output: vscode.OutputChannel): void {
  const home = os.homedir();
  const candidates = [
    path.join(home, ".copilot", "bin"),
    path.join(home, ".local", "bin"),
    "/opt/homebrew/bin",
    "/usr/local/bin"
  ];
  const envPath = process.env.PATH || "";
  const parts = envPath.split(path.delimiter).filter(Boolean);
  const additions = candidates.filter((dir) => {
    const candidate = path.join(dir, "copilot");
    return fs.existsSync(candidate) && !parts.includes(dir);
  });
  if (additions.length > 0) {
    process.env.PATH = `${additions.join(path.delimiter)}${path.delimiter}${envPath}`;
    output.appendLine(`[UFO] PATH extended for copilot: ${additions.join(", ")}`);
  }
  const found = findExecutableInPath("copilot");
  if (found) {
    output.appendLine(`[UFO] Copilot CLI found: ${found}`);
  } else {
    output.appendLine("[UFO] Copilot CLI not found in PATH.");
  }
}

function buildChatSystemPrompt(): string {
  const studio = promptStudioState?.systemPrompt;
  if (!studio) {
    return "";
  }
  return studio.trim();
}

function loadCopilotInstructions(context: vscode.ExtensionContext): string {
  const instructionsPath = path.join(getUfoRoot(context), "copilot-instructions.md");
  if (!fs.existsSync(instructionsPath)) {
    return "";
  }
  const content = fs.readFileSync(instructionsPath, "utf8").trim();
  if (!content) {
    return "";
  }
  return `<copilot_instructions>\n${content}\n</copilot_instructions>`;
}

function looksLikeGeminiModelId(modelId: string): boolean {
  const raw = String(modelId || "").trim().toLowerCase();
  const stripped = raw.startsWith("models/") ? raw.slice("models/".length) : raw;
  return (
    stripped.startsWith("gemini") ||
    stripped.startsWith("gemma") ||
    stripped.startsWith("nano-") ||
    stripped.startsWith("deep-research")
  );
}

async function runCopilotPrompt(
  modelId: string,
  prompt: string,
  output: vscode.OutputChannel,
  timeoutMs = 300000
): Promise<string> {
  if (!vscode.lm?.selectChatModels) {
    throw new Error("Language Model API is not available in this VS Code version.");
  }

  const requested = String(modelId || "").trim();
  let models: vscode.LanguageModelChat[] = [];

  // Prefer exact ID lookup when possible.
  if (requested) {
    try {
      models = await vscode.lm.selectChatModels({ vendor: "copilot", id: requested });
    } catch (err) {
      output.appendLine(`[UFO] ⚠️ Copilot selectChatModels(id=...) failed: ${String(err)}`);
    }
  }

  if (models.length === 0) {
    models = await vscode.lm.selectChatModels({ vendor: "copilot" });

    if (requested && models.length > 0) {
      const lower = requested.toLowerCase();
      const exact = models.find((m) => m.id.toLowerCase() === lower);
      const fuzzy = exact || models.find((m) => m.id.toLowerCase().includes(lower) || m.name.toLowerCase().includes(lower));
      if (fuzzy) {
        models = [fuzzy];
      }
    }
  }

  const model = models[0];
  if (!model) {
    throw new Error("No Copilot models available. Check Copilot login and plan.");
  }

  output.appendLine(`[UFO] 📤 Sending to Copilot (model: ${model.name} / ${model.id})...`);

  const tokenSource = new vscode.CancellationTokenSource();
  const timer = setTimeout(() => {
    try { tokenSource.cancel(); } catch {}
  }, timeoutMs);

  try {
    const messages: vscode.LanguageModelChatMessage[] = [
      vscode.LanguageModelChatMessage.User(prompt)
    ];

    const chatResponse = await model.sendRequest(messages, {}, tokenSource.token);
    let text = "";
    for await (const part of chatResponse.stream) {
      if (part instanceof vscode.LanguageModelTextPart) {
        text += part.value;
      }
    }
    return text.trim();
  } finally {
    clearTimeout(timer);
    tokenSource.dispose();
  }
}

async function runSdkPrompt(
  sessionKey: string,
  modelId: string,
  prompt: string,
  output: vscode.OutputChannel
): Promise<string> {
  const requestedModelId = String(modelId || "").trim();

  // Route based on model id:
  // - gemini/gemma/... -> Gemini API
  // - otherwise -> VS Code Copilot LM API
  if (!looksLikeGeminiModelId(requestedModelId)) {
    try {
      const response = await runCopilotPrompt(requestedModelId, prompt, output);
      if (!response) {
        output.appendLine("[UFO] ⚠️ Copilot returned empty response.");
      } else {
        output.appendLine(`[UFO] 📥 Response received (${response.length} chars)`);
      }
      return response;
    } catch (error) {
      const message = `Copilot request failed: ${String(error)}`;
      output.appendLine(`[UFO] ❌ ${message}`);
      console.error("[UFO] Copilot request failed:", error);
      if (error instanceof Error && error.stack) {
        output.appendLine(error.stack);
      }
      return "❌ Copilot 無法回應，請確認已登入 GitHub Copilot，或改用 Gemini 模型（例如 gemini-2.5-pro）。";
    }
  }

  // 確保 Gemini client 有 output channel
  geminiClient.setOutput(output);

  output.appendLine(`[UFO] 📤 Sending to Gemini (model: ${requestedModelId})...`);
  try {
    const response = await geminiClient.sendPrompt(sessionKey, requestedModelId, prompt);
    if (!response) {
      output.appendLine("[UFO] ⚠️ Gemini returned empty response.");
    } else {
      output.appendLine(`[UFO] 📥 Response received (${response.length} chars)`);
    }
    return response;
  } catch (error) {
    const errStr = String(error);
    const message = `Gemini API failed: ${errStr}`;
    output.appendLine(`[UFO] ❌ ${message}`);
    console.error("[UFO] Gemini API failed:", error);
    if (error instanceof Error && error.stack) {
      output.appendLine(error.stack);
    }

    if (/api key not configured/i.test(errStr) || /api_key_invalid/i.test(errStr)) {
      return "❌ Gemini API Key 尚未設定或無效，請設定 ufo.gemini.apiKey 或 GOOGLE_GEMINI_API_KEY（或讓 UFO 讀取 workspace 的 .env）。";
    }
    if (/\b404\b/.test(errStr) || /is not found for api version/i.test(errStr)) {
      return `❌ Gemini 模型不可用：${requestedModelId}\n請改用有效的 Gemini model id（例如 gemini-2.5-pro / gemini-3-pro-preview）。`;
    }
    if (/\b429\b/.test(errStr) || /resource_exhausted/i.test(errStr)) {
      return "❌ Gemini 達到速率限制，請稍後再試。";
    }

    return "❌ Gemini API 呼叫失敗（請打開 UFO Output 觀看詳細錯誤）。";
  }
}


function buildSpecSystemPrompt(conversation: string): string {
  return [
    "你是 UFO 的規格整理器。",
    "請根據以下討論內容產出 JSON：",
    "{\"readme\":\"...\",\"agents\":\"...\",\"devSpec\":\"...\"}",
    "readme: 任務概述、需求、範圍、驗收條件，並附上討論紀錄。",
    "agents: 要求開發代理閱讀的文件、限制、風格。",
    "devSpec: 拆件與組裝計畫、測試策略。",
    "只輸出 JSON，不要加任何額外文字。",
    "",
    "討論內容：",
    conversation
  ].join("\n");
}

function buildOpusSystemPrompt(readme: string, agents: string, devSpec: string): string {
  return [
    "你是 Opus 4.5 的規格優化器。",
    "請強化既有內容，補足缺失，並輸出 JSON：",
    "{\"readme\":\"...\",\"agents\":\"...\",\"devSpec\":\"...\"}",
    "只輸出 JSON，不要加任何額外文字。",
    "",
    "README:",
    readme,
    "",
    "AGENTS:",
    agents,
    "",
    "DEV SPEC:",
    devSpec
  ].join("\n");
}

function extractJsonPayload(text: string): { readme: string; agents: string; devSpec: string } | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }
  const raw = text.slice(start, end + 1);
  try {
    const parsed = JSON.parse(raw);
    if (
      typeof parsed.readme === "string" &&
      typeof parsed.agents === "string" &&
      typeof parsed.devSpec === "string"
    ) {
      return parsed;
    }
  } catch {
    return null;
  }
  return null;
}

function buildConversationLog(history: UfoChatEntry[]): string {
  return history
    .map((entry) => `${entry.role === "user" ? "User" : "Assistant"}: ${entry.content}`)
    .join("\n");
}



function getUfoPersonaPaths(context: vscode.ExtensionContext): { mePath: string; youPath: string } {
  const root = getUfoRoot(context);
  return {
    mePath: path.join(root, "me.md"),
    youPath: path.join(root, "you.md")
  };
}

function getSuperPowerPath(context: vscode.ExtensionContext): string {
  return path.join(getUfoRoot(context), "superPower.md");
}

function ensurePersonaFiles(context: vscode.ExtensionContext): void {
  const { mePath, youPath } = getUfoPersonaPaths(context);
  const defaultMe = [
    "# UFO 個性檔案",
    "",
    "## 角色定位",
    "- 我是 UFO，負責協助使用者完成開發與任務調度。",
    "- 回覆自然、簡潔，不使用固定模板或指令式話術。",
    "",
    "## 核心技能",
    "- 檔案操作與任務建立",
    "- 查詢 BlueMonster 任務狀態",
    "- 需要更深入的開發時可交由 BlueMonster 處理",
    "",
    "## 語氣",
    "- 精準、直接、專業",
    "- 避免冗長清單"
  ].join("\n");
  const legacyMarkers = [
    "需求釐清、規格整理與任務交接",
    "建立任務規格與交接包",
    "回覆自然、不機械"
  ];
  const shouldReplaceLegacy = (content: string) =>
    legacyMarkers.every((marker) => content.includes(marker));

  if (!fs.existsSync(mePath)) {
    fs.writeFileSync(mePath, defaultMe, "utf8");
  } else {
    const current = fs.readFileSync(mePath, "utf8");
    if (shouldReplaceLegacy(current)) {
      fs.writeFileSync(mePath, defaultMe, "utf8");
    }
  }
  if (!fs.existsSync(youPath)) {
    fs.writeFileSync(
      youPath,
      [
        "# 使用者檔案",
        "",
        "## 背景",
        "- 使用者偏好與需求會在對話中逐步整理",
        "",
        "## 偏好",
        "- （待補充）",
        "",
        "## 需求模式",
        "- （待補充）"
      ].join("\n"),
      "utf8"
    );
  }
  
  // 確保 superPower.md 存在
  const superPowerPath = getSuperPowerPath(context);
  if (!fs.existsSync(superPowerPath)) {
    fs.writeFileSync(
      superPowerPath,
      [
        "# UFO & BlueMonster 技能庫",
        "",
        "> 這個檔案記錄所有已開發過的專案技能，可重複調用避免重複造輪子。",
        "",
        "## 📦 技能清單",
        "",
        "### 1. 範例技能",
        "",
        "**功能描述**：",
        "- （技能說明）",
        "",
        "**適用場景**：",
        "- （使用時機）",
        "",
        "**檔案位置**：",
        "- （檔案路徑）",
        "",
        "**建立時間**：" + new Date().toISOString().split('T')[0],
        "",
        "---",
        "",
        "## 💡 使用建議",
        "",
        "1. **優先搜尋**：用戶提出需求時，先搜尋此檔案是否有類似技能",
        "2. **組合使用**：多個技能可以組合使用",
        "3. **持續更新**：每次完成新功能都要記錄"
      ].join("\n"),
      "utf8"
    );
  }
}

function loadPersonaContext(context: vscode.ExtensionContext): string {
  const { mePath, youPath } = getUfoPersonaPaths(context);
  const superPowerPath = getSuperPowerPath(context);
  const sections: string[] = [];
  if (fs.existsSync(mePath)) {
    sections.push(`<me>\n${fs.readFileSync(mePath, "utf8")}\n</me>`);
  }
  if (fs.existsSync(youPath)) {
    sections.push(`<you>\n${fs.readFileSync(youPath, "utf8")}\n</you>`);
  }
  if (fs.existsSync(superPowerPath)) {
    sections.push(`<superPower>\n${fs.readFileSync(superPowerPath, "utf8")}\n</superPower>`);
  }
  return sections.join("\n\n");
}

function appendUserProfile(context: vscode.ExtensionContext, text: string): void {
  const { youPath } = getUfoPersonaPaths(context);
  const line = `- ${new Date().toISOString()} ${text.trim()}`;
  fs.appendFileSync(youPath, `\n${line}`, "utf8");
}

function getBlueMonsterTasksSummary(projectRoot: string): string | null {
  const tasksRoot = path.join(projectRoot, ".bluemonster", "tasks");
  if (!fs.existsSync(tasksRoot)) {
    return null;
  }
  const entries = fs.readdirSync(tasksRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  if (entries.length === 0) {
    return "目前沒有 BlueMonster 任務。";
  }
  const recent = entries.slice(-5).join(", ");
  return `BlueMonster 任務數量：${entries.length}\n最近任務：${recent}`;
}

function listBlueMonsterTasks(projectRoot: string): { count: number; recent: Array<{ taskId: string; updatedAt: number }> } {
  const tasksRoot = path.join(projectRoot, ".bluemonster", "tasks");
  if (!fs.existsSync(tasksRoot)) {
    return { count: 0, recent: [] };
  }
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(tasksRoot, { withFileTypes: true }).filter((e) => e.isDirectory());
  } catch {
    return { count: 0, recent: [] };
  }
  const rows = entries.map((e) => {
    const dir = path.join(tasksRoot, e.name);
    let updatedAt = 0;
    try {
      const st = fs.statSync(dir);
      updatedAt = typeof st.mtimeMs === "number" ? Math.floor(st.mtimeMs) : Date.now();
    } catch {
      updatedAt = Date.now();
    }
    return { taskId: e.name, updatedAt };
  });
  rows.sort((a, b) => b.updatedAt - a.updatedAt);
  return { count: rows.length, recent: rows.slice(0, 8) };
}

function splitMessage(text: string, maxLength: number): string[] {
  const chunks: string[] = [];
  
  // 先按段落分隔（雙換行或分隔線）
  const paragraphs = text.split(/\n{2,}|\n-{3,}\n/);
  let buffer = "";

  for (const para of paragraphs) {
    const trimmedPara = para.trim();
    if (!trimmedPara) continue;
    
    // 如果加入這段不會超過限制，就合併
    const nextBuffer = buffer.length === 0 ? trimmedPara : `${buffer}\n\n${trimmedPara}`;
    
    if (nextBuffer.length <= maxLength) {
      buffer = nextBuffer;
      continue;
    }
    
    // 超過限制，先推出 buffer
    if (buffer.trim()) {
      chunks.push(buffer);
      buffer = "";
    }
    
    // 如果這段本身就超過限制，按行分割
    if (trimmedPara.length > maxLength) {
      const lines = trimmedPara.split("\n");
      let lineBuffer = "";
      
      for (const line of lines) {
        const nextLine = lineBuffer.length === 0 ? line : `${lineBuffer}\n${line}`;
        if (nextLine.length <= maxLength) {
          lineBuffer = nextLine;
        } else {
          if (lineBuffer.trim()) chunks.push(lineBuffer);
          // 如果單行超長，硬切
          if (line.length > maxLength) {
            let start = 0;
            while (start < line.length) {
              chunks.push(line.slice(start, start + maxLength));
              start += maxLength;
            }
            lineBuffer = "";
          } else {
            lineBuffer = line;
          }
        }
      }
      if (lineBuffer.trim()) buffer = lineBuffer;
    } else {
      buffer = trimmedPara;
    }
  }

  if (buffer.trim()) {
    chunks.push(buffer);
  }
  
  return chunks.filter(c => c.trim().length > 0);
}

function looksLikeWorkIntent(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  // Strong signals: code, stack traces, file paths, commands
  if (/```/.test(t)) return true;
  if (/(error|exception|stack trace|traceback|segfault)\b/i.test(t)) return true;
  if (/\b(src\/|packages\/|UFO\/|\.ts\b|\.js\b|\.json\b|pnpm\b|npm\b|yarn\b|docker\b|k8s\b|kubectl\b|git\b)/i.test(t)) return true;
  // Common work keywords (zh)
  if (/(我想做|我要做|想做|做一個|做個|做個頁面|做個網站|頁面|網站|前端|後端|伺服器)/i.test(t)) return true;
  if (/(幫我(做|寫|建立|創建|新增|加上|加入|修改|修復|除錯|debug)|建立(一個|個)?|創建(一個|個)?|新增|更新|實作|開發|部署|設定|配置|改一下|修|修復|除錯|報錯|錯誤|壞了|跑不起來|如何做|怎麼做|寫爬蟲|抓資料|整理資料|產生報告|寫文章|寫文件|規格|PRD|技術方案)/i.test(t)) return true;
  // English work keywords
  if (/\b(build|create|make|develop|implement|write|code|fix|debug|deploy|setup|configure|install|add|update|refactor|optimize|test)\b/i.test(t)) return true;
  if (/\b(help me|can you|please|i need|i want)\s+(build|create|make|write|fix|develop|implement|do|work on)/i.test(t)) return true;
  if (/\b(server|express|node|api|endpoint|hello\s*world|website|web\s*app|application|database|frontend|backend|component|feature|function|script|automation)\b/i.test(t)) return true;
  // Action requests
  if (/\b(send (it )?to|delegate to|hand off to|let|have)\s+(bluemonster|bm|agent)/i.test(t)) return true;
  return false;
}

function looksLikeMultiAgentRequest(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  // Require explicit intent to avoid surprising fan-out.
  return /(multi[\s-]?agent|多\s*agent|多\s*個\s*agent|多\s*位\s*agent|多\s*代理|並行\s*(開發|處理)|平行\s*(開發|處理)|拆\s*(成|分)\s*\d+\s*個\s*任務|分給\s*多\s*個\s*(agent|藍怪|bluemonster))/i.test(t);
}

function parseYesNo(text: string): boolean | null {
  const t = text.trim().toLowerCase();
  if (!t) return null;
  if (t === "1" || t === "a" || t === "y" || t === "yes" || t === "ok" || t === "好的" || t === "好" || t === "要" || t.includes("交給") || t.includes("可以") || t.includes("開始")) return true;
  if (t === "2" || t === "n" || t === "no" || t === "不用" || t === "不要" || t.includes("先不用") || t.includes("不需要")) return false;
  return null;
}

function parseBmConfirmationAction(text: string): { action: "run" | "sessionAllow" | "projectAllow" | "cancel"; id: string } | null {
  const t = text.trim();
  const m = t.match(/^(run|cancel|sessionallow|projectallow)\s+([a-z0-9\\-_.]+)$/i);
  if (!m) return null;
  const actionRaw = m[1].toLowerCase();
  const id = m[2];
  const action =
    actionRaw === "run" ? "run" :
    actionRaw === "cancel" ? "cancel" :
    actionRaw === "sessionallow" ? "sessionAllow" :
    "projectAllow";
  return { action, id };
}

function looksLikeProgressQuery(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  // Common short probes
  if (t === "?" || t === "？？" || t === "??") return true;
  return /(進度|目前(進度|狀況|狀態)|做到哪|跑到哪|好了嗎|完成了嗎|完成沒|還好嗎|有結果了嗎|怎麼樣了)/i.test(t);
}

function looksLikeTaskFollowup(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  // Short “do it more” messages are almost always follow-ups.
  if (/^(再|再改|再修|再優化|再調整|再做|再弄|繼續|改一下|修一下|優化一下|調整一下)$/i.test(t)) return true;
  // Typical follow-up phrasing referencing the previous result.
  return /(剛(剛|才)|上次|前面|剛做的|這個|那個|不滿意|不好看|怪怪的|有問題|有 bug|再優化|再改|再調整|再修|加一點|補上|延伸)/i.test(t);
}

function guessTaskTitleFromRequest(requestText: string): string {
  const t = requestText.trim();
  if (!t) return "task";
  const firstLine = t.split("\n")[0]?.trim() || "";
  if (!firstLine) return "task";
  if (/^\\d+$/.test(firstLine)) return "task";
  // keep title short; folder slug will be further truncated by slugify()
  return firstLine.length > 80 ? firstLine.slice(0, 80) : firstLine;
}

function findDevSpecFile(taskDir: string): string | null {
  try {
    const entries = fs.readdirSync(taskDir);
    const hit = entries.find((name) => name.startsWith("dev-spec-") && name.endsWith(".md"));
    return hit ? path.join(taskDir, hit) : null;
  } catch {
    return null;
  }
}

function normalizeMediaSource(channel: string | undefined): "line" | "telegram" | "discord" {
  const c = String(channel || "").toLowerCase();
  if (c === "line") return "line";
  if (c === "discord") return "discord";
  return "telegram";
}

function findPreviewHtmlFile(taskDir: string): string | null {
  const preferred = ["index.html", "hello-world.html", "helloworld.html"];
  for (const name of preferred) {
    const p = path.join(taskDir, name);
    if (fs.existsSync(p) && fs.statSync(p).isFile()) {
      return p;
    }
  }

  // Shallow search: task root, then common subfolders.
  const scanDirs = [taskDir, path.join(taskDir, "dist"), path.join(taskDir, "public")];
  for (const dir of scanDirs) {
    try {
      if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) continue;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      const hit = entries.find((e) => e.isFile() && e.name.toLowerCase().endsWith(".html"));
      if (hit) return path.join(dir, hit.name);
    } catch {
      // ignore
    }
  }

  return null;
}

async function postJson(url: string, body: any): Promise<any> {
  const payload = JSON.stringify(body ?? {});
  const fetchFn: any = (globalThis as any).fetch;
  if (typeof fetchFn === "function") {
    const res = await fetchFn(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload
    });
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      return { ok: res.ok, status: res.status, text };
    }
  }

  // Fallback for older extension hosts without global fetch.
  const { request } = await import(url.startsWith("https:") ? "https" : "http");
  return await new Promise((resolve, reject) => {
    try {
      const u = new URL(url);
      const req = request(
        {
          protocol: u.protocol,
          hostname: u.hostname,
          port: u.port,
          path: u.pathname + u.search,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(payload)
          }
        },
        (res: any) => {
          let data = "";
          res.on("data", (chunk: any) => { data += chunk; });
          res.on("end", () => {
            try {
              resolve(JSON.parse(data));
            } catch {
              resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, text: data });
            }
          });
        }
      );
      req.on("error", reject);
      req.write(payload);
      req.end();
    } catch (err) {
      reject(err);
    }
  });
}

async function getJson(url: string): Promise<any> {
  const fetchFn: any = (globalThis as any).fetch;
  if (typeof fetchFn === "function") {
    const res = await fetchFn(url, { method: "GET" });
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      return { ok: res.ok, status: res.status, text };
    }
  }
  const { request } = await import(url.startsWith("https:") ? "https" : "http");
  return await new Promise((resolve, reject) => {
    try {
      const u = new URL(url);
      const req = request(
        {
          protocol: u.protocol,
          hostname: u.hostname,
          port: u.port,
          path: u.pathname + u.search,
          method: "GET",
        },
        (res: any) => {
          let data = "";
          res.on("data", (chunk: any) => { data += chunk; });
          res.on("end", () => {
            try {
              resolve(JSON.parse(data));
            } catch {
              resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, text: data });
            }
          });
        }
      );
      req.on("error", reject);
      req.end();
    } catch (err) {
      reject(err);
    }
  });
}

async function resolvePublicBaseUrl(
  gatewayHttpUrl: string,
  overrideBaseRaw: string,
  output?: vscode.OutputChannel
): Promise<string> {
  const overrideBase = overrideBaseRaw && !isPlaceholder(overrideBaseRaw)
    ? stripTrailingSlashes(overrideBaseRaw)
    : "";
  if (overrideBase) return overrideBase;
  try {
    const st = await getJson(`${gatewayHttpUrl}/api/tunnel`);
    const active = Boolean(st?.active);
    const url = typeof st?.url === "string" ? st.url : "";
    if (active && url) {
      return stripTrailingSlashes(url);
    }
  } catch {
    // ignore
  }

  const localBase = stripTrailingSlashes(gatewayHttpUrl);
  // If the gateway is local-only, spin up a Cloudflare Quick Tunnel automatically so the
  // preview URL we send to end-users is reachable without extra manual setup.
  if (isLocalhostUrl(localBase)) {
    try {
      const publicBase = await ensureCloudflaredQuickTunnel(localBase, output);
      if (publicBase) return stripTrailingSlashes(publicBase);
    } catch (err) {
      output?.appendLine?.(`[UFO] Failed to start cloudflared tunnel, using local URL: ${String(err)}`);
    }
  }

  return localBase;
}

async function syncBlueMonsterFromGateway(gatewayHttpUrl: string, output: vscode.OutputChannel): Promise<{ requestedModelId?: string; agentMode?: string; reasoningEffort?: string }> {
  try {
    const settings = await getJson(`${gatewayHttpUrl}/api/ai-settings`);
    const bm = settings?.blueMonster;
    if (!bm || typeof bm !== "object") return {};

    const requestedModelId =
      (bm.taskModels && typeof bm.taskModels === "object" && typeof bm.taskModels.coding === "string" && bm.taskModels.coding.trim())
        ? String(bm.taskModels.coding).trim()
        : (typeof bm.defaultModel === "string" ? bm.defaultModel.trim() : "");

    const agentMode = typeof bm.agentMode === "string" ? bm.agentMode : "";
    const reasoningEffort = typeof bm.reasoningEffort === "string" ? bm.reasoningEffort : "";

    if (reasoningEffort) {
      try {
        await vscode.workspace.getConfiguration("blueMonster").update("reasoningEffort", reasoningEffort, vscode.ConfigurationTarget.Global);
      } catch {}
    }

    if (agentMode) {
      try {
        await vscode.commands.executeCommand("blueMonster.setMode", agentMode);
      } catch {}
    }

    if (requestedModelId) {
      try {
        await vscode.commands.executeCommand("blueMonster.setModel", requestedModelId);
      } catch (err) {
        output.appendLine(`[UFO] Failed to set BlueMonster model to ${requestedModelId}: ${String(err)}`);
      }
    }

    return { requestedModelId: requestedModelId || undefined, agentMode: agentMode || undefined, reasoningEffort: reasoningEffort || undefined };
  } catch {
    return {};
  }
}

type MultiAgentSubtask = {
  title: string;
  instruction: string;
  acceptance?: string[];
};

function extractJsonObjectLoose(text: string): any | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  const raw = text.slice(start, end + 1);
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function normalizeMultiAgentSubtasks(raw: any, maxTasks: number): { groupTitle: string; tasks: MultiAgentSubtask[] } | null {
  if (!raw || typeof raw !== "object") return null;
  const groupTitle = typeof raw.groupTitle === "string" && raw.groupTitle.trim() ? raw.groupTitle.trim() : "multi-agent";
  const arr = Array.isArray(raw.tasks) ? raw.tasks : (Array.isArray(raw.subtasks) ? raw.subtasks : []);
  if (!Array.isArray(arr) || arr.length === 0) return null;

  const tasks: MultiAgentSubtask[] = [];
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const title = typeof item.title === "string" ? item.title.trim() : "";
    const instruction = typeof item.instruction === "string" ? item.instruction.trim() : (typeof item.summary === "string" ? item.summary.trim() : "");
    if (!title || !instruction) continue;
    const acceptance = Array.isArray(item.acceptance)
      ? item.acceptance.map((v: any) => String(v || "").trim()).filter(Boolean).slice(0, 12)
      : [];
    tasks.push({ title, instruction, acceptance: acceptance.length > 0 ? acceptance : undefined });
    if (tasks.length >= maxTasks) break;
  }
  if (tasks.length === 0) return null;
  return { groupTitle, tasks };
}

function buildMultiAgentSplitPrompt(sourceText: string, maxTasks: number): string {
  return [
    "你是 UFO 的「多 Agent 任務拆解器」。",
    "目標：把一段需求/規格拆成 2-" + String(maxTasks) + " 個可平行開發的子任務，讓不同 BlueMonster agent 可以各自獨立完成。",
    "要求：",
    "- 子任務之間盡量降低依賴；若有必要依賴，請把依賴內容寫進 instruction（用文字描述即可，不要額外欄位）",
    "- 每個子任務要有清楚的交付物與驗收重點",
    "- 只輸出 JSON，不要加任何多餘文字、不要用 code fence",
    "",
    "JSON 格式：",
    "{",
    "  \"groupTitle\": \"...\",",
    "  \"tasks\": [",
    "    {",
    "      \"title\": \"...\",",
    "      \"instruction\": \"...\",",
    "      \"acceptance\": [\"...\", \"...\"]",
    "    }",
    "  ]",
    "}",
    "",
    "需求/規格：",
    sourceText.trim()
  ].join("\n");
}

async function splitTextToMultiAgentSubtasks(options: {
  sourceText: string;
  modelId: string;
  output: vscode.OutputChannel;
  maxTasks?: number;
}): Promise<{ groupTitle: string; tasks: MultiAgentSubtask[] } | null> {
  const maxTasks = Math.max(2, Math.min(8, Number(options.maxTasks || 5)));
  const prompt = buildMultiAgentSplitPrompt(options.sourceText, maxTasks);
  const raw = await runSdkPrompt(`split:${Date.now().toString(36)}`, options.modelId, prompt, options.output);
  const parsed = extractJsonObjectLoose(raw);
  const normalized = normalizeMultiAgentSubtasks(parsed, maxTasks);
  return normalized;
}

function createPendingTaskBundleFromSubtask(options: {
  context: vscode.ExtensionContext;
  session: UfoSession;
  groupId: string;
  index: number;
  total: number;
  requestText: string;
  subtask: MultiAgentSubtask;
}): { taskId: string; taskDir: string; readmePath: string; status: TaskStatus; title: string } {
  const { context, session, groupId, index, total, requestText, subtask } = options;
  const tasksRoot = getTasksRoot(context);
  const createdAt = new Date().toISOString();

  const part = String(index + 1).padStart(2, "0");
  const slug = slugify(subtask.title) || `part-${part}`;
  // Keep id reasonably short for filesystem + UI.
  const taskId = `${groupId}-p${part}-${slug}`.slice(0, 160);

  const pendingDir = path.join(tasksRoot, "pending", taskId);
  ensureDirectory(pendingDir);

  const sourceLines = [
    `- Multi-agent：${groupId} (${index + 1}/${total})`,
    `- Channel: ${session.channel}`,
    `- User: ${session.userId}`,
  ];

  let readme = buildTaskSpecContent(subtask.title, subtask.instruction, createdAt, sourceLines);
  readme += [
    "",
    "## 子任務說明",
    subtask.instruction,
    "",
    subtask.acceptance && subtask.acceptance.length > 0
      ? ["## 驗收重點", ...subtask.acceptance.map((a) => `- ${a}`)].join("\n")
      : "",
    "",
    "## 原始需求（for context）",
    requestText.trim(),
    ""
  ].filter(Boolean).join("\n");

  const agents = [
    "# AGENTS",
    "",
    "## 必讀文件",
    "- README.md",
    "- dev-spec-*.md",
    "",
    "## 開發注意事項",
    "- 這是多 Agent 子任務，請只處理你這一份範圍（避免與其他子任務衝突）",
    "- 若需要調整界面/架構，請先在 README.md 補充原因與影響",
    "- 若遇到需要危險操作請發出 pending confirmation",
  ].join("\n");

  const devSpec = [
    "# 開發規格書",
    "",
    "## 拆件清單",
    "- ",
    "",
    "## 組裝說明",
    "- ",
    "",
    "## 測試策略",
    "- ",
    "",
    "## 備註",
    subtask.acceptance && subtask.acceptance.length > 0
      ? ["- 驗收重點：", ...subtask.acceptance.map((a) => `  - ${a}`)].join("\n")
      : "- （無）",
    ""
  ].join("\n");

  fs.writeFileSync(path.join(pendingDir, "README.md"), readme, "utf8");
  fs.writeFileSync(path.join(pendingDir, "AGENTS.md"), agents, "utf8");
  fs.writeFileSync(path.join(pendingDir, `dev-spec-${taskId}.md`), devSpec, "utf8");

  return { taskId, taskDir: pendingDir, readmePath: path.join(pendingDir, "README.md"), status: "pending", title: subtask.title };
}

async function createUfoTaskBundleFromConversation(options: {
  context: vscode.ExtensionContext;
  output: vscode.OutputChannel;
  refreshAllProviders: () => void;
  session: UfoSession;
  requestText: string;
  startImmediately?: boolean;
}): Promise<{ taskId: string; taskDir: string; readmePath: string; status: TaskStatus }> {
  const { context, output, refreshAllProviders, session, requestText, startImmediately } = options;

  ensureUfoDirectories(context);

  const tasksRoot = getTasksRoot(context);
  const createdAt = new Date().toISOString();
  const taskTitle = guessTaskTitleFromRequest(requestText);
  const taskId = `${createdAt.replace(/[:.]/g, "-")}-${slugify(taskTitle) || "task"}`;

  const pendingDir = path.join(tasksRoot, "pending", taskId);
  ensureDirectory(pendingDir);

  const conversationLog = buildConversationLog(session.history);
  let readme = buildTaskSpecContent(taskTitle, requestText, createdAt, [
    `- Channel: ${session.channel}`,
    `- User: ${session.userId}`
  ]);
  readme += `\n\n## 討論紀錄\n${conversationLog}\n`;

  const agents = [
    "# AGENTS",
    "",
    "## 必讀文件",
    "- README.md",
    "- dev-spec-*.md",
    "",
    "## 開發注意事項",
    "- 先閱讀需求與範圍，確認驗收條件",
    "- 若任務需要改動現有程式，優先使用既有 patterns",
    "- 若有不確定之處，先回報 UFO 再動手"
  ].join("\n");

  const devSpec = [
    "# 開發規格書",
    "",
    "## 拆件清單",
    "- ",
    "",
    "## 組裝說明",
    "- ",
    "",
    "## 測試策略",
    "- "
  ].join("\n");

  fs.writeFileSync(path.join(pendingDir, "README.md"), readme, "utf8");
  fs.writeFileSync(path.join(pendingDir, "AGENTS.md"), agents, "utf8");
  fs.writeFileSync(path.join(pendingDir, `dev-spec-${taskId}.md`), devSpec, "utf8");

  refreshAllProviders();

  let taskDir = pendingDir;
  let status: TaskStatus = "pending";
  let readmePath = path.join(taskDir, "README.md");

  if (startImmediately) {
    taskDir = await moveTask(tasksRoot, pendingDir, "pending", "in-progress", output);
    status = "in-progress";
    readmePath = path.join(taskDir, "README.md");
    refreshAllProviders();
  }

  session.taskId = taskId;
  session.taskDir = taskDir;
  session.taskTitle = taskTitle;
  session.mode = "awaiting_confirmation";

  return { taskId, taskDir, readmePath, status };
}

async function executeUfoTaskWithBlueMonster(options: {
  context: vscode.ExtensionContext;
  refreshAllProviders: () => void;
  output: vscode.OutputChannel;
  dashboardProvider: UfoDashboardProvider;
  gatewayClient: GatewayClient;
  meta: { channel: string; userId: string; chatId?: string; messageId?: string; timestamp?: string };
  session: UfoSession;
  taskDir: string;
  requestText: string;
  sendPrefix?: string;
}): Promise<void> {
  const { context, refreshAllProviders, output, dashboardProvider, gatewayClient, meta, session, taskDir, requestText, sendPrefix } = options;
  let clearBmRun = true;

  const prefix = typeof sendPrefix === "string" ? sendPrefix : "";
  const sendToChannel = (content: string) => {
    const maxLen = Math.max(200, 800 - (prefix ? prefix.length : 0));
    const chunks = splitMessage(content, maxLen);
    for (const chunk of chunks) {
      const out = prefix ? `${prefix}${chunk}` : chunk;
      gatewayClient.send({ type: "copilot_response", channel: meta.channel, userId: meta.userId, chatId: meta.chatId, content: out });
    }
  };

  const readmePath = path.join(taskDir, "README.md");
  const agentsPath = path.join(taskDir, "AGENTS.md");
  const devSpecPath = findDevSpecFile(taskDir);
  const ufoCfg = vscode.workspace.getConfiguration("ufo");
  const gwUrlRaw = ufoCfg.get<string>("gatewayUrl", "ws://localhost:3000");
  const gwHttp = gatewayWsToHttp(gwUrlRaw || "ws://localhost:3000");
  const bmSync = await syncBlueMonsterFromGateway(gwHttp, output);

  // Ensure the task shows up in BlueMonster's task list immediately (even before messages exist).
  try {
    const externalTaskId = session.taskId || path.basename(taskDir);
    const title = session.taskTitle || "";
    await vscode.commands.executeCommand("blueMonster.createExternalTask", externalTaskId, taskDir, title);
  } catch (err) {
    output.appendLine(`[UFO] Failed to create external BlueMonster task: ${String(err)}`);
  }

  // Ask BlueMonster to operate with taskDir as the working directory.
  try {
    await vscode.commands.executeCommand("blueMonster.setTaskFolder", taskDir);
  } catch (err) {
    output.appendLine(`[UFO] Failed to set BlueMonster task folder: ${String(err)}`);
  }
  try {
    // Ensure BlueMonster is in an agent mode (not chat-only) for task execution.
    if (!bmSync.agentMode) {
      await vscode.commands.executeCommand("blueMonster.setMode", "agent");
    }
  } catch {}

  // Persist which agent is handling this task (for UI display in Running/Done).
  try {
    const st = await vscode.commands.executeCommand("blueMonster.getStatus") as any;
    const agentName = typeof st?.agentName === "string" ? st.agentName : "BlueMonster";
    const agentEmoji = typeof st?.agentEmoji === "string" ? st.agentEmoji : "👾";
    const modelId = typeof st?.modelId === "string" ? st.modelId : undefined;
    const modelName = typeof st?.modelName === "string" ? st.modelName : undefined;
    writeBmMeta(taskDir, {
      agentName,
      agentEmoji,
      modelId,
      modelName,
      requestedModelId: bmSync.requestedModelId,
      agentMode: bmSync.agentMode,
      reasoningEffort: bmSync.reasoningEffort,
      updatedAt: new Date().toISOString(),
      taskId: session.taskId || path.basename(taskDir)
    });
  } catch {}

  const prompt = [
    "你是 BlueMonster，請接手 UFO 任務並在本機 VS Code 專案中實際執行。",
    "",
    `UFO 任務資料夾（請視為工作目錄）：${taskDir}`,
    "重要限制：",
    "- 所有輸出檔案必須寫在上述任務資料夾內（不要寫到 /Users/... 或其他系統路徑）",
    "- 如果產出可預覽的網頁，請優先輸出為 index.html（放在任務資料夾根目錄）",
    "",
    "請先閱讀：",
    `- ${readmePath}`,
    fs.existsSync(agentsPath) ? `- ${agentsPath}` : "",
    devSpecPath ? `- ${devSpecPath}` : "",
    "",
    "原始需求：",
    requestText,
    "",
    "輸出要求：",
    "- 用精簡文字回覆你做了什麼、改了哪些檔案、以及如何驗證",
    "- 若需要跑指令/改檔請照做；若遇到需要確認的危險操作，請產生 pending confirmation 由 UFO 轉達",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const result = await vscode.commands.executeCommand(
      "blueMonster.sendMessageExternal",
      prompt,
      "agent"
    ) as any;

    const text = typeof result?.text === "string" ? result.text : "";
    const pending = Array.isArray(result?.pendingConfirmations) ? result.pendingConfirmations : [];
    if (text) {
      sendToChannel(text);
    } else {
      sendToChannel("（BlueMonster 未回傳文字結果，可能仍在執行或需要確認。）");
    }

    if (pending.length > 0) {
      clearBmRun = false;
      const lines = [
        "需要你確認要不要讓 BlueMonster 執行以下動作：",
        ...pending.map((p: any) => `- id=${p.id} category=${p.category} cmd=${p.command}`),
        "",
        "回覆其中一個：",
        "- run <id>  (允許執行)",
        "- cancel <id> (取消)",
        "- sessionAllow <id> (本次對話允許此類別)",
        "- projectAllow <id> (本專案允許此類別)",
      ].join("\n");
      sendToChannel(lines);
      return;
    }

    // === Auto-delivery: upload a previewable HTML (if any) to Gateway media service ===
	    try {
	      const config = vscode.workspace.getConfiguration("ufo");
	      const gatewayUrl = config.get<string>("gatewayUrl", "ws://localhost:3000");
	      const gatewayHttpUrl = gatewayWsToHttp(gatewayUrl);
	      const overrideBaseRaw = config.get<string>("publicUrl", "") || "";
		      const baseUrl = await resolvePublicBaseUrl(gatewayHttpUrl, overrideBaseRaw, output);

      // Read BlueMonster agent name for completion message
      const bmMeta = readBmMeta(taskDir);
      const bmLabel = bmMeta.agentName ? `${bmMeta.agentEmoji || '🤖'} ${bmMeta.agentName}` : "BlueMonster";

      const previewPath = findPreviewHtmlFile(taskDir);
      if (previewPath) {
        // Use the simpler /preview/:taskId endpoint
        const taskId = path.basename(taskDir);
        const previewPathPart = `/preview/${taskId}`;
        const url = baseUrl
          ? `${baseUrl}${previewPathPart}`
          : `${gatewayHttpUrl}${previewPathPart}`;
        const localMark = /localhost|127\.0\.0\.1/i.test(url) ? "（本機）" : "";
        sendToChannel(`👾 ${bmLabel} 做好了！預覽連結${localMark}：\n${url}`);
        try {
          await vscode.commands.executeCommand("blueMonster.addSystemNote", `🌐 Preview${localMark}: ${url}`);
        } catch {}
      } else {
        sendToChannel(`👾 ${bmLabel} 做好了！\n成果資料夾：${taskDir}`);
      }
    } catch (err) {
      output.appendLine(`[UFO] Auto-delivery failed: ${String(err)}`);
    }

    // === Auto-move task to done ===
    try {
      const tasksRoot = getTasksRoot(context);
      const fromStatus = path.basename(path.dirname(taskDir));
      const moved = await moveTask(tasksRoot, taskDir, fromStatus, "done", output);
      refreshAllProviders();
      session.taskDir = moved;
    } catch (err) {
      output.appendLine(`[UFO] Failed to move task to done: ${String(err)}`);
    }
  } catch (err) {
    output.appendLine(`[UFO] BlueMonster execution failed: ${String(err)}`);
    dashboardProvider.log("error", `BlueMonster execution failed: ${String(err)}`, "error");
    sendToChannel("❌ 無法呼叫 BlueMonster。請確認 BlueMonster extension 已安裝/啟用，且此 VS Code 視窗可執行 blueMonster.* commands。");
  } finally {
    // Clear running marker (only if it still points to this taskDir)
    try {
      if (clearBmRun && session.bmRun?.taskDir === taskDir) {
        session.bmRun = undefined;
      }
    } catch {}
  }
}

function getCurrentTodoQuestion(session: UfoSession): string | null {
  const items = session.todoItems || [];
  const idx = session.todoIndex ?? 0;
  if (idx >= items.length) {
    return null;
  }
  return items[idx]?.question ?? null;
}

function recordTodoAnswer(session: UfoSession, answer: string): void {
  if (!session.todoItems || session.todoItems.length === 0) {
    return;
  }
  const idx = session.todoIndex ?? 0;
  if (idx >= session.todoItems.length) {
    return;
  }
  session.todoItems[idx].answer = answer;
  session.todoIndex = Math.min(idx + 1, session.todoItems.length);
}

function rememberMessageId(
  messageId: string | undefined,
  recentIds: Set<string>,
  recentQueue: string[]
): boolean {
  if (!messageId) {
    return true;
  }
  if (recentIds.has(messageId)) {
    return false;
  }
  recentIds.add(messageId);
  recentQueue.push(messageId);
  if (recentQueue.length > MAX_RECENT_MESSAGE_IDS) {
    const removed = recentQueue.shift();
    if (removed) {
      recentIds.delete(removed);
    }
  }
  return true;
}

function createTaskSpecFile(
  context: vscode.ExtensionContext,
  provider: TaskQueueProvider,
  title: string,
  summary: string,
  createdAt: string,
  sourceLines: string[]
): string {
  const taskId = `${createdAt.replace(/[:.]/g, "-")}-${slugify(title) || "task"}`;
  const taskDir = path.join(getTasksRoot(context), DEFAULT_TASK_FOLDER, taskId);
  ensureDirectory(taskDir);

  const readme = buildTaskSpecContent(title, summary, createdAt, sourceLines);
  const agents = [
    "# AGENTS",
    "",
    "## 必讀文件",
    "- README.md",
    "",
    "## 開發注意事項",
    "- 請先閱讀需求與範圍",
    "- 若有疑問請回報 UFO"
  ].join("\n");
  const devSpec = [
    "# 開發規格書",
    "",
    "## 拆件清單",
    "- ",
    "",
    "## 組裝說明",
    "- ",
    "",
    "## 測試策略",
    "- ",
  ].join("\n");

  fs.writeFileSync(path.join(taskDir, "README.md"), readme, "utf8");
  fs.writeFileSync(path.join(taskDir, "AGENTS.md"), agents, "utf8");
  fs.writeFileSync(path.join(taskDir, `dev-spec-${taskId}.md`), devSpec, "utf8");
  provider.refresh();
  return path.join(taskDir, "README.md");
}

async function createTaskSpec(
  context: vscode.ExtensionContext,
  provider: TaskQueueProvider
): Promise<void> {
  ensureUfoDirectories(context);

  const title = await vscode.window.showInputBox({
    title: "Create Task Spec",
    prompt: "Task title"
  });

  if (!title) {
    return;
  }

  const summary = await vscode.window.showInputBox({
    title: "Create Task Spec",
    prompt: "Short summary (optional)",
    value: ""
  });

  const createdAt = new Date().toISOString();
  const targetPath = createTaskSpecFile(
    context,
    provider,
    title,
    summary ?? "",
    createdAt,
    ["- 手動建立"]
  );

  await vscode.commands.executeCommand("vscode.open", vscode.Uri.file(targetPath));
}

function getSessionKey(channel: string, userId: string): string {
  return `${channel}:${userId}`;
}

function getTaskDir(context: vscode.ExtensionContext, status: TaskStatus, taskId: string): string {
  return path.join(getTasksRoot(context), status, taskId);
}

function ensureGatewayTaskFolder(context: vscode.ExtensionContext, task: any, instruction: string, output: vscode.OutputChannel): void {
  const taskId = String(task?.id || "").trim();
  if (!taskId) return;

  const taskDir = getTaskDir(context, "pending", taskId);
  if (fs.existsSync(taskDir)) {
    return; // idempotent
  }

  try {
    ensureDirectory(taskDir);
    const createdAt = task?.createdAt ? String(task.createdAt) : new Date().toISOString();
    const channel = task?.channel ? String(task.channel) : "unknown";
    const userId = task?.userId ? String(task.userId) : "unknown";

    const readme = [
      "# 任務規格書",
      "",
      `- 任務 ID：${taskId}`,
      `- 建立時間：${createdAt}`,
      `- 來源頻道：${channel}`,
      `- 使用者：${userId}`,
      "",
      "## 指令",
      instruction || "(empty)",
      "",
      "## 備註",
      "- 此任務由 Gateway /api/tasks 建立並同步到 UFO。",
    ].join("\n");

    fs.writeFileSync(path.join(taskDir, "README.md"), readme, "utf8");
    fs.writeFileSync(path.join(taskDir, "gateway-task.json"), JSON.stringify(task, null, 2), "utf8");
  } catch (err) {
    output.appendLine(`[UFO] Failed to create gateway task folder: ${String(err)}`);
  }
}

async function createTaskBundleFromConversation(options: {
  context: vscode.ExtensionContext;
  provider: TaskQueueProvider;
  output: vscode.OutputChannel;
  session: UfoSession;
  chatModelId: string;
  specModelId: string;
  opusModelId: string;
  gatewayClient: GatewayClient;
}): Promise<void> {
  const { context, provider, output, session, specModelId, opusModelId, gatewayClient } = options;
  const createdAt = new Date().toISOString();
  const taskTitle = session.taskTitle || "task";
  const taskId = `${createdAt.replace(/[:.]/g, "-")}-${slugify(taskTitle) || "task"}`;
  const taskDir = getTaskDir(context, "pending", taskId);
  ensureDirectory(taskDir);

  const conversationLog = buildConversationLog(session.history);
  let readme = "";
  let agents = "";
  let devSpec = "";

  const specPrompt = buildSpecSystemPrompt(conversationLog);
  const specRaw = await runSdkPrompt(`spec:${taskId}`, specModelId, specPrompt, output);
  const parsed = extractJsonPayload(specRaw);
  if (parsed) {
    readme = parsed.readme;
    agents = parsed.agents;
    devSpec = parsed.devSpec;
  }

  if (!readme) {
    readme = buildTaskSpecContent(taskTitle, session.history.at(-1)?.content || "", createdAt, [
      "- Channel: line",
      "- User: (redacted)"
    ]);
  }

  if (!agents) {
    agents = [
      "# AGENTS",
      "",
      "## 任務說明",
      "- 請依 README.md 進行開發",
      "",
      "## 注意事項",
      "- 開發前先閱讀全部規格",
      "- 若有疑問請回報 UFO"
    ].join("\n");
  }

  if (!devSpec) {
    devSpec = [
      "# 開發規格書",
      "",
      "## 拆件清單",
      "- ",
      "",
      "## 組裝說明",
      "- ",
      "",
      "## 測試策略",
      "- "
    ].join("\n");
  }

  if (!readme.includes("## 討論紀錄")) {
    readme += `\n\n## 討論紀錄\n${conversationLog}\n`;
  }

  const opusPrompt = buildOpusSystemPrompt(readme, agents, devSpec);
  const opusRaw = await runSdkPrompt(`opus:${taskId}`, opusModelId, opusPrompt, output);
  const refined = extractJsonPayload(opusRaw);
  if (refined) {
    readme = refined.readme || readme;
    agents = refined.agents || agents;
    devSpec = refined.devSpec || devSpec;
  }

  fs.writeFileSync(path.join(taskDir, "README.md"), readme, "utf8");
  fs.writeFileSync(path.join(taskDir, "AGENTS.md"), agents, "utf8");
  fs.writeFileSync(path.join(taskDir, `dev-spec-${taskId}.md`), devSpec, "utf8");

  provider.refresh();
  session.taskId = taskId;
  session.taskDir = taskDir;
  session.mode = "awaiting_approval";

  gatewayClient.send({
    type: "ufo_request_approval",
    channel: session.channel,
    userId: session.userId,
    taskId,
    taskPath: taskDir
  });
}

async function openTools(context: vscode.ExtensionContext): Promise<void> {
  const toolsPath = getToolsPath(context);
  if (!fs.existsSync(toolsPath)) {
    fs.writeFileSync(
      toolsPath,
      "# UFO 工具區\n\n此區域用來累積已完成的能力模組與可重用資產。\n",
      "utf8"
    );
  }

  await vscode.commands.executeCommand("vscode.open", vscode.Uri.file(toolsPath));
}

export function activate(context: vscode.ExtensionContext): void {
  ensureUfoDirectories(context);
  ensurePersonaFiles(context);

  promptStudioState = loadPromptStudioState(context);

  const tasksRoot = getTasksRoot(context);
  let gatewayConnected = false;
  let gatewayConnectionState: "connected" | "reconnecting" | "disconnected" = "disconnected";
  let gatewayChannels: { line: boolean; telegram: boolean; discord: boolean } = { line: false, telegram: false, discord: false };
  const output = vscode.window.createOutputChannel("UFO");
  const recentMessageIds = new Set<string>();
  const recentMessageIdQueue: string[] = [];
  let hasUfoRouting = false;

  ensureCopilotCliOnPath(output);
  syncEnvFromSettings(context, output);

  const config = vscode.workspace.getConfiguration("ufo");
  const gatewayUrl = config.get<string>("gatewayUrl", "ws://localhost:3000");
  const gatewayClient = new GatewayClient(gatewayUrl);

  // Will be assigned after providers are created (used by dashboard callbacks).
  let refreshAllProviders: () => void = () => undefined;

  // UI: hide legacy queue views by default (Pending/Approved/Running/Done).
  const updateQueueViewsContext = () => {
    const showQueues = vscode.workspace.getConfiguration("ufo").get<boolean>("ui.showQueueViews", false);
    void vscode.commands.executeCommand("setContext", "ufo.showQueueViews", showQueues);
  };
  updateQueueViewsContext();

  const buildState = () => buildDashboardState(context, gatewayConnected, gatewayConnectionState, gatewayChannels);
  let dashboardProvider!: UfoDashboardProvider;
  const createTaskFromInterview = async (payload: {
    title: string;
    summary: string;
    interview: { goal: string; output: string; acceptance: string; constraints: string; transcript: string };
  }): Promise<{ taskId: string; taskDir: string; title: string }> => {
    const createdAt = new Date().toISOString();
    const taskTitle = payload.title || "task";
    const taskId = `${createdAt.replace(/[:.]/g, "-")}-${slugify(taskTitle) || "task"}`;
    const taskDir = path.join(getTasksRoot(context), "pending", taskId);
    ensureDirectory(taskDir);
    try { dashboardProvider?.log("info", `📝 Interview -> create task: ${taskId}`, "info"); } catch {}

    // Generate a dev spec draft via Copilot SDK (best effort).
    const specModel = vscode.workspace.getConfiguration("ufo").get<string>("models.spec", "gemini-3-pro-preview");
    let devSpec = "";
    try {
      const specPrompt = [
        "你是 UFO（👾）。請根據以下訪談內容，產出一份可交接給工程師的「開發規格書」Markdown。",
        "要求：",
        "- 只輸出 Markdown（不要 JSON）",
        "- 包含：拆件清單、組裝說明、驗收標準（可轉成條列）、測試策略、風險/注意事項",
        "",
        "訪談內容：",
        payload.interview.transcript,
        "",
        "請開始輸出："
      ].join("\n");
      devSpec = await runSdkPrompt(`ui-spec:${taskId}`, specModel, specPrompt, output);
    } catch (err) {
      output.appendLine(`[UFO] Spec generation failed, using fallback: ${String(err)}`);
    }
    if (!devSpec.trim()) {
      devSpec = [
        "# 開發規格書",
        "",
        "## 訪談摘要",
        `- 目標：${payload.interview.goal}`,
        `- 交付物：${payload.interview.output}`,
        `- 驗收：${payload.interview.acceptance}`,
        `- 限制/偏好：${payload.interview.constraints}`,
        "",
        "## 拆件清單",
        "- ",
        "",
        "## 組裝說明",
        "- ",
        "",
        "## 測試策略",
        "- ",
      ].join("\n");
    }

    const readme = [
      buildTaskSpecContent(taskTitle, payload.summary, createdAt, ["- Control Center 訪談建立"]),
      "",
      "## 訪談紀錄",
      "```",
      payload.interview.transcript,
      "```",
      ""
    ].join("\n");
    const agents = [
      "# AGENTS",
      "",
      "## 必讀文件",
      "- README.md",
      "- dev-spec-*.md",
      "",
      "## 開發注意事項",
      "- 先閱讀需求與範圍，確認驗收條件",
      "- 所有輸出請放在任務資料夾內（不要寫到 /Users/... 等系統路徑）",
      "- 若需要危險操作請發出 pending confirmation",
    ].join("\n");

    fs.writeFileSync(path.join(taskDir, "README.md"), readme, "utf8");
    fs.writeFileSync(path.join(taskDir, "AGENTS.md"), agents, "utf8");
    fs.writeFileSync(path.join(taskDir, `dev-spec-${taskId}.md`), devSpec, "utf8");

    // Keep UI fresh.
    refreshAllProviders();
    return { taskId, taskDir, title: taskTitle };
  };

	  const runTaskInBlueMonster = async (payload: { taskId: string; taskDir: string; title: string }): Promise<{ text: string; previewUrl?: string; pendingConfirmations?: any[] }> => {
	    const tasksRoot = getTasksRoot(context);
	    let taskDir = payload.taskDir;
	    try { dashboardProvider?.log("info", `🚀 Send to BlueMonster: ${payload.taskId}`, "info"); } catch {}
	    const ufoCfg = vscode.workspace.getConfiguration("ufo");
	    const gw = gatewayWsToHttp(ufoCfg.get<string>("gatewayUrl", "ws://localhost:3000"));
	    const bmSync = await syncBlueMonsterFromGateway(gw, output);
	    const parent = path.basename(path.dirname(taskDir));
	    if (parent === "pending") {
	      taskDir = await moveTask(tasksRoot, taskDir, "pending", "in-progress", output);
	      refreshAllProviders();
	    } else if (parent === "approved") {
	      taskDir = await moveTask(tasksRoot, taskDir, "approved", "in-progress", output);
	      refreshAllProviders();
	    }

	    // Ensure task appears in BlueMonster list immediately.
	    try {
	      await vscode.commands.executeCommand("blueMonster.createExternalTask", payload.taskId, taskDir, payload.title);
	    } catch (err) {
	      output.appendLine(`[UFO] Failed to create external task in BlueMonster: ${String(err)}`);
	    }
		    try { await vscode.commands.executeCommand("blueMonster.openView"); } catch {}
		    try { await vscode.commands.executeCommand("blueMonster.setTaskFolder", taskDir); } catch {}
		    try {
		      if (!bmSync.agentMode) {
		        await vscode.commands.executeCommand("blueMonster.setMode", "agent");
		      }
		    } catch {}

		    // Persist which agent is handling this task (for UI display in Running/Done).
		    try {
		      const st = await vscode.commands.executeCommand("blueMonster.getStatus") as any;
		      const agentName = typeof st?.agentName === "string" ? st.agentName : "BlueMonster";
		      const agentEmoji = typeof st?.agentEmoji === "string" ? st.agentEmoji : "👾";
		      const modelId = typeof st?.modelId === "string" ? st.modelId : undefined;
		      const modelName = typeof st?.modelName === "string" ? st.modelName : undefined;
		      writeBmMeta(taskDir, {
		        agentName,
		        agentEmoji,
		        modelId,
		        modelName,
		        requestedModelId: bmSync.requestedModelId,
		        agentMode: bmSync.agentMode,
		        reasoningEffort: bmSync.reasoningEffort,
		        updatedAt: new Date().toISOString(),
		        taskId: payload.taskId
		      });
		    } catch {}

    const readmePath = path.join(taskDir, "README.md");
    const agentsPath = path.join(taskDir, "AGENTS.md");
    const devSpecPath = findDevSpecFile(taskDir);
    const prompt = [
      "你是 BlueMonster，請接手 UFO 任務並在本機 VS Code 專案中實際執行。",
      "",
      `UFO 任務資料夾（請視為工作目錄）：${taskDir}`,
      "重要限制：",
      "- 所有輸出檔案必須寫在上述任務資料夾內（不要寫到 /Users/... 或其他系統路徑）",
      "- 如果產出可預覽的網頁，請優先輸出為 index.html（放在任務資料夾根目錄）",
      "",
      "請先閱讀：",
      `- ${readmePath}`,
      fs.existsSync(agentsPath) ? `- ${agentsPath}` : "",
      devSpecPath ? `- ${devSpecPath}` : "",
      "",
      "輸出要求：",
      "- 用精簡文字回覆你做了什麼、改了哪些檔案、以及如何驗證",
    ].filter(Boolean).join("\n");

	    const result = await vscode.commands.executeCommand("blueMonster.sendMessageExternal", prompt, "agent") as any;
    const text = typeof result?.text === "string" ? result.text : "";
    const pendingConfirmations = Array.isArray(result?.pendingConfirmations) ? result.pendingConfirmations : [];

    // If confirmation is needed, keep task in-progress and return.
    if (pendingConfirmations.length > 0) {
      return { text: text || "BlueMonster 需要確認後才能繼續。", pendingConfirmations };
    }

    // Generate preview URL using the simpler /preview endpoint
    let previewUrl: string | undefined;
    try {
      const overrideBaseRaw = ufoCfg.get<string>("publicUrl", "") || "";
      const baseUrl = await resolvePublicBaseUrl(gw, overrideBaseRaw, output);
      const previewPath = findPreviewHtmlFile(taskDir);
      if (previewPath) {
        const taskId = path.basename(taskDir);
        // Use the /preview/:taskId endpoint which auto-searches status folders
        const previewPathPart = `/preview/${taskId}`;
        previewUrl = baseUrl
          ? `${baseUrl}${previewPathPart}`
          : `${gw}${previewPathPart}`;
        if (previewUrl) {
          const localMark = /localhost|127\.0\.0\.1/i.test(previewUrl) ? "（本機）" : "";
          try {
            await vscode.commands.executeCommand("blueMonster.addSystemNote", `🌐 Preview${localMark}: ${previewUrl}`);
          } catch {}
        }
      }
    } catch (err) {
      output.appendLine(`[UFO] Preview URL generation failed: ${String(err)}`);
    }

    // Move to done.
    try {
      const fromStatus = path.basename(path.dirname(taskDir));
      const moved = await moveTask(tasksRoot, taskDir, fromStatus as any, "done", output);
      taskDir = moved;
      refreshAllProviders();
    } catch (err) {
      output.appendLine(`[UFO] Failed to move UI task to done: ${String(err)}`);
    }

    return { text: text || "（BlueMonster 未回傳文字結果）", previewUrl };
  };

  dashboardProvider = new UfoDashboardProvider(
    context,
    buildState,
    (command) => vscode.commands.executeCommand(command),
    createTaskFromInterview,
    runTaskInBlueMonster,
    output
  );
  const promptStudioPanel = new PromptStudioPanel(context);

  // 將 dashboard log 連接到 Gemini client
  geminiClient.setDashboardLog((tag: string, message: string, tagClass: string) => {
    dashboardProvider.log(tag, message, tagClass);
  });

  // 建立四個獨立的任務視窗 Provider
  const pendingProvider = new SingleStatusTaskProvider(tasksRoot, "pending", () => dashboardProvider.update());
  const approvedProvider = new SingleStatusTaskProvider(tasksRoot, "approved", () => dashboardProvider.update());
  const runningProvider = new SingleStatusTaskProvider(tasksRoot, "in-progress", () => dashboardProvider.update());
  const doneProvider = new SingleStatusTaskProvider(tasksRoot, "done", () => dashboardProvider.update());
  
  // 統一刷新所有 Provider
  refreshAllProviders = () => {
    pendingProvider.refresh();
    approvedProvider.refresh();
    runningProvider.refresh();
    doneProvider.refresh();
    dashboardProvider.update();
  };

  const sessions = new Map<string, UfoSession>();
  const maxHistory = 20;

  const getSession = (meta: { channel: string; userId: string }): UfoSession => {
    const key = getSessionKey(meta.channel, meta.userId);
    let session = sessions.get(key);
    if (!session) {
      session = {
        key,
        userId: meta.userId,
        channel: meta.channel,
        history: []
      };
      sessions.set(key, session);
    }
    return session;
  };

  const recordHistory = (session: UfoSession, role: UfoRole, content: string) => {
    session.history.push({ role, content });
    if (session.history.length > maxHistory) {
      session.history.splice(0, session.history.length - maxHistory);
    }
  };

  const sendToUser = (channel: string, userId: string, content: string, chatId?: string, replyToken?: string) => {
    // 在選項前加分隔線（偵測「方案」「選擇」「選項」等關鍵字）
    const formattedContent = content.replace(
      /(\n)(方案\s*[A-Z]|選項\s*[A-Z0-9]|[A-Z]\s*[—–-]\s*|[A-Z]\)\s*)/g,
      '\n\n──────────────\n$2'
    );

    const chunks = splitMessage(formattedContent, 800);
    for (let i = 0; i < chunks.length; i++) {
      // Only use replyToken for the first chunk (LINE reply API can only be used once)
      const tokenForChunk = i === 0 ? replyToken : undefined;
      gatewayClient.send({ type: "copilot_response", channel, userId, chatId, content: chunks[i], replyToken: tokenForChunk });
    }
  };

  const handleIncomingText = async (
    text: string,
    meta: {
      channel: string;
      userId: string;
      chatId?: string;
      messageId?: string;
      timestamp?: string;
      replyToken?: string; // LINE reply token for faster response
    }
  ) => {
    const normalizedText = text.trim();
    if (!normalizedText) {
      return;
    }
    output.appendLine(`[UFO] Incoming message (${meta.channel}): ${normalizedText.substring(0, 50)}...`);
    dashboardProvider.log('info', `Incoming [${meta.channel}]: ${normalizedText.substring(0, 80)}`, 'info');
    if (!rememberMessageId(meta.messageId, recentMessageIds, recentMessageIdQueue)) {
      return;
    }

	    const session = getSession(meta);
	    const config = vscode.workspace.getConfiguration("ufo");
	    const chatModelId = config.get<string>("models.chat", "gemini-3-pro-preview");

    // Handle slash commands
    if (normalizedText.startsWith('/')) {
      const [cmd, ...args] = normalizedText.slice(1).split(/\s+/);
      const cmdLower = cmd.toLowerCase();
      const argText = args.join(' ').trim();

      if (cmdLower === 'help' || cmdLower === '?' || cmdLower === 'h') {
        const helpText = [
          '📋 **UFO 指令列表**',
          '',
          '`/help` - 顯示此說明',
          '`/task <描述>` - 建立任務並交給 BlueMonster',
          '`/model [名稱]` - 查看或切換聊天模型',
          '`/url` - 顯示 Gateway 公開網址',
          '`/status` - 顯示連線狀態',
          '',
          '💡 **提示**：直接描述你想做的事也可以觸發任務建立（例如：「幫我做一個登入頁面」）'
        ].join('\n');
        sendToUser(meta.channel, meta.userId, helpText, meta.chatId, meta.replyToken);
        return;
      }

      if (cmdLower === 'url' || cmdLower === 'link') {
        const gwUrl = config.get<string>("gatewayUrl", "ws://localhost:3000");
        const publicUrl = config.get<string>("publicUrl", "");
        const httpUrl = gwUrl.replace(/^ws/, 'http').replace(/\/+$/, '');
        const lines = [
          '🔗 **Gateway URLs**',
          `- Local: ${httpUrl}`,
        ];
        if (publicUrl && !isPlaceholder(publicUrl)) {
          lines.push(`- Public: ${publicUrl}`);
        }
        sendToUser(meta.channel, meta.userId, lines.join('\n'), meta.chatId, meta.replyToken);
        return;
      }

      if (cmdLower === 'status') {
        const gwUrl = config.get<string>("gatewayUrl", "ws://localhost:3000");
        const connected = gatewayConnected ? '✅ 已連線' : '❌ 未連線';
        let bmStatus = 'Unknown';
        try {
          const st = await vscode.commands.executeCommand("blueMonster.getStatus") as any;
          const name = st?.agentName || 'BlueMonster';
          const busy = st?.busy ? '忙碌中' : '閒置';
          const model = st?.modelId || 'unknown';
          bmStatus = `${name} (${model}) - ${busy}`;
        } catch { bmStatus = '無法取得'; }
        const lines = [
          '📊 **UFO 狀態**',
          `- Gateway: ${connected}`,
          `- URL: ${gwUrl}`,
          `- BlueMonster: ${bmStatus}`,
          `- Chat Model: ${chatModelId}`
        ];
        sendToUser(meta.channel, meta.userId, lines.join('\n'), meta.chatId, meta.replyToken);
        return;
      }

	      if (cmdLower === 'model') {
	        if (!argText) {
	          const currentModel = chatModelId;
	          const availableModels = ['gemini-3-pro-preview', 'gemini-3-flash-preview', 'gemini-2.5-pro', 'gpt-5-mini', 'gpt-4o', 'claude-sonnet', 'claude-opus'];
	          const lines = [
	            '🤖 **模型設定**',
	            `- 目前: ${currentModel}`,
            '',
            '可用模型:',
            ...availableModels.map(m => `- \`/model ${m}\``)
          ];
          sendToUser(meta.channel, meta.userId, lines.join('\n'), meta.chatId, meta.replyToken);
          return;
        }
        // Set the model
        try {
          await config.update("models.chat", argText, vscode.ConfigurationTarget.Workspace);
          sendToUser(meta.channel, meta.userId, `✅ 聊天模型已切換為: ${argText}`, meta.chatId, meta.replyToken);
        } catch (err) {
          sendToUser(meta.channel, meta.userId, `❌ 無法切換模型: ${String(err)}`, meta.chatId, meta.replyToken);
        }
        return;
      }

      if (cmdLower === 'task' || cmdLower === 'do' || cmdLower === 'work') {
        if (!argText) {
          sendToUser(meta.channel, meta.userId, '請提供任務描述，例如：`/task 做一個登入頁面`', meta.chatId, meta.replyToken);
          return;
        }
        // Force work intent - create task directly
        const created = await createUfoTaskBundleFromConversation({
          context,
          output,
          refreshAllProviders,
          session,
          requestText: argText,
          startImmediately: false
        });
        session.pendingDelegation = {
          originalText: argText,
          askedAt: new Date().toISOString(),
          taskId: created.taskId,
          taskDir: created.taskDir,
          readmePath: created.readmePath
        };
        try {
          await vscode.commands.executeCommand("vscode.open", vscode.Uri.file(created.readmePath));
        } catch {}
        sendToUser(
          meta.channel,
          meta.userId,
          `✅ 已建立 UFO 任務：${created.taskId}\n- 路徑：${created.taskDir}\n\n要交給 BlueMonster 開始執行嗎？回覆 \`交給\`（或 \`1\`）；如果先不用，回覆 \`先不用\`（或 \`2\`）。`,
          meta.chatId,
          meta.replyToken
        );
        return;
      }

      // Unknown command - show help hint
      sendToUser(meta.channel, meta.userId, `❓ 未知指令: /${cmd}\n輸入 /help 查看可用指令`, meta.chatId, meta.replyToken);
      return;
    }

    // If we are waiting for a BlueMonster confirmation response, handle it here.
    const conf = parseBmConfirmationAction(normalizedText);
    if (conf) {
      try {
        const res = await vscode.commands.executeCommand(
          "blueMonster.respondToConfirmation",
          conf.id,
          conf.action
        );
        const msg = typeof res === "string" ? res : `Confirmation ${conf.id} -> ${conf.action}`;
        sendToUser(meta.channel, meta.userId, msg, meta.chatId, meta.replyToken);
      } catch (err) {
        sendToUser(meta.channel, meta.userId, `❌ 無法回覆確認：${String(err)}`, meta.chatId, meta.replyToken);
      }
      return;
    }

    // Handle "好"/"1" response to create task from conversation (when LLM suggested it)
    const quickYes = parseYesNo(normalizedText);
    if (quickYes === true && !session.pendingDelegation && !session.bmRun) {
      // User said yes - create task from recent conversation
      const recentHistory = session.history?.slice(-6) || [];
      const lastUserMsg = recentHistory.filter(h => h.role === 'user').pop();
      const requestText = lastUserMsg?.content || normalizedText;

      if (requestText && requestText !== normalizedText) {
        const created = await createUfoTaskBundleFromConversation({
          context,
          output,
          refreshAllProviders,
          session,
          requestText,
          startImmediately: false
        });

        session.pendingDelegation = {
          originalText: requestText,
          askedAt: new Date().toISOString(),
          taskId: created.taskId,
          taskDir: created.taskDir,
          readmePath: created.readmePath
        };

        try {
          await vscode.commands.executeCommand("vscode.open", vscode.Uri.file(created.readmePath));
        } catch {}

        sendToUser(
          meta.channel,
          meta.userId,
          `✅ 已建立任務：${created.taskId}\n\n要交給 BlueMonster 執行嗎？回覆「1」開始執行，「2」先不用。`,
          meta.chatId,
          meta.replyToken
        );
        return;
      }
    }

    // If we previously asked whether to delegate a work request, interpret 1/2 here.
    if (session.pendingDelegation) {
      const pending = session.pendingDelegation;
      if (looksLikeProgressQuery(normalizedText)) {
        const pendingTasks = Array.isArray(pending.tasks) ? pending.tasks : [];
        const isMulti = pending.multiAgent === true || pendingTasks.length > 0;
        const tid = pending.taskId || "（unknown）";
        const tdir = pending.taskDir || "（unknown）";
        const multiLines = isMulti
          ? (() => {
              const top = pendingTasks.slice(0, 6);
              const list = top.map((t, i) => `- (${i + 1}/${pendingTasks.length}) ${t.title} [${t.taskId}]`).join("\n");
              const more = pendingTasks.length > 6 ? `\n- ... +${pendingTasks.length - 6} 個子任務` : "";
              return `目前狀態：已建立 ${pendingTasks.length} 個子任務（pending），尚未交接 BlueMonster 執行。\n${list}${more}`;
            })()
          : `目前狀態：已建立任務（pending），尚未交接 BlueMonster 執行。\n- 任務：${tid}\n- 路徑：${tdir}`;
        sendToUser(
          meta.channel,
          meta.userId,
          `${multiLines}\n\n要我開始執行嗎？回覆 \`交給\`（或 \`1\`）；如果先不用，回覆 \`先不用\`（或 \`2\`）。`,
          meta.chatId,
          meta.replyToken
        );
        return;
      }
      const yn = parseYesNo(normalizedText);
      if (yn === null) {
        sendToUser(
          meta.channel,
          meta.userId,
          "請回覆 `交給`（或 `1`，交接 BlueMonster 執行）或 `先不用`（或 `2`）。",
          meta.chatId,
          meta.replyToken
        );
        return;
      }
      const original = pending.originalText;
      const pendingTaskId = pending.taskId;
      const pendingTaskDir = pending.taskDir;
      const pendingTasks = Array.isArray(pending.tasks) ? pending.tasks : [];
      const isMulti = pending.multiAgent === true || pendingTasks.length > 0;
      session.pendingDelegation = undefined;
      if (yn) {
        if (isMulti) {
          const runId = `mr-${Date.now().toString(36)}`;
          const startedAt = new Date().toISOString();
          session.bmRun = {
            startedAt,
            runId,
            tasks: pendingTasks.map((t) => ({ taskId: t.taskId, taskDir: t.taskDir, title: t.title })),
            remaining: pendingTasks.length
          };

          const list = pendingTasks
            .slice(0, 8)
            .map((t, i) => `- (${i + 1}/${pendingTasks.length}) ${t.title} [${t.taskId}]`)
            .join("\n");
          const more = pendingTasks.length > 8 ? `\n- ... +${pendingTasks.length - 8} 個子任務` : "";

          sendToUser(
            meta.channel,
            meta.userId,
            `🚀 已開始以多 Agent 方式執行 ${pendingTasks.length} 個子任務（會陸續回報結果）：\n${list}${more}`,
            meta.chatId,
            meta.replyToken
          );

          // Best-effort: open the first task spec for visibility.
          try {
            const first = pendingTasks[0];
            if (first?.readmePath && fs.existsSync(first.readmePath)) {
              await vscode.commands.executeCommand("vscode.open", vscode.Uri.file(first.readmePath));
            }
          } catch {}

          // NOTE: BlueMonster external API is not task-isolated yet; run subtasks sequentially to avoid cross-talk.
          const concurrency = 1;
          const queue = pendingTasks.slice();
          const worker = async () => {
            while (queue.length > 0) {
              const next = queue.shift();
              if (!next) return;
              let taskDir = next.taskDir;
              // Ensure task is in-progress before running.
              try {
                const parent = path.basename(path.dirname(taskDir));
                if (parent === "pending") {
                  taskDir = await moveTask(tasksRoot, taskDir, "pending", "in-progress", output);
                  refreshAllProviders();
                } else if (parent === "approved") {
                  taskDir = await moveTask(tasksRoot, taskDir, "approved", "in-progress", output);
                  refreshAllProviders();
                }
              } catch (err) {
                output.appendLine(`[UFO] Failed to move multi-agent task to in-progress: ${String(err)}`);
              }

              const childSession: UfoSession = {
                ...session,
                taskId: next.taskId,
                taskTitle: next.title,
                taskDir,
                bmRun: { taskId: next.taskId, taskDir, startedAt }
              };

              try {
                await executeUfoTaskWithBlueMonster({
                  context,
                  refreshAllProviders,
                  output,
                  dashboardProvider,
                  gatewayClient,
                  meta,
                  session: childSession,
                  taskDir,
                  requestText: original,
                  sendPrefix: `【${next.title}】 `
                });
              } catch (err) {
                output.appendLine(`[UFO] Multi-agent execution failed for ${next.taskId}: ${String(err)}`);
              } finally {
                // Consider task complete when it has been moved out of in-progress.
                const completed = !fs.existsSync(taskDir);
                if (session.bmRun && session.bmRun.runId === runId && typeof session.bmRun.remaining === "number") {
                  if (completed) {
                    session.bmRun.remaining = Math.max(0, session.bmRun.remaining - 1);
                    if (session.bmRun.remaining === 0) {
                      session.bmRun = undefined;
                      sendToUser(meta.channel, meta.userId, "✅ 多 Agent 子任務已全部完成。", meta.chatId, meta.replyToken);
                    }
                  }
                }
              }
            }
          };

          void Promise.all(Array.from({ length: Math.min(concurrency, pendingTasks.length) }, () => worker()));
          return;
        }

        let taskDir = pendingTaskDir || session.taskDir;
        let taskId = pendingTaskId || session.taskId;

        if (!taskDir || !fs.existsSync(taskDir)) {
          const created = await createUfoTaskBundleFromConversation({
            context,
            output,
            refreshAllProviders,
            session,
            requestText: original,
            startImmediately: true
          });
          taskDir = created.taskDir;
          taskId = created.taskId;
        } else {
          const parent = path.basename(path.dirname(taskDir));
          if (parent === "pending") {
            taskDir = await moveTask(tasksRoot, taskDir, "pending", "in-progress", output);
            refreshAllProviders();
          } else if (parent === "approved") {
            taskDir = await moveTask(tasksRoot, taskDir, "approved", "in-progress", output);
            refreshAllProviders();
          }
        }

        session.taskDir = taskDir;
        session.taskId = taskId;
        session.bmRun = { taskId: taskId || undefined, taskDir, startedAt: new Date().toISOString() };

        const readmePath = path.join(taskDir, "README.md");
        sendToUser(
          meta.channel,
          meta.userId,
          `🚀 已開始執行任務：${taskId || path.basename(taskDir)}\n- 路徑：${taskDir}`,
          meta.chatId,
          meta.replyToken
        );

        // Open the task spec for visibility in VS Code.
        try {
          if (fs.existsSync(readmePath)) {
            await vscode.commands.executeCommand("vscode.open", vscode.Uri.file(readmePath));
          }
        } catch {}

        await executeUfoTaskWithBlueMonster({
          context,
          refreshAllProviders,
          output,
          dashboardProvider,
          gatewayClient,
          meta,
          session,
          taskDir,
          requestText: original
        });
      } else {
        sendToUser(
          meta.channel,
          meta.userId,
          `好，先不交接 BlueMonster 執行。任務已建立在 pending${pendingTaskId ? `：${pendingTaskId}` : ""}。\n需要我開始執行再回覆「交給」。`,
          meta.chatId,
          meta.replyToken
        );
      }
      return;
    }

    // If BlueMonster is currently running a task for this session, prioritize progress/status responses.
    if (session.bmRun) {
      if (looksLikeProgressQuery(normalizedText)) {
        try {
          const status = await vscode.commands.executeCommand("blueMonster.getStatus") as any;
          const name = typeof status?.agentName === "string" && status.agentName.trim() ? status.agentName.trim() : "BlueMonster";
          const emoji = typeof status?.agentEmoji === "string" && status.agentEmoji.trim() ? status.agentEmoji.trim() : "👾";
          const busy = Boolean(status?.busy);
          const activity = typeof status?.activityStatus === "string" ? status.activityStatus : (busy ? "Working" : "Idle");
          const lines = Array.isArray(status?.activityLines) ? status.activityLines.filter((l: any) => typeof l === "string") : [];
          const lastLine = lines.length > 0 ? lines[lines.length - 1] : "";
          const pendingConfs = Number(status?.pendingConfirmations || 0);

          const startedAt = Date.parse(session.bmRun.startedAt);
          const elapsedMs = Number.isFinite(startedAt) ? Date.now() - startedAt : 0;
          const elapsedMin = elapsedMs > 0 ? Math.max(1, Math.round(elapsedMs / 60000)) : 0;
          const elapsedText = elapsedMin > 0 ? `${elapsedMin} 分鐘` : "剛剛";

          if (busy) {
            const msg = [
              `${emoji} ${name} 還在作業中（已 ${elapsedText}）`,
              `目前狀態：${activity}${lastLine ? ` — ${lastLine}` : ""}`,
              pendingConfs > 0 ? `需要你確認：${pendingConfs} 個動作（我可以把確認項目貼給你）` : "",
              "",
              `這段時間你可以先做別的事或聊聊天；要我每隔一段時間主動回報進度也可以。`
            ].filter(Boolean).join("\n");
            sendToUser(meta.channel, meta.userId, msg, meta.chatId, meta.replyToken);
          } else {
            sendToUser(
              meta.channel,
              meta.userId,
              `看起來 ${name} 目前是 Idle。我正在整理交付結果或已回覆在上面；如果你沒收到結果，我可以再貼一次。`,
              meta.chatId,
              meta.replyToken
            );
          }
        } catch (err) {
          sendToUser(meta.channel, meta.userId, `我正在執行任務中，但目前無法取得 BlueMonster 狀態：${String(err)}`, meta.chatId, meta.replyToken);
        }
        return;
      }

      // Non-progress messages while busy: keep it simple and don't start new flows.
      sendToUser(
        meta.channel,
        meta.userId,
        "BlueMonster 正在執行任務中。你可以問我「目前進度？」我會回報；或先跟我聊聊天也可以。",
        meta.chatId,
        meta.replyToken
      );
      return;
    }

    recordHistory(session, "user", normalizedText);
    appendUserProfile(context, normalizedText);

    // Let LLM naturally handle conversation - no keyword detection
    const systemPrompt = [
      `你是 UFO，一個聰明的 AI 助理，連接到使用者的 VS Code 開發環境。

**你的能力：**
- 自然對話、回答問題、提供建議、腦力激盪
- 當使用者需要實際執行某件事時，可以建立任務交給 BlueMonster（VS Code 內的 AI Agent）執行

**對話原則：**
- 自然、簡潔、有幫助
- 如果使用者只是聊天或問問題，就正常回答
- 如果使用者想要你「做」某件事（寫程式、建網站、修 bug、產出檔案等），告訴他們：「要我建立任務交給 BlueMonster 執行嗎？回覆『好』或『1』我就開始。」
- 不要在使用者沒有明確同意前建立任務
- 使用者也可以用 /task <描述> 直接建立任務

**可用指令（告知使用者）：**
- /task <描述> - 建立任務
- /model - 查看/切換模型
- /status - 查看狀態
- /help - 說明`,
      loadPersonaContext(context),
      loadCopilotInstructions(context),
      buildChatSystemPrompt()
    ]
      .map((value) => value.trim())
      .filter(Boolean)
      .join("\n\n");
    const fullPrompt = systemPrompt
      ? `${systemPrompt}\n\nUser: ${normalizedText}`
      : `User: ${normalizedText}`;
    const sessionKey = `${meta.channel}:${meta.userId}`;
    
    // 隨機 emoji 陣列
    const randomEmojis = ['✨', '🤔', '🙂‍↔️', '🛸', '🤩', '😮', '🤭', '🥕', '🥦', '🌟', '💓', '👀'];
    const getRandomEmoji = () => randomEmojis[Math.floor(Math.random() * randomEmojis.length)];
    
    // 思考階段訊息（5 個循環，每 10 秒一次）
    const thinkingPhases = [
      'Thinking...',
      'Planning...',
      'Working...',
      'Still working...',
      'Almost there...'
    ];
    
    const useTypingIndicator =
      meta.channel === 'telegram' &&
      config.get<boolean>('telegram.useTypingIndicator', false);

    let typingInterval: NodeJS.Timeout | null = null;

    // If enabled, use Telegram typing indicator (chat action) instead of emitting "Thinking..." messages.
    if (useTypingIndicator) {
      const chatId = meta.chatId || meta.userId;
      // Telegram typing indicator lasts ~5s; refresh periodically while we work.
      const tick = () => gatewayClient.send({ type: 'chat_action', channel: 'telegram', userId: meta.userId, chatId, action: 'typing' });
      tick();
      typingInterval = setInterval(tick, 4000);
    }

    // Track if replyToken has been used (LINE replyToken can only be used once)
    let replyTokenUsed = false;
    const getReplyToken = () => {
      if (replyTokenUsed || !meta.replyToken) return undefined;
      replyTokenUsed = true;
      return meta.replyToken;
    };

    // 發送初始思考訊息（保留舊體驗，可透過設定切換）
    let phaseIndex = 0;
    if (!useTypingIndicator) {
      sendToUser(meta.channel, meta.userId, `👾 ${getRandomEmoji()} ${thinkingPhases[phaseIndex]} 👾`, meta.chatId, getReplyToken());
      dashboardProvider.log('thinking', thinkingPhases[phaseIndex], 'thinking');
    }
    let hasTimedOut = false;

    // 每 10 秒發送下一階段訊息（不使用 replyToken，因為可能已被使用）
    const thinkingInterval = setInterval(() => {
      phaseIndex = (phaseIndex + 1) % thinkingPhases.length;
      if (!useTypingIndicator) {
        sendToUser(meta.channel, meta.userId, `👾 ${getRandomEmoji()} ${thinkingPhases[phaseIndex]} 👾`, meta.chatId);
        dashboardProvider.log('thinking', thinkingPhases[phaseIndex], 'thinking');
      }
    }, 10000);

    // 在 58 秒時發送最後警告（LINE Reply Token 60 秒後失效）
    const timeoutWarning = setTimeout(() => {
      hasTimedOut = true;
      clearInterval(thinkingInterval);
      if (!useTypingIndicator) {
        sendToUser(meta.channel, meta.userId, `👾 ${getRandomEmoji()} 我可能還需要思考久一點，你等等問我進度 👾`, meta.chatId);
      }
    }, 58000);

    try {
      const response = await runSdkPrompt(sessionKey, chatModelId, fullPrompt, output);

      // 清理計時器
      clearInterval(thinkingInterval);
      clearTimeout(timeoutWarning);
      if (typingInterval) {
        clearInterval(typingInterval);
        typingInterval = null;
      }

      if (!hasTimedOut) {
        recordHistory(session, "assistant", response);
        // Use replyToken if available (e.g., if useTypingIndicator was on and we haven't used it yet)
        sendToUser(meta.channel, meta.userId, response, meta.chatId, getReplyToken());
        dashboardProvider.log('response', `Reply: ${response.substring(0, 120)}`, 'response');
      } else {
        output.appendLine(`[UFO] ⚠️ Reply token likely expired, response may require push message`);
        recordHistory(session, "assistant", response);
        // Don't use replyToken - it's likely expired after 58 seconds
        sendToUser(meta.channel, meta.userId, response, meta.chatId);
        dashboardProvider.log('response', `Reply (late): ${response.substring(0, 120)}`, 'response');
      }
    } catch (error) {
      clearInterval(thinkingInterval);
      clearTimeout(timeoutWarning);
      if (typingInterval) {
        clearInterval(typingInterval);
        typingInterval = null;
      }
      const errorMsg = `❌ 發生錯誤: ${String(error)}`;
      // Use replyToken if available
      sendToUser(meta.channel, meta.userId, errorMsg, meta.chatId, getReplyToken());
      dashboardProvider.log('error', String(error), 'error');
    }
  };

  gatewayClient.on("connected", async () => {
    gatewayConnected = true;
    gatewayConnectionState = "connected";
    output.appendLine(`[UFO] Gateway connected: ${gatewayUrl}`);
    dashboardProvider.log('info', `Gateway connected: ${gatewayUrl}`, 'info');

    // Fetch enabled channels from Gateway API
    try {
      const httpUrl = gatewayUrl.replace(/^ws/, 'http').replace(/\/+$/, '');
      const res = await fetch(`${httpUrl}/api/channels`);
      if (res.ok) {
        const data = await res.json() as { channels?: string[] };
        const channels: string[] = data.channels || [];
        gatewayChannels = {
          line: channels.includes('line'),
          telegram: channels.includes('telegram'),
          discord: channels.includes('discord'),
        };
        output.appendLine(`[UFO] Gateway channels: ${channels.join(', ') || 'none'}`);
      }
    } catch (err) {
      output.appendLine(`[UFO] Failed to fetch channels: ${err}`);
    }

    dashboardProvider.update();
  });

  gatewayClient.on("disconnected", (info?: { code?: number; reason?: string }) => {
    gatewayConnected = false;
    gatewayConnectionState = "disconnected";
    const detail = info ? ` (code=${info.code}, reason=${info.reason || "none"})` : "";
    output.appendLine(`[UFO] Gateway disconnected${detail}`);
    dashboardProvider.log('error', `Gateway disconnected${detail}`, 'error');
    dashboardProvider.update();
  });

  gatewayClient.on("health_check_failed", (info: { readyState: number }) => {
    output.appendLine(`[UFO] Health check failed: ws readyState=${info.readyState}, forcing reconnect`);
  });

  gatewayClient.on("reconnecting", (payload: { attempt: number; delayMs: number }) => {
    gatewayConnected = false;
    gatewayConnectionState = "reconnecting";
    output.appendLine(`[UFO] Gateway reconnecting (attempt ${payload.attempt}, ${payload.delayMs}ms)`);
    dashboardProvider.update();
  });

  gatewayClient.on("reconnect_failed", () => {
    gatewayConnected = false;
    gatewayConnectionState = "disconnected";
    output.appendLine("[UFO] Gateway reconnect failed");
    dashboardProvider.update();
  });

  gatewayClient.on("error", (error) => {
    output.appendLine(`[UFO] Gateway error: ${String(error)}`);
    dashboardProvider.update();
  });

  gatewayClient.on("message", (message: any) => {
    if (!message || typeof message !== "object") {
      return;
    }

    if (message.type === "ufo_approved") {
      const taskId = message.taskId as string | undefined;
      const taskPath = message.taskPath as string | undefined;
      if (taskId && taskPath) {
        const approvedDir = getTaskDir(context, "approved", taskId);
        ensureDirectory(path.dirname(approvedDir));
        try {
          fs.renameSync(taskPath, approvedDir);
          const handoff = {
            taskId,
            approvedAt: new Date().toISOString(),
            status: "ready-for-bluemonster"
          };
          fs.writeFileSync(path.join(approvedDir, "handoff.json"), JSON.stringify(handoff, null, 2));
          refreshAllProviders();
          sendToUser(message.channel || "line", message.userId, "✅ 已確認，任務交接給 BlueMonster 進行開發。", message.chatId, message.replyToken);
        } catch (error) {
          output.appendLine(`Failed to move task ${taskId} to approved: ${String(error)}`);
        }
      }
      return;
    }

	    if (message.type === "ufo_message") {
	      hasUfoRouting = true;
	      // 支援所有頻道：line, telegram, discord
	      const media = Array.isArray(message.media) ? message.media : [];
	      let text = typeof message.text === "string" ? message.text : "";
	      if (media.length > 0) {
	        const lines = media.map((m: any) => {
	          const type = typeof m?.type === "string" ? m.type : "file";
	          const name = typeof m?.fileName === "string" ? m.fileName : (typeof m?.id === "string" ? m.id : "");
	          const url = typeof m?.url === "string" ? m.url : "";
	          const extra = url ? ` ${url}` : "";
	          return `- [${type}] ${name}${extra}`;
	        });
	        const hasImage = media.some((m: any) => m?.type === "image");
	        const header = text && text.trim()
	          ? text.trim()
	          : hasImage
	            ? "使用者傳了一張圖片。請確認收到並簡單回應，詢問需要怎麼處理。不要交給 BlueMonster，自己回覆即可。"
	            : "使用者傳了附件。請確認收到並詢問需要怎麼處理。";
	        text = `${header}\n\n附件：\n${lines.join("\n")}`;
	      }
	      if (text && text.trim()) {
	        // Process through UFO for social platform response (default: natural chat).
	        // UFO will ask for explicit confirmation before delegating execution to BlueMonster.
	        handleIncomingText(text, {
	          channel: message.channel || "unknown",
	          userId: message.userId,
	          chatId: typeof message.chatId === "string" ? message.chatId : undefined,
	          messageId: message.messageId,
	          timestamp: message.timestamp,
	          replyToken: typeof message.replyToken === "string" ? message.replyToken : undefined
	        });
	      }
	      return;
	    }

    if (message.type === "chat_message") {
      if (hasUfoRouting) {
        return;
      }
      // 支援所有頻道：line, telegram, discord
      if (typeof message.message === "string") {
        handleIncomingText(message.message, {
          channel: message.channel || "unknown",
          userId: message.userId,
          messageId: message.messageId,
          timestamp: message.timestamp
        });
      }
      return;
    }

    if (message.type === "new_task") {
      // Always forward tasks to BlueMonster for execution (even when UFO routing is active)
      if (message.task && typeof message.instruction === "string") {
        const instruction = message.instruction as string;
        const taskId = message.task.id || "unknown";
        output.appendLine(`[UFO] Forwarding task ${taskId} to BlueMonster: ${instruction.substring(0, 80)}`);
        dashboardProvider.log("info", `→ BlueMonster: ${instruction.substring(0, 60)}`, "info");

        // Mirror gateway-created tasks into UFO's local task folders so they appear in the UI.
        ensureGatewayTaskFolder(context, message.task, instruction, output);
        refreshAllProviders();

        vscode.commands.executeCommand("blueMonster.sendMessage", instruction, "agent").then(
          () => output.appendLine(`[UFO] Task ${taskId} forwarded to BlueMonster`),
          (err: any) => output.appendLine(`[UFO] BlueMonster forward failed: ${String(err)}`)
        );
      }

      // Skip UFO's own processing if UFO routing handles chat separately
      if (hasUfoRouting) {
        return;
      }
      // Also process through UFO for social platform response (legacy routing only)
      if (message.task && typeof message.instruction === "string") {
        handleIncomingText(message.instruction, {
          channel: message.task.channel || "unknown",
          userId: message.task.userId,
          messageId: message.task.id,
          timestamp: message.task.createdAt
        });
      }
    }
  });

  gatewayClient.connect().catch((error) => {
    output.appendLine(`Gateway connect failed: ${String(error)}`);
  });

  context.subscriptions.push(
    output,
    new vscode.Disposable(() => gatewayClient.disconnect()),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("ufo")) {
        syncEnvFromSettings(context, output);
        if (event.affectsConfiguration("ufo.ui.showQueueViews")) {
          updateQueueViewsContext();
        }
        if (event.affectsConfiguration("ufo.gatewayUrl")) {
          // CSP needs to update for new gateway URL
          dashboardProvider.rerender();
        } else {
          dashboardProvider.update();
        }
      }
    }),
    // Keep the Control Center webview alive when hidden (prevents disconnect-like UX when switching views).
    vscode.window.registerWebviewViewProvider("ufoDashboard", dashboardProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    // 註冊四個獨立的任務視窗
    vscode.window.registerTreeDataProvider("ufoTasksPending", pendingProvider),
    vscode.window.registerTreeDataProvider("ufoTasksApproved", approvedProvider),
    vscode.window.registerTreeDataProvider("ufoTasksRunning", runningProvider),
    vscode.window.registerTreeDataProvider("ufoTasksDone", doneProvider),
    vscode.commands.registerCommand("ufo.createTaskSpec", () =>
      createTaskSpec(context, { refresh: refreshAllProviders } as any)
    ),
    vscode.commands.registerCommand("ufo.openTools", () => openTools(context)),
    vscode.commands.registerCommand("ufo.refreshQueue", async () => {
      refreshAllProviders();
      // Also force reconnect to Gateway
      try {
        await gatewayClient.forceReconnect();
      } catch (err) {
        output.appendLine(`[UFO] Force reconnect failed: ${err}`);
      }
    }),
    vscode.commands.registerCommand("ufo.openTasksRoot", () =>
      vscode.commands.executeCommand("revealFileInOS", vscode.Uri.file(getTasksRoot(context)))
    ),
    vscode.commands.registerCommand("ufo.openSettings", () =>
      vscode.commands.executeCommand("workbench.action.openSettings", "ufo")
    ),
    vscode.commands.registerCommand("ufo.syncEnv", () => {
      syncEnvFromSettings(context, output);
      dashboardProvider.update();
    }),
    vscode.commands.registerCommand("ufo.ensurePublicUrl", async () => {
      const cfg = vscode.workspace.getConfiguration("ufo");
      const currentRaw = cfg.get<string>("publicUrl", "") || "";
      const current = stripTrailingSlashes(currentRaw);
      const hasConfigured = Boolean(current && !isPlaceholder(current) && !isLocalhostUrl(current));
      const isTrycloudflare = /trycloudflare\\.com/i.test(current);
      const runtimeActive =
        Boolean(
          current &&
          cloudflaredTunnel.publicUrl &&
          stripTrailingSlashes(cloudflaredTunnel.publicUrl) === current &&
          cloudflaredTunnel.proc &&
          !cloudflaredTunnel.proc.killed
        );
      if (hasConfigured && !isTrycloudflare) {
        // Stable public base already configured by user.
        dashboardProvider.update();
        return;
      }
      if (hasConfigured && isTrycloudflare && runtimeActive) {
        // Ephemeral public base is configured and the tunnel is still running in this session.
        dashboardProvider.update();
        return;
      }

      const gwUrlRaw = cfg.get<string>("gatewayUrl", "ws://localhost:3000");
      const gwHttp = gatewayWsToHttp(gwUrlRaw || "ws://localhost:3000");
      const base = stripTrailingSlashes(gwHttp);

      try {
        if (!isLocalhostUrl(base)) {
          if (!hasConfigured || isTrycloudflare) {
            await cfg.update("publicUrl", base, vscode.ConfigurationTarget.Workspace);
          }
          dashboardProvider.update();
          return;
        }

        const publicUrl = await ensureCloudflaredQuickTunnel(base, output);
        if (publicUrl) {
          await cfg.update("publicUrl", stripTrailingSlashes(publicUrl), vscode.ConfigurationTarget.Workspace);
        }
        dashboardProvider.update();
      } catch (err) {
        output.appendLine(`[UFO] Failed to ensure public URL: ${String(err)}`);
        vscode.window.showWarningMessage(`cloudflared tunnel failed: ${String(err)}`);
      }
    }),
    vscode.commands.registerCommand("ufo.stopPublicUrl", async () => {
      stopCloudflaredQuickTunnel();
      const cfg = vscode.workspace.getConfiguration("ufo");
      const current = cfg.get<string>("publicUrl", "") || "";
      // Only clear the setting if it's the ephemeral trycloudflare URL we created.
      if (current && /trycloudflare\\.com/i.test(current)) {
        try {
          await cfg.update("publicUrl", "", vscode.ConfigurationTarget.Workspace);
        } catch {}
      }
      dashboardProvider.update();
    }),
    vscode.commands.registerCommand("ufo.openPromptStudio", () => promptStudioPanel.show()),
    // 任務狀態移動命令
    vscode.commands.registerCommand("ufo.approveTask", async (item: TaskItem) => {
      if (item?.fullPath && item.isDirectory) {
        await moveTask(tasksRoot, item.fullPath, "pending", "approved", output);
        refreshAllProviders();
        // 通知 Gateway（同步到 Telegram）
        const taskName = path.basename(item.fullPath);
        gatewayClient.send({
          type: "task_status_change",
          taskId: taskName,
          from: "pending",
          to: "approved",
          message: `✅ 任務已批准: ${taskName}`
        });
      }
    }),
    vscode.commands.registerCommand("ufo.startTask", async (item: TaskItem) => {
      if (item?.fullPath && item.isDirectory) {
        await moveTask(tasksRoot, item.fullPath, "approved", "in-progress", output);
        refreshAllProviders();
        // 通知 Gateway（同步到 Telegram）
        const taskName = path.basename(item.fullPath);
        gatewayClient.send({
          type: "task_status_change",
          taskId: taskName,
          from: "approved",
          to: "in-progress",
          message: `🚀 任務開始執行: ${taskName}`
        });
        // 自動觸發 Copilot 執行任務
        await executeTaskWithCopilot(item.fullPath, output);
      }
    }),
    vscode.commands.registerCommand("ufo.completeTask", async (item: TaskItem) => {
      if (item?.fullPath && item.isDirectory) {
        await moveTask(tasksRoot, item.fullPath, "in-progress", "done", output);
        refreshAllProviders();
        // 通知 Gateway（同步到 Telegram）
        const taskName = path.basename(item.fullPath);
        gatewayClient.send({
          type: "task_status_change",
          taskId: taskName,
          from: "in-progress",
          to: "done",
          message: `✨ 任務已完成: ${taskName}`
        });
      }
    }),
    vscode.commands.registerCommand("ufo.rejectTask", async (item: TaskItem) => {
      if (item?.fullPath && item.isDirectory) {
        const confirm = await vscode.window.showWarningMessage(
          `確定要刪除任務嗎？`,
          { modal: true },
          "刪除"
        );
        if (confirm === "刪除") {
          await fs.promises.rm(item.fullPath, { recursive: true, force: true });
          output.appendLine(`Task deleted: ${item.fullPath}`);
          refreshAllProviders();
        }
      }
    })
  );

  dashboardProvider.update();
}

export function deactivate(): void {
  void geminiClient.shutdown();
  stopCloudflaredQuickTunnel();
}
