import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { CopilotClient, CopilotSession } from "@github/copilot-sdk";
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
  taskTitle?: string;
  taskId?: string;
  taskDir?: string;
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

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly getState: () => DashboardState,
    private readonly onCommand: (command: string) => void
  ) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri]
    };
    view.webview.html = getDashboardHtml(view.webview, this.getState());
    view.webview.onDidReceiveMessage((message) => {
      if (!message || typeof message !== "object") {
        return;
      }
      if (message.type === "command" && typeof message.command === "string") {
        this.onCommand(message.command);
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

function buildDashboardState(
  context: vscode.ExtensionContext,
  connected: boolean,
  connectionState: "connected" | "reconnecting" | "disconnected"
): DashboardState {
  const config = vscode.workspace.getConfiguration("ufo");
  const gatewayUrl = config.get<string>("gatewayUrl", "ws://localhost:3000");
  const publicUrl = config.get<string>("publicUrl", "") || "";
  const envAutoSync = config.get<boolean>("env.autoSync", true);
  const chatModel = config.get<string>("models.chat", "gpt-5-mini");
  const specModel = config.get<string>("models.spec", "gpt-5-mini");
  const opusModel = config.get<string>("models.opus", "opus-4.5");

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

  return {
    connected,
    connectionState,
    gatewayUrl,
    publicUrl,
    envAutoSync,
    tasksRoot: getTasksRoot(context),
    tasks: getTaskCounts(context),
    models: {
      chat: chatModel,
      spec: specModel,
      opus: opusModel
    },
    channels: {
      line: lineConfigured,
      telegram: telegramConfigured,
      discord: discordConfigured
    },
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

class UfoCopilotSdkManager {
  private client: CopilotClient | null = null;
  private sessions = new Map<string, { session: CopilotSession; model: string }>();
  private initPromise: Promise<void> | null = null;
  private output: vscode.OutputChannel | null = null;

  setOutput(output: vscode.OutputChannel): void {
    this.output = output;
  }

  private log(message: string): void {
    if (this.output) {
      this.output.appendLine(`[UFO] ${message}`);
    }
    console.log(`[UFO] ${message}`);
  }

  async initialize(): Promise<void> {
    if (this.client) {
      return;
    }
    if (this.initPromise) {
      return this.initPromise;
    }
    this.initPromise = (async () => {
      this.log("🚀 Initializing Copilot SDK...");
      this.client = new CopilotClient({
        autoStart: true,
        autoRestart: true,
        useLoggedInUser: true,
        logLevel: "warning"
      });
      await this.client.start();
      this.log("✅ Copilot SDK client started");
    })();
    return this.initPromise;
  }

  async getSession(sessionKey: string, model: string): Promise<CopilotSession> {
    await this.initialize();
    if (!this.client) {
      throw new Error("Copilot SDK client not initialized");
    }
    const existing = this.sessions.get(sessionKey);
    if (existing && existing.model === model) {
      return existing.session;
    }
    if (existing) {
      try {
        await existing.session.destroy();
      } catch {}
      this.sessions.delete(sessionKey);
    }
    // 移除 sessionKey 中的非法字元（冒號等），確保 sessionId 合法
    const sanitizedKey = sessionKey.replace(/[^a-zA-Z0-9_-]/g, '_');
    this.log(`🔵 Creating session for ${sanitizedKey}, model: ${model}`);
    const session = await this.client.createSession({
      sessionId: `ufo-${sanitizedKey}-${Date.now()}`,
      model,
      streaming: true,
      infiniteSessions: { enabled: true }
    });
    
    // 監聽 SDK 事件來顯示 AI 狀態
    session.on((event: any) => {
      this.handleSdkEvent(event, sessionKey);
    });
    
    this.sessions.set(sessionKey, { session, model });
    return session;
  }

  private handleSdkEvent(event: any, sessionKey: string): void {
    if (!event) return;
    const type = event.type;
    switch (type) {
      case 'assistant.turn_start':
        this.log(`🧠 [${sessionKey}] Thinking...`);
        break;
      case 'assistant.intent':
        if (event.intent) {
          this.log(`📋 [${sessionKey}] Intent: ${event.intent}`);
        }
        break;
      case 'assistant.reasoning_delta':
        // 顯示推理過程的片段
        if (event.delta) {
          const snippet = event.delta.substring(0, 80).replace(/\n/g, ' ');
          this.log(`💭 [${sessionKey}] ${snippet}...`);
        }
        break;
      case 'assistant.message_delta':
        // 回應正在生成中
        break;
      case 'assistant.message':
        this.log(`✅ [${sessionKey}] Response generated`);
        break;
      case 'assistant.turn_end':
      case 'session.idle':
        this.log(`🔵 [${sessionKey}] Idle`);
        break;
      case 'tool.execution_start':
        if (event.tool) {
          this.log(`🔧 [${sessionKey}] Tool: ${event.tool}`);
        }
        break;
      case 'tool.execution_end':
        this.log(`🔧 [${sessionKey}] Tool completed`);
        break;
      default:
        // 其他事件不顯示
        break;
    }
  }

  async sendPrompt(sessionKey: string, model: string, prompt: string, timeoutMs = 300000): Promise<string> {
    this.log(`📤 [${sessionKey}] Sending prompt (${prompt.length} chars)...`);
    const session = await this.getSession(sessionKey, model);
    try {
      const response = await session.sendAndWait({ prompt }, timeoutMs);
      const content = response?.data?.content?.trim() ?? "";
      this.log(`📥 [${sessionKey}] Received response (${content.length} chars)`);
      return content;
    } catch (error) {
      this.log(`❌ [${sessionKey}] Error: ${String(error)}`);
      const existing = this.sessions.get(sessionKey);
      if (existing) {
        try {
          await existing.session.destroy();
        } catch {}
        this.sessions.delete(sessionKey);
      }
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    for (const { session } of this.sessions.values()) {
      try {
        await session.destroy();
      } catch {}
    }
    this.sessions.clear();
    if (this.client) {
      try {
        await this.client.stop();
      } catch {}
    }
    this.client = null;
  }
}

const copilotSdk = new UfoCopilotSdkManager();

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

async function runSdkPrompt(
  sessionKey: string,
  modelId: string,
  prompt: string,
  output: vscode.OutputChannel
): Promise<string> {
  // 確保 SDK manager 有 output channel
  copilotSdk.setOutput(output);
  
  output.appendLine(`[UFO] 📤 Sending to Copilot SDK (model: ${modelId})...`);
  try {
    const response = await copilotSdk.sendPrompt(sessionKey, modelId, prompt);
    if (!response) {
      output.appendLine("[UFO] ⚠️ Copilot SDK returned empty response.");
    } else {
      output.appendLine(`[UFO] 📥 Response received (${response.length} chars)`);
    }
    return response;
  } catch (error) {
    const message = `Copilot SDK failed: ${String(error)}`;
    output.appendLine(`[UFO] ❌ ${message}`);
    console.error("[UFO] Copilot SDK failed:", error);
    if (error instanceof Error && error.stack) {
      output.appendLine(error.stack);
    }
    return "❌ Copilot SDK 無法回應，請確認 Copilot CLI 已登入並可用。";
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
  const output = vscode.window.createOutputChannel("UFO");
  const recentMessageIds = new Set<string>();
  const recentMessageIdQueue: string[] = [];
  let hasUfoRouting = false;

  ensureCopilotCliOnPath(output);
  syncEnvFromSettings(context, output);

  const config = vscode.workspace.getConfiguration("ufo");
  const gatewayUrl = config.get<string>("gatewayUrl", "ws://localhost:3000");
  const gatewayClient = new GatewayClient(gatewayUrl);

  const buildState = () => buildDashboardState(context, gatewayConnected, gatewayConnectionState);
  const dashboardProvider = new UfoDashboardProvider(
    context,
    buildState,
    (command) => vscode.commands.executeCommand(command)
  );
  const promptStudioPanel = new PromptStudioPanel(context);
  
  // 建立四個獨立的任務視窗 Provider
  const pendingProvider = new SingleStatusTaskProvider(tasksRoot, "pending", () => dashboardProvider.update());
  const approvedProvider = new SingleStatusTaskProvider(tasksRoot, "approved", () => dashboardProvider.update());
  const runningProvider = new SingleStatusTaskProvider(tasksRoot, "in-progress", () => dashboardProvider.update());
  const doneProvider = new SingleStatusTaskProvider(tasksRoot, "done", () => dashboardProvider.update());
  
  // 統一刷新所有 Provider
  const refreshAllProviders = () => {
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

  const sendToUser = (channel: string, userId: string, content: string) => {
    // 在選項前加分隔線（偵測「方案」「選擇」「選項」等關鍵字）
    const formattedContent = content.replace(
      /(\n)(方案\s*[A-Z]|選項\s*[A-Z0-9]|[A-Z]\s*[—–-]\s*|[A-Z]\)\s*)/g,
      '\n\n──────────────\n$2'
    );
    
    const chunks = splitMessage(formattedContent, 800);
    for (const chunk of chunks) {
      gatewayClient.send({ type: "copilot_response", channel, userId, content: chunk });
    }
  };

  const handleIncomingText = async (
    text: string,
    meta: {
      channel: string;
      userId: string;
      messageId?: string;
      timestamp?: string;
    }
  ) => {
    const normalizedText = text.trim();
    if (!normalizedText) {
      return;
    }
    output.appendLine(`[UFO] Incoming message (${meta.channel}): ${normalizedText.substring(0, 50)}...`);
    if (!rememberMessageId(meta.messageId, recentMessageIds, recentMessageIdQueue)) {
      return;
    }

    const session = getSession(meta);
    const config = vscode.workspace.getConfiguration("ufo");
    const chatModelId = config.get<string>("models.chat", "gpt-5-mini");

    recordHistory(session, "user", normalizedText);
    appendUserProfile(context, normalizedText);

    const systemPrompt = [
      loadCopilotInstructions(context),
      loadPersonaContext(context),
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
      "It's difficult... I'm just an AI...",
      'I have some ideas now...'
    ];
    
    // 發送初始思考訊息
    let phaseIndex = 0;
    sendToUser(meta.channel, meta.userId, `👾 ${getRandomEmoji()} ${thinkingPhases[phaseIndex]} 👾`);
    let hasTimedOut = false;
    
    // 每 10 秒發送下一階段訊息
    const thinkingInterval = setInterval(() => {
      phaseIndex = (phaseIndex + 1) % thinkingPhases.length;
      sendToUser(meta.channel, meta.userId, `👾 ${getRandomEmoji()} ${thinkingPhases[phaseIndex]} 👾`);
    }, 10000);
    
    // 在 58 秒時發送最後警告（LINE Reply Token 60 秒後失效）
    const timeoutWarning = setTimeout(() => {
      hasTimedOut = true;
      clearInterval(thinkingInterval);
      sendToUser(meta.channel, meta.userId, `👾 ${getRandomEmoji()} 我可能還需要思考久一點，你等等問我進度 👾`);
    }, 58000);
    
    try {
      const response = await runSdkPrompt(sessionKey, chatModelId, fullPrompt, output);
      
      // 清理計時器
      clearInterval(thinkingInterval);
      clearTimeout(timeoutWarning);
      
      if (!hasTimedOut) {
        recordHistory(session, "assistant", response);
        sendToUser(meta.channel, meta.userId, response);
      } else {
        // 已超時，回應需要用新的 Push Message（會計費）
        output.appendLine(`[UFO] ⚠️ Reply token likely expired, response may require push message`);
        recordHistory(session, "assistant", response);
        sendToUser(meta.channel, meta.userId, response);
      }
    } catch (error) {
      clearInterval(thinkingInterval);
      clearTimeout(timeoutWarning);
      const errorMsg = `❌ 發生錯誤: ${String(error)}`;
      sendToUser(meta.channel, meta.userId, errorMsg);
    }
  };

  gatewayClient.on("connected", () => {
    gatewayConnected = true;
    gatewayConnectionState = "connected";
    output.appendLine(`[UFO] Gateway connected: ${gatewayUrl}`);
    dashboardProvider.update();
  });

  gatewayClient.on("disconnected", () => {
    gatewayConnected = false;
    gatewayConnectionState = "disconnected";
    output.appendLine("[UFO] Gateway disconnected");
    dashboardProvider.update();
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
          sendToUser(message.channel || "line", message.userId, "✅ 已確認，任務交接給 BlueMonster 進行開發。");
        } catch (error) {
          output.appendLine(`Failed to move task ${taskId} to approved: ${String(error)}`);
        }
      }
      return;
    }

    if (message.type === "ufo_message") {
      hasUfoRouting = true;
      // 支援所有頻道：line, telegram, discord
      if (typeof message.text === "string") {
        handleIncomingText(message.text, {
          channel: message.channel || "unknown",
          userId: message.userId,
          messageId: message.messageId,
          timestamp: message.timestamp
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
      if (hasUfoRouting) {
        return;
      }
      // 支援所有頻道：line, telegram, discord
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
        dashboardProvider.update();
      }
    }),
    vscode.window.registerWebviewViewProvider("ufoDashboard", dashboardProvider),
    // 註冊四個獨立的任務視窗
    vscode.window.registerTreeDataProvider("ufoTasksPending", pendingProvider),
    vscode.window.registerTreeDataProvider("ufoTasksApproved", approvedProvider),
    vscode.window.registerTreeDataProvider("ufoTasksRunning", runningProvider),
    vscode.window.registerTreeDataProvider("ufoTasksDone", doneProvider),
    vscode.commands.registerCommand("ufo.createTaskSpec", () =>
      createTaskSpec(context, { refresh: refreshAllProviders } as any)
    ),
    vscode.commands.registerCommand("ufo.openTools", () => openTools(context)),
    vscode.commands.registerCommand("ufo.refreshQueue", () => refreshAllProviders()),
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
  void copilotSdk.shutdown();
}
