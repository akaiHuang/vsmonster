import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { GatewayClient } from "./gateway-client";
import { getDashboardHtml, type DashboardState } from "./dashboard";

const STATUS_DIRS = [
  { id: "pending", label: "Pending" },
  { id: "approved", label: "Approved" },
  { id: "in-progress", label: "In Progress" },
  { id: "done", label: "Done" }
] as const;

type TaskStatus = (typeof STATUS_DIRS)[number]["id"];
const MAX_RECENT_MESSAGE_IDS = 200;
const DEFAULT_TASK_FOLDER = "pending";

type UfoMode = "chat" | "planning" | "awaiting_approval";

type UfoRole = "user" | "assistant";

interface UfoChatEntry {
  role: UfoRole;
  content: string;
}

interface UfoSession {
  key: string;
  userId: string;
  channel: string;
  mode: UfoMode;
  history: UfoChatEntry[];
  taskTitle?: string;
  taskId?: string;
  taskDir?: string;
}
const ENV_KEYS = {
  port: "VSMONSTER_PORT",
  publicUrl: "VSMONSTER_PUBLIC_URL",
  lineAccessToken: "LINE_CHANNEL_ACCESS_TOKEN",
  lineSecret: "LINE_CHANNEL_SECRET",
  lineWebhookSecret: "LINE_WEBHOOK_SECRET",
  telegramBotToken: "TELEGRAM_BOT_TOKEN",
  telegramWebhookUrl: "TELEGRAM_WEBHOOK_URL",
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
    super(label, collapsibleState);
    this.fullPath = fullPath;
    this.status = status;
    this.isDirectory = isDirectory;

    if (fullPath && !isDirectory) {
      this.resourceUri = vscode.Uri.file(fullPath);
      this.command = {
        command: "vscode.open",
        title: "Open",
        arguments: [vscode.Uri.file(fullPath)]
      };
    }
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
        return new TaskItem(status.label, vscode.TreeItemCollapsibleState.Collapsed, undefined, status.id);
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
    console.log('[UFO] Dashboard view resolved');
    view.webview.html = getDashboardHtml(view.webview, this.getState());
    view.webview.onDidReceiveMessage((message) => {
      if (!message || typeof message !== "object") {
        return;
      }
      if (message.type === "command" && typeof message.command === "string") {
        console.log(`[UFO] Dashboard action: ${message.command}`);
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
  connected: boolean
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

async function selectChatModel(
  preferredId: string,
  output: vscode.OutputChannel
): Promise<vscode.LanguageModelChat | undefined> {
  if (!vscode.lm?.selectChatModels) {
    output.appendLine("Copilot LM API not available in this VS Code version.");
    return undefined;
  }

  if (preferredId) {
    const matches = await vscode.lm.selectChatModels({ vendor: "copilot", id: preferredId });
    if (matches.length > 0) {
      return matches[0];
    }
  }

  const models = await vscode.lm.selectChatModels({ vendor: "copilot" });
  if (models.length === 0) {
    output.appendLine("No Copilot models available.");
    return undefined;
  }
  return models[0];
}

async function runChatModel(
  model: vscode.LanguageModelChat,
  systemPrompt: string,
  history: UfoChatEntry[],
  userInput: string,
  output: vscode.OutputChannel
): Promise<string> {
  const messages: vscode.LanguageModelChatMessage[] = [
    vscode.LanguageModelChatMessage.User(systemPrompt)
  ];

  for (const entry of history) {
    if (entry.role === "user") {
      messages.push(vscode.LanguageModelChatMessage.User(entry.content));
    } else {
      messages.push(vscode.LanguageModelChatMessage.Assistant(entry.content));
    }
  }

  messages.push(vscode.LanguageModelChatMessage.User(userInput));

  const response = await model.sendRequest(
    messages,
    {},
    new vscode.CancellationTokenSource().token
  );

  let text = "";
  for await (const part of response.stream) {
    if (part instanceof vscode.LanguageModelTextPart) {
      text += part.value;
    }
  }

  const trimmed = text.trim();
  if (!trimmed) {
    output.appendLine("Copilot returned empty response.");
  }
  return trimmed;
}

function buildChatSystemPrompt(): string {
  return [
    "你是 UFO（任務規格協助員）。",
    "目標：與使用者討論需求，協助釐清範圍、功能、限制、驗收條件。",
    "如果使用者想開始一個任務，請提醒他輸入 /task 開始任務流程。",
    "在任務流程中，請逐步提問、整理需求。",
    "使用中文、清楚、精簡。"
  ].join("\n");
}

function buildPlanningSystemPrompt(): string {
  return [
    "你是 UFO（需求釐清助理）。",
    "目前正在任務規格討論中。",
    "請提出需要的問題，並適時整理目前已知需求。",
    "當你認為需求足夠時，請提示使用者輸入 /confirm 進行確認。"
  ].join("\n");
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
  const specModel = await selectChatModel(specModelId, output);
  let readme = "";
  let agents = "";
  let devSpec = "";

  if (specModel) {
    const specPrompt = buildSpecSystemPrompt(conversationLog);
    const raw = await runChatModel(specModel, specPrompt, [], "", output);
    const parsed = extractJsonPayload(raw);
    if (parsed) {
      readme = parsed.readme;
      agents = parsed.agents;
      devSpec = parsed.devSpec;
    }
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

  const opusModel = await selectChatModel(opusModelId, output);
  if (opusModel) {
    const opusPrompt = buildOpusSystemPrompt(readme, agents, devSpec);
    const raw = await runChatModel(opusModel, opusPrompt, [], "", output);
    const refined = extractJsonPayload(raw);
    if (refined) {
      readme = refined.readme || readme;
      agents = refined.agents || agents;
      devSpec = refined.devSpec || devSpec;
    }
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

  const tasksRoot = getTasksRoot(context);
  let gatewayConnected = false;
  const output = vscode.window.createOutputChannel("UFO");
  const recentMessageIds = new Set<string>();
  const recentMessageIdQueue: string[] = [];
  let hasUfoRouting = false;

  syncEnvFromSettings(context, output);

  const config = vscode.workspace.getConfiguration("ufo");
  const gatewayUrl = config.get<string>("gatewayUrl", "ws://localhost:3000");
  const gatewayClient = new GatewayClient(gatewayUrl);

  const buildState = () => buildDashboardState(context, gatewayConnected);
  const dashboardProvider = new UfoDashboardProvider(
    context,
    buildState,
    (command) => vscode.commands.executeCommand(command)
  );
  const provider = new TaskQueueProvider(tasksRoot, () => dashboardProvider.update());

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
        mode: "chat",
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
    gatewayClient.send({ type: "copilot_response", channel, userId, content });
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
    console.log(`[UFO] Incoming message (${meta.channel}): ${normalizedText}`);
    if (!rememberMessageId(meta.messageId, recentMessageIds, recentMessageIdQueue)) {
      console.log(`[UFO] Duplicate message ignored: ${meta.messageId ?? 'unknown'}`);
      return;
    }

    const session = getSession(meta);
    const config = vscode.workspace.getConfiguration("ufo");
    const chatModelId = config.get<string>("models.chat", "gpt-5-mini");
    const specModelId = config.get<string>("models.spec", "gpt-5-mini");
    const opusModelId = config.get<string>("models.opus", "opus-4.5");

    if (normalizedText.startsWith("/task")) {
      session.mode = "planning";
      session.taskTitle = normalizedText.replace("/task", "").trim() || "task";
      recordHistory(session, "user", normalizedText);
      sendToUser(meta.channel, meta.userId, "✅ 已進入任務規格討論。請描述需求，完成後輸入 /confirm。");
      return;
    }

    if (session.mode === "planning" && normalizedText === "/confirm") {
      recordHistory(session, "user", normalizedText);
      await createTaskBundleFromConversation({
        context,
        provider,
        output,
        session,
        chatModelId,
        specModelId,
        opusModelId,
        gatewayClient
      });
      sendToUser(
        meta.channel,
        meta.userId,
        "📌 已產生規格草案，請透過確認連結審核。"
      );
      return;
    }

    recordHistory(session, "user", normalizedText);

    const systemPrompt = session.mode === "planning" ? buildPlanningSystemPrompt() : buildChatSystemPrompt();
    const model = await selectChatModel(chatModelId, output);
    const response = model
      ? await runChatModel(model, systemPrompt, session.history, normalizedText, output)
      : "❌ Copilot 模型不可用，請確認已安裝並登入 Copilot。";

    recordHistory(session, "assistant", response);
    sendToUser(meta.channel, meta.userId, response);
  };

  gatewayClient.on("connected", () => {
    gatewayConnected = true;
    output.appendLine(`Gateway connected: ${gatewayUrl}`);
    console.log(`[UFO] Gateway connected: ${gatewayUrl}`);
    dashboardProvider.update();
  });

  gatewayClient.on("disconnected", () => {
    gatewayConnected = false;
    output.appendLine("Gateway disconnected");
    console.log("[UFO] Gateway disconnected");
    dashboardProvider.update();
  });

  gatewayClient.on("reconnect_failed", () => {
    gatewayConnected = false;
    output.appendLine("Gateway reconnect failed");
    console.log("[UFO] Gateway reconnect failed");
    dashboardProvider.update();
  });

  gatewayClient.on("error", (error) => {
    output.appendLine(`Gateway error: ${String(error)}`);
    console.log("[UFO] Gateway error", error);
    dashboardProvider.update();
  });

  gatewayClient.on("message", (message: any) => {
    if (!message || typeof message !== "object") {
      return;
    }
    console.log(`[UFO] Gateway message: ${message.type ?? 'unknown'}`);

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
          provider.refresh();
          sendToUser(message.channel || "line", message.userId, "✅ 已確認，任務交接給 BlueMonster 進行開發。");
        } catch (error) {
          output.appendLine(`Failed to move task ${taskId} to approved: ${String(error)}`);
        }
      }
      return;
    }

    if (message.type === "ufo_message") {
      hasUfoRouting = true;
      if (message.channel === "line" && typeof message.text === "string") {
        handleIncomingText(message.text, {
          channel: message.channel,
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
      if (message.channel === "line" && typeof message.message === "string") {
        handleIncomingText(message.message, {
          channel: message.channel,
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
      if (message.task?.channel === "line" && typeof message.instruction === "string") {
        handleIncomingText(message.instruction, {
          channel: message.task.channel,
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
    vscode.window.registerTreeDataProvider("ufoTasks", provider),
    vscode.commands.registerCommand("ufo.createTaskSpec", () =>
      createTaskSpec(context, provider)
    ),
    vscode.commands.registerCommand("ufo.openTools", () => openTools(context)),
    vscode.commands.registerCommand("ufo.refreshQueue", () => provider.refresh()),
    vscode.commands.registerCommand("ufo.openTasksRoot", () =>
      vscode.commands.executeCommand("revealFileInOS", vscode.Uri.file(getTasksRoot(context)))
    ),
    vscode.commands.registerCommand("ufo.openSettings", () =>
      vscode.commands.executeCommand("workbench.action.openSettings", "ufo")
    ),
    vscode.commands.registerCommand("ufo.syncEnv", () => {
      syncEnvFromSettings(context, output);
      dashboardProvider.update();
    })
  );

  dashboardProvider.update();
}

export function deactivate(): void {}
