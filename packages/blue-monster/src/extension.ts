import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import { WEBVIEW_CSS, WEBVIEW_JS, WEBVIEW_HTML_TEMPLATE } from './webview';
import { buildPrompt, detectModelType } from './prompts';
import {
  // Constants
  STOP_WORDS, CONFIG_SECTION,
  TOOL_NAME, VS_COMMAND_TOOL_NAME, READ_FILE_TOOL_NAME,
  WRITE_FILE_TOOL_NAME, OPEN_FILE_TOOL_NAME, SWITCH_WINDOW_TOOL_NAME, SEARCH_TASKS_TOOL_NAME,
  // Helpers
  countLineDiff, extractHeredocWrite, extractRedirectTarget,
  normalizeText, tokenize, setupTaskFolder,
  // Terminal
  setupTerminalCloseHandler, getTerminal, disposeTerminal,
  // Config
  getConfig, getReasoningEffort,
  getTerminalConfirmationMode, setTerminalConfirmationMode, getDangerModeEnabled,
  getPreferredModelId, getMcpAutoStart, getMcpServers,
  getSafeModeSettings, setSafeModeCategoryConfirmation, shouldConfirmCommand,
  // Tools
  terminalToolDefinition, vsCodeCommandToolDefinition, readFileToolDefinition,
  writeFileToolDefinition, openFileToolDefinition, switchWindowToolDefinition, searchTasksToolDefinition,
  normalizeToolInput, normalizeVsCodeCommandInput, normalizeReadFileInput,
  normalizeWriteFileInput, normalizeOpenFileInput, normalizeSearchTasksInput,
  // Cache
  getCachedSearchResults, setCachedSearchResults, invalidateSearchCache
} from './utils';
import { generateRandomName, getNameEmoji } from './utils/names';
import type {
  TerminalConfirmationMode, SafeModeSettings, McpServerConfig,
  RunInTerminalInput, VsCodeCommandInput, ReadFileInput, WriteFileInput, OpenFileInput
} from './utils';


const VIEW_ID = 'blueMonster.chatView';
const MAX_TOOL_TURNS = 8;
const MAX_HISTORY_ITEMS = 100;
const MAX_HISTORY_TEXT_CHARS = 20000;
const MAX_MEMORY_MATCHES = 3;
const MAX_MEMORY_CONTEXT_CHARS = 1200;

// Copilot SDK 支援的模型列表（含 Reasoning Effort 選項）
const SDK_MODELS = [
  // Claude 系列
  { id: 'claude-haiku-4.5', label: 'Claude Haiku 4.5', multiplier: '0.33x' },
  { id: 'claude-sonnet-4', label: 'Claude Sonnet 4', multiplier: '1x' },
  { id: 'claude-sonnet-4.5', label: 'Claude Sonnet 4.5', multiplier: '1x' },
  { id: 'claude-opus-4.5', label: 'Claude Opus 4.5', multiplier: '3x' },
  // Gemini 系列
  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', multiplier: '1x' },
  { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash (Preview)', multiplier: '0.33x' },
  { id: 'gemini-3-pro-preview', label: 'Gemini 3 Pro (Preview)', multiplier: '1x' },
  // GPT 系列（部分支援 Reasoning Effort）
  { id: 'gpt-4.1', label: 'GPT-4.1', multiplier: '0x' },
  { id: 'gpt-4o', label: 'GPT-4o', multiplier: '0x' },
  { id: 'gpt-5-mini', label: 'GPT-5 Mini', multiplier: '0x', reasoningOptions: ['low', 'medium', 'high'], defaultReasoning: 'medium' },
  { id: 'gpt-5', label: 'GPT-5', multiplier: '1x', reasoningOptions: ['low', 'medium', 'high'], defaultReasoning: 'medium' },
  { id: 'gpt-5-codex', label: 'GPT-5 Codex', multiplier: '1x', reasoningOptions: ['low', 'medium', 'high'], defaultReasoning: 'medium' },
  { id: 'gpt-5.1', label: 'GPT-5.1', multiplier: '1x', reasoningOptions: ['low', 'medium', 'high'], defaultReasoning: 'medium' },
  { id: 'gpt-5.1-codex', label: 'GPT-5.1 Codex', multiplier: '1x', reasoningOptions: ['low', 'medium', 'high'], defaultReasoning: 'high' },
  { id: 'gpt-5.1-codex-mini', label: 'GPT-5.1 Codex Mini', multiplier: '0.33x', reasoningOptions: ['low', 'medium', 'high'], defaultReasoning: 'medium' },
  { id: 'gpt-5.1-codex-max', label: 'GPT-5.1 Codex Max', multiplier: '1x', reasoningOptions: ['low', 'medium', 'high', 'extra-high'], defaultReasoning: 'high' },
  { id: 'gpt-5.2', label: 'GPT-5.2', multiplier: '1x', reasoningOptions: ['low', 'medium', 'high'], defaultReasoning: 'medium' },
  { id: 'gpt-5.2-codex', label: 'GPT-5.2 Codex', multiplier: '1x', reasoningOptions: ['low', 'medium', 'high', 'extra-high'], defaultReasoning: 'high' },
  // 其他
  { id: 'grok-code-fast-1', label: 'Grok Code Fast 1', multiplier: '0x' },
  { id: 'raptor-mini', label: 'Raptor Mini', multiplier: '0x' },
];

function supportsReasoningEffort(modelId: string): boolean {
  const match = SDK_MODELS.find(m => m.id === modelId);
  if (match?.reasoningOptions && match.reasoningOptions.length > 0) {
    return true;
  }
  return /^gpt-5/.test(modelId);
}

// Suppress specific Node.js deprecation warnings (cleaner debug console)
const originalEmitWarning = process.emitWarning;
process.emitWarning = (warning, ...args) => {
  if (typeof warning === 'string' && warning.includes('punycode')) return;
  if (typeof warning === 'object' && warning.message && warning.message.includes('punycode')) return;
  return originalEmitWarning.call(process, warning, ...args);
};

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const stat = await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
    return stat.size > 0;
  } catch {
    return false;
  }
}

async function readLimited(filePath: string, maxChars: number): Promise<string | undefined> {
  try {
    const fs = await import('fs').then(m => m.promises);
    const content = await fs.readFile(filePath, 'utf-8');
    if (!content) return undefined;
    return content.length > maxChars ? content.slice(0, maxChars) : content;
  } catch {
    return undefined;
  }
}

// ========== Gemini SDK - 真正的並行多工系統 ==========
import { geminiSDK, GeminiSession } from './gemini-client';

function getMaxConcurrentTasks(): number {
  return vscode.workspace.getConfiguration(CONFIG_SECTION).get<number>('maxConcurrentTasks', 3);
}

function getRequestBudget(): number {
  return vscode.workspace.getConfiguration(CONFIG_SECTION).get<number>('requestBudget', 0);
}

// GeminiSDKManager is imported from ./gemini-client
// geminiSDK is the singleton instance for managing concurrent AI sessions

// ========== TaskSession：每個任務的獨立狀態 ==========
interface TaskState {
  chatId: string;
  createdAt: number;
  agentName: string;
  agentEmoji: string;
  modelId?: string;
  modelName?: string;
  reasoningEffort?: string;
  personaTitle?: string;
  hasPersona?: boolean;
  hasInstructions?: boolean;
  // Optional display metadata (e.g. injected by UFO)
  displayTaskId?: string;
  displayTitle?: string;
  taskFolder?: string; // 任務專屬資料夾路徑
  messages: UiMessage[];
  busy: boolean;
  activityStatus: string;
  activityLines: string[];
  mode: 'chat' | 'agent' | 'agent-full';
  hasUnsavedChanges: boolean;
  stopRequested: boolean;
  cancellation?: vscode.CancellationTokenSource;
  activitySteps: string[];
  activityFiles: ActivityFileEntry[];
  activityCommands: string[];
  referenceCount: number;
  requestCount: number; // Copilot request 計數
  queuePosition: number; // 在佇列中的位置 (0 = 未排隊或執行中)
  sessionAllowedCategories: Set<string>;
  pendingConfirmations: Map<string, (result: ConfirmationResult) => void>;
  pendingConfirmationDetails: Map<string, { command: string; category: string; timestamp: number }>;
  pendingChoices: Map<string, (result: ChoiceResult) => void>;
  lastToolProgressAt: number;
  lastToolProgressMessage: string;
}

function createTaskState(chatId: string, agentName: string, agentEmoji: string): TaskState {
  return {
    chatId,
    createdAt: Date.now(),
    agentName,
    agentEmoji,
    modelId: undefined,
    modelName: undefined,
    reasoningEffort: undefined,
    personaTitle: undefined,
    hasPersona: false,
    hasInstructions: false,
    messages: [],
    busy: false,
    activityStatus: 'Idle',
    activityLines: [],
    mode: 'agent-full',
    hasUnsavedChanges: false,
    stopRequested: false,
    activitySteps: [],
    activityFiles: [],
    activityCommands: [],
    referenceCount: 0,
    requestCount: 0,
    queuePosition: 0,
    sessionAllowedCategories: new Set(),
    pendingConfirmations: new Map(),
    pendingConfirmationDetails: new Map(),
    pendingChoices: new Map(),
    lastToolProgressAt: 0,
    lastToolProgressMessage: ''
  };
}

// 根據模型名稱取得 multiplier 數值
function getModelMultiplierValue(modelName: string): number {
  const lower = modelName.toLowerCase();
  // 0x - 免費模型
  if (lower.includes('gpt-4.1') || lower.includes('gpt-4o') || lower.includes('gpt-5 mini') || lower.includes('gpt-5-mini')) return 0;
  if (lower.includes('grok') || lower.includes('raptor')) return 0;
  // 0.33x - 便宜模型
  if (lower.includes('haiku')) return 0.33;
  if (lower.includes('flash')) return 0.33;
  if (lower.includes('codex-mini')) return 0.33;
  // 10x - 最貴模型
  if (lower.includes('opus 4.1') || lower.includes('opus-4.1')) return 10;
  // 3x - 昂貴模型
  if (lower.includes('opus 4.5') || lower.includes('opus-4.5')) return 3;
  // 1x - 標準模型
  return 1;
}

function formatMultiplier(value: number): string {
  if (value === 0) return '0x';
  if (value === 0.33) return '0.33x';
  if (value === 1) return '1x';
  if (value === 3) return '3x';
  if (value === 10) return '10x';
  return `${value}x`;
}

type UiMessageKind = 'text' | 'thought' | 'image' | 'file';

interface UiMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text?: string;
  kind?: UiMessageKind;
  dataUrl?: string;
  mimeType?: string;
  name?: string;
  activity?: ActivityPayload;
  ts: number;
}

interface UiMessagePart {
  kind: UiMessageKind;
  text?: string;
  dataUrl?: string;
  mimeType?: string;
  name?: string;
}

interface ActivityFileEntry {
  name: string;
  added: number;
  removed: number;
  action: 'edited' | 'created' | 'read';
  lineStart?: number;
  lineEnd?: number;
}

interface ActivityPayload {
  steps: string[];
  files: ActivityFileEntry[];
  commands: string[];
}

interface ChatResult {
  text: string;
  parts: UiMessagePart[];
}

interface ChatHistoryEntry {
  id: string;
  taskId: string;  // 任務 ID，格式: #0001
  agentName: string; // BlueMonster 的名稱，例如: Apple, Berry, Mochi
  agentEmoji?: string; // BlueMonster 的 emoji
  modelId?: string;
  modelName?: string;
  reasoningEffort?: string;
  personaTitle?: string;
  title: string;
  date: string;
  messageCount: number;
  messages: UiMessage[];
  createdAt: number;
  updatedAt: number;
  preview?: string;
  searchText?: string;
  tokenCounts?: Record<string, number>;
}

interface ConfirmationResult {
  approved: boolean;
  remember?: boolean;
  sessionAllow?: string; // 這次 session 允許的危險類型
  projectAllow?: string; // 這個專案永遠允許的危險類型
  customResponse?: string; // 用戶自定義回應
}

// 多選項選擇結果
interface ChoiceResult {
  selectedIndex: number; // 選擇的索引 (1-based), 0 表示取消
  customResponse?: string; // 自定義回應
}

// 選項定義
interface ChoiceOption {
  label: string;
  description?: string;
  recommended?: boolean;
}

function getWebviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const nonce = Math.random().toString(36).slice(2);
  // 優先使用 blue-monster 自己的 resources，fallback 到 vscode-extension
  const blueMonsterWhSvgUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'resources', 'blueMonster_wh.svg')
  );
  
  // 使用模板並替換佔位符
  return WEBVIEW_HTML_TEMPLATE
    .replace(/__NONCE__/g, nonce)
    .replace(/__CSP_SOURCE__/g, webview.cspSource)
    .replace(/__AVATAR_URL__/g, blueMonsterWhSvgUri.toString())
    .replace(/__CSS__/g, WEBVIEW_CSS)
    .replace(/__JS__/g, WEBVIEW_JS.replace(/__ASSISTANT_AVATAR_URL__/g, blueMonsterWhSvgUri.toString()));
}

class BlueMonsterSession {
  private readonly context: vscode.ExtensionContext;
  private readonly views = new Set<vscode.Webview>();
  private currentModelLabel = 'Model: (auto)';
  private lastResolvedModelId: string | undefined;
  private lastResolvedModelName: string | undefined;
  
  // ========== 多任務管理 ==========
  private readonly tasks = new Map<string, TaskState>();  // chatId -> TaskState
  private activeChatId = '';  // 當前顯示的任務 ID
  private historyBroadcastTimer?: NodeJS.Timeout;
  private historyBroadcastAt = 0;
  
  private saveTimeout?: NodeJS.Timeout;
  private static instance?: BlueMonsterSession;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    BlueMonsterSession.instance = this;
    // 初始化第一個任務（異步）
    this.createNewTask().catch(err => console.error('[BlueMonster] Failed to create initial task:', err));
  }

  // 取得當前活動任務
  private get currentTask(): TaskState {
    let task = this.tasks.get(this.activeChatId);
    if (!task) {
      // 如果沒有活動任務，創建一個新的（異步設置 taskFolder）
      this.createNewTask().catch(err => console.error('[BlueMonster] Failed to create task:', err));
      // 重新取得（此時可能還沒有 taskFolder，但至少有 task）
      task = this.tasks.get(this.activeChatId);
      if (!task) {
        // Fallback: 同步創建基本任務
        const chatId = this.createChatId();
        const usedNames = this.getUsedAgentNames();
        const preferredNameRaw = vscode.workspace.getConfiguration(CONFIG_SECTION).get<string>('primaryAgentName', 'Jack');
        const preferredName = String(preferredNameRaw || '').trim();
        const agentName = preferredName && !usedNames.has(preferredName) ? preferredName : generateRandomName(usedNames);
        const agentEmoji = getNameEmoji(agentName);
        task = createTaskState(chatId, agentName, agentEmoji);
        this.tasks.set(chatId, task);
        this.activeChatId = chatId;
      }
    }
    return task;
  }

  // 根據 chatId 取得任務（用於背景任務回應）
  private getTask(chatId: string): TaskState | undefined {
    return this.tasks.get(chatId);
  }

  // 創建新任務
  private async createNewTask(): Promise<TaskState> {
    const chatId = this.createChatId();
    const usedNames = this.getUsedAgentNames();
    const preferredNameRaw = vscode.workspace.getConfiguration(CONFIG_SECTION).get<string>('primaryAgentName', 'Jack');
    const preferredName = String(preferredNameRaw || '').trim();
    const agentName = preferredName && !usedNames.has(preferredName) ? preferredName : generateRandomName(usedNames);
    const agentEmoji = getNameEmoji(agentName);
    
    const task = createTaskState(chatId, agentName, agentEmoji);
    this.tasks.set(chatId, task);
    this.activeChatId = chatId;
    
    // 同步建立任務資料夾（確保 SDK 任務執行前資料夾已準備好）
    await this.setupTaskFolderAsync(task);

    // If the task list is open, keep it updated.
    this.scheduleHistoryBroadcast(0);
    
    return task;
  }
  
  // 異步建立任務專屬資料夾
  private async setupTaskFolderAsync(task: TaskState): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceFolder) return;
    
    const taskFolder = await setupTaskFolder(
      workspaceFolder,
      task.chatId,
      task.agentName,
      task.agentEmoji
    );
    
	    if (taskFolder) {
	      task.taskFolder = taskFolder;
	      await this.refreshPersonaMeta(task);
	      console.log(`[BlueMonster] Task folder created: ${taskFolder}`);
	    }
	  }

	  private async refreshPersonaMeta(task: TaskState): Promise<void> {
	    const taskFolder = task.taskFolder;
	    if (!taskFolder) {
	      task.hasPersona = false;
	      task.hasInstructions = false;
	      task.personaTitle = undefined;
	      return;
	    }

	    const p = await import('path');
	    const vscodeDir = p.join(taskFolder, '.vscode');
	    const instructionsPath = p.join(vscodeDir, 'copilot-instructions.md');
	    const mePath = p.join(vscodeDir, 'me.md');

	    const [instructions, me] = await Promise.all([
	      readLimited(instructionsPath, 4000),
	      readLimited(mePath, 6000),
	    ]);

	    task.hasInstructions = Boolean(instructions && instructions.trim());
	    task.hasPersona = Boolean(me && me.trim());

	    const lines = String(me || '').split('\n');
	    let title = '';
	    for (const line of lines) {
	      const t = line.trim();
	      if (!t) continue;
	      const h = t.match(/^#+\\s+(.+)$/);
	      title = (h ? h[1] : t).trim();
	      break;
	    }
	    task.personaTitle = title || (task.hasPersona ? 'Persona' : undefined);
	  }

  // 切換到指定任務（只切換顯示，不中斷背景任務）
  private switchToTask(chatId: string): boolean {
    const task = this.tasks.get(chatId);
    if (!task) return false;
    
    this.activeChatId = chatId;
    // 更新 UI 顯示
    this.broadcast({ type: 'history', messages: task.messages });
    this.broadcast({ type: 'busy', value: task.busy });
    this.broadcast({ type: 'agentInfo', name: task.agentName, emoji: task.agentEmoji, requestCount: task.requestCount });
    if (task.activityLines.length > 0 || task.activityStatus !== 'Idle') {
      this.broadcast({ type: 'activity', status: task.activityStatus, lines: [...task.activityLines] });
    }
    return true;
  }

  private scheduleHistoryBroadcast(delayMs: number = 250): void {
    if (this.views.size === 0) {
      return;
    }
    const now = Date.now();
    if (delayMs <= 0 && now - this.historyBroadcastAt > 800) {
      this.historyBroadcastAt = now;
      void this.getChatHistoriesWithActiveTasks('').then((histories) => {
        this.broadcast({ type: 'chatHistories', histories });
      }).catch(() => undefined);
      return;
    }
    if (this.historyBroadcastTimer) {
      clearTimeout(this.historyBroadcastTimer);
    }
    this.historyBroadcastTimer = setTimeout(() => {
      this.historyBroadcastTimer = undefined;
      this.historyBroadcastAt = Date.now();
      void this.getChatHistoriesWithActiveTasks('').then((histories) => {
        this.broadcast({ type: 'chatHistories', histories });
      }).catch(() => undefined);
    }, Math.max(50, delayMs));
  }

  // 為了向後兼容，提供舊的屬性存取方式
  private get messages(): UiMessage[] { return this.currentTask.messages; }
  private get busy(): boolean { return this.currentTask.busy; }
  private set busy(value: boolean) { this.currentTask.busy = value; }
  private get activityStatus(): string { return this.currentTask.activityStatus; }
  private set activityStatus(value: string) { this.currentTask.activityStatus = value; }
  private get activityLines(): string[] { return this.currentTask.activityLines; }
  private set activityLines(value: string[]) { this.currentTask.activityLines = value; }
  private get pendingConfirmations() { return this.currentTask.pendingConfirmations; }
  private get pendingConfirmationDetails() { return this.currentTask.pendingConfirmationDetails; }
  private get pendingChoices() { return this.currentTask.pendingChoices; }
  private get currentChatId(): string { return this.activeChatId; }
  private get currentChatCreatedAt(): number { return this.currentTask.createdAt; }
  private get currentAgentName(): string { return this.currentTask.agentName; }
  private get currentAgentEmoji(): string { return this.currentTask.agentEmoji; }
  private get hasUnsavedChanges(): boolean { return this.currentTask.hasUnsavedChanges; }
  private set hasUnsavedChanges(value: boolean) { this.currentTask.hasUnsavedChanges = value; }
  private get currentCancellation() { return this.currentTask.cancellation; }
  private set currentCancellation(value) { this.currentTask.cancellation = value; }
  private get stopRequested(): boolean { return this.currentTask.stopRequested; }
  private set stopRequested(value: boolean) { this.currentTask.stopRequested = value; }
  private get activitySteps(): string[] { return this.currentTask.activitySteps; }
  private get activityFiles(): ActivityFileEntry[] { return this.currentTask.activityFiles; }
  private get activityCommands(): string[] { return this.currentTask.activityCommands; }
  private get referenceCount(): number { return this.currentTask.referenceCount; }
  private set referenceCount(value: number) { this.currentTask.referenceCount = value; }
  private get currentMode() { return this.currentTask.mode; }
  private set currentMode(value) { this.currentTask.mode = value; }
  private get sessionAllowedCategories() { return this.currentTask.sessionAllowedCategories; }

  static getInstance(): BlueMonsterSession | undefined {
    return BlueMonsterSession.instance;
  }

  // 延遲自動儲存（防抖動）
  private scheduleSave(): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    this.saveTimeout = setTimeout(() => {
      void this.saveCurrentChatToHistory({ reason: 'auto' });
    }, 5000); // 5 秒後自動儲存
  }

  private createChatId(): string {
    return `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private getUsedAgentNames(): Set<string> {
    const history = this.context.globalState.get<ChatHistoryEntry[]>('chatHistories') || [];
    // 也包含當前活動的任務名稱
    const activeNames = Array.from(this.tasks.values()).map(t => t.agentName);
    return new Set([...history.map(h => h.agentName).filter(Boolean), ...activeNames]);
  }

  // 不再需要 resetCurrentChat，改用 createNewTask

  private resetActivity(): void {
    const task = this.currentTask;
    task.activitySteps = [];
    task.activityFiles = [];
    task.activityCommands = [];
    task.referenceCount = 0;
  }

  private recordActivityStep(text: string): void {
    if (!text) {
      return;
    }
    this.activitySteps.push(text);
  }

  private recordActivityFile(entry: ActivityFileEntry): void {
    this.activityFiles.push(entry);
  }

  private recordActivityCommand(command: string): void {
    if (!command) {
      return;
    }
    this.activityCommands.push(command);
  }

  private resolvePath(targetPath: string, cwd?: string): string {
    if (path.isAbsolute(targetPath)) {
      return targetPath;
    }
    const base = cwd || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
    return path.join(base, targetPath);
  }

  private async verifyOrRecoverWrite(command: string, cwd?: string): Promise<void> {
    const heredoc = extractHeredocWrite(command);
    const redirectTarget = extractRedirectTarget(command);
    const target = heredoc?.path || redirectTarget;
    if (!target) {
      return;
    }
    const resolved = this.resolvePath(target, cwd);
    const exists = await fileExists(resolved);
    if (exists) {
      return;
    }
    if (heredoc?.content) {
      const previous = '';
      await vscode.workspace.fs.writeFile(vscode.Uri.file(resolved), Buffer.from(heredoc.content, 'utf8'));
      const diff = countLineDiff(previous, heredoc.content);
      const lineCount = heredoc.content.split('\n').length;
      this.recordActivityFile({
        name: path.basename(resolved),
        added: diff.added,
        removed: diff.removed,
        action: 'created',
        lineStart: 1,
        lineEnd: lineCount
      });
      return;
    }
  }

  private consumeActivityPayload(): ActivityPayload | undefined {
    if (this.referenceCount > 0) {
      this.activitySteps.unshift(`Used ${this.referenceCount} reference${this.referenceCount === 1 ? '' : 's'}`);
    }
    if (
      this.activitySteps.length === 0 &&
      this.activityFiles.length === 0 &&
      this.activityCommands.length === 0
    ) {
      this.resetActivity();
      return undefined;
    }
    const payload: ActivityPayload = {
      steps: [...this.activitySteps],
      files: [...this.activityFiles],
      commands: [...this.activityCommands]
    };
    this.resetActivity();
    return payload;
  }

  addView(webview: vscode.Webview) {
    this.views.add(webview);
    webview.postMessage({ type: 'history', messages: this.messages });
    webview.postMessage({ type: 'model', label: this.currentModelLabel });
    webview.postMessage({ type: 'busy', value: this.busy });
    // 發送當前 agent 資訊
    webview.postMessage({ 
      type: 'agentInfo', 
      name: this.currentAgentName, 
      emoji: this.currentAgentEmoji,
      requestCount: this.currentTask.requestCount
    });
    if (this.activityLines.length > 0 || this.activityStatus !== 'Idle') {
      webview.postMessage({ type: 'activity', status: this.activityStatus, lines: [...this.activityLines] });
    }
  }

  async removeView(webview: vscode.Webview) {
    this.views.delete(webview);
    if (this.views.size === 0 && this.pendingConfirmations.size > 0) {
      for (const resolve of this.pendingConfirmations.values()) {
        resolve({ approved: false });
      }
      this.pendingConfirmations.clear();
    }
    if (this.views.size === 0 && this.pendingChoices.size > 0) {
      for (const resolve of this.pendingChoices.values()) {
        resolve({ selectedIndex: 0 });
      }
      this.pendingChoices.clear();
    }
    if (this.views.size === 0) {
      await this.saveCurrentChatToHistory({ reason: 'close', force: true });
    }
  }

  // 供 deactivate 呼叫的強制儲存方法
  async forceSaveHistory(): Promise<void> {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = undefined;
    }
    // 保存所有任務
    for (const task of this.tasks.values()) {
      if (task.messages.length > 0) {
        await this.saveTaskToHistory(task, { reason: 'deactivate', force: true });
      }
    }
  }

  clearHistory() {
    // 清空當前任務的訊息（用於 clear 指令）
    this.currentTask.messages.length = 0;
    this.currentTask.hasUnsavedChanges = false;
    this.currentTask.sessionAllowedCategories.clear();
    this.broadcast({ type: 'history', messages: [] });
  }

  private broadcast(message: Record<string, unknown>) {
    for (const view of this.views) {
      view.postMessage(message);
    }
  }

  private addMessage(role: UiMessage['role'], text: string, part?: UiMessagePart, activity?: ActivityPayload) {
    const kind = part?.kind || 'text';
    const last = this.messages[this.messages.length - 1];
    if (
      role === 'assistant' &&
      last &&
      last.role === 'assistant' &&
      last.kind === kind &&
      last.text === text &&
      !activity
    ) {
      return;
    }
    const entry: UiMessage = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      role,
      text,
      kind,
      dataUrl: part?.dataUrl,
      mimeType: part?.mimeType,
      name: part?.name,
      activity,
      ts: Date.now()
    };
    this.messages.push(entry);
    this.hasUnsavedChanges = true;
    this.broadcast({ type: 'append', message: entry });
    // 觸發延遲自動儲存
    this.scheduleSave();
  }

  private addAssistantResult(result: ChatResult) {
    const activity = this.consumeActivityPayload();
    if (!result.parts.length) {
      const fallback = result.text || 'No response.';
      this.addMessage('assistant', fallback, undefined, activity);
      return;
    }

    let added = false;
    let activityAttached = false;
    for (const part of result.parts) {
      if (part.kind === 'image') {
        if (part.dataUrl) {
          this.addMessage('assistant', '', part);
          added = true;
        }
        continue;
      }
      const text = part.text ?? '';
      if (!text.trim()) {
        continue;
      }
      this.addMessage('assistant', text, part, !activityAttached ? activity : undefined);
      activityAttached = activityAttached || Boolean(activity);
      added = true;
    }

    if (!added) {
      const fallback = result.text || 'No response.';
      this.addMessage('assistant', fallback, undefined, activity);
      return;
    }

    if (activity && !activityAttached) {
      this.addMessage('assistant', '', { kind: 'text', text: '' }, activity);
    }
  }

  private setBusy(value: boolean) {
    this.busy = value;
    this.broadcast({ type: 'busy', value });
    // Keep the task list status (busy/waiting) fresh when the panel is open.
    this.scheduleHistoryBroadcast(500);
  }

  private setModelLabel(label: string) {
    if (!label || label === this.currentModelLabel) {
      return;
    }
    this.currentModelLabel = label;
    this.broadcast({ type: 'model', label });
  }

  private async refreshModelLabel(): Promise<void> {
    const model = await this.resolveModel();
    if (model) {
      this.setModelLabel(`Model: ${model.name} (${model.id})`);
    } else {
      this.setModelLabel('Model: unavailable');
    }
  }

  private formatActivityLine(text: string): string {
    const cleaned = text.replace(/\s+/g, ' ').trim();
    if (!cleaned) return '';
    const maxLen = 140;
    return cleaned.length > maxLen ? `${cleaned.slice(0, maxLen)}…` : cleaned;
  }

  private broadcastActivity() {
    this.broadcast({ type: 'activity', status: this.activityStatus, lines: [...this.activityLines] });
  }

  private pushActivityLine(text: string) {
    const cleaned = this.formatActivityLine(text);
    if (!cleaned) return;
    const last = this.activityLines[this.activityLines.length - 1];
    if (last === cleaned) return;
    this.activityLines.push(cleaned);
    if (this.activityLines.length > 3) {
      this.activityLines.shift();
    }
    this.broadcastActivity();
  }

  private setActivity(status: string, line?: string, reset = false) {
    if (reset || status === 'Idle') {
      this.activityLines = [];
    }
    this.activityStatus = status;
    if (line) {
      this.pushActivityLine(line);
    } else {
      this.broadcastActivity();
    }
  }

  private handleSdkActivityEvent(event: any, chatId: string) {
    if (!event || chatId !== this.currentChatId) return;
    const type = event.type;
    switch (type) {
      case 'assistant.turn_start':
        this.setActivity('Thinking', '開始推理');
        this.addMessage('system', '🧠 Thinking…');
        break;
      case 'assistant.intent':
        if (event?.data?.intent) {
          this.pushActivityLine(`意圖: ${event.data.intent}`);
          this.addMessage('system', `🧭 Intent: ${event.data.intent}`);
        }
        break;
      case 'assistant.reasoning_delta':
        if (this.activityStatus !== 'Thinking') {
          this.setActivity('Thinking', '推理中...');
        }
        break;
      case 'assistant.message_delta':
        if (this.activityStatus !== 'Responding') {
          this.setActivity('Responding', '產生回覆...');
        }
        break;
      case 'assistant.message':
        this.setActivity('Responding', '回覆完成');
        break;
      case 'assistant.turn_end':
      case 'session.idle':
        this.setActivity('Idle', undefined, true);
        break;
      case 'tool.user_requested': {
        const toolName = event?.data?.toolName || 'tool';
        this.setActivity('Waiting for Confirmation', `請求使用者確認: ${toolName}`);
        this.addMessage('system', `⏳ Waiting for confirmation: ${toolName}`);
        break;
      }
      case 'tool.execution_start': {
        const toolName = event?.data?.toolName || 'tool';
        const args = event?.data?.arguments ? this.formatActivityLine(JSON.stringify(event.data.arguments)) : '';
        this.setActivity('Working', `執行工具: ${toolName}`);
        this.addMessage('system', `🛠️ Tool start: ${toolName}${args ? `\n\`\`\`\n${args}\n\`\`\`` : ''}`);
        break;
      }
      case 'tool.execution_progress': {
        const msg = event?.data?.progressMessage;
        if (msg) {
          this.pushActivityLine(`工具進度: ${msg}`);
          const now = Date.now();
          const lastAt = this.currentTask.lastToolProgressAt;
          const lastMsg = this.currentTask.lastToolProgressMessage;
          if (now - lastAt > 1500 || lastMsg !== msg) {
            this.currentTask.lastToolProgressAt = now;
            this.currentTask.lastToolProgressMessage = msg;
            this.addMessage('system', `🔧 Tool progress: ${msg}`);
          }
        }
        break;
      }
      case 'tool.execution_complete': {
        const toolName = event?.data?.toolName || 'tool';
        const success = event?.data?.success;
        this.pushActivityLine(`工具完成: ${toolName} ${success ? '✅' : '❌'}`);
        let summary = `✅ Tool complete: ${toolName}`;
        if (success === false) summary = `❌ Tool failed: ${toolName}`;
        const resultContent = event?.data?.result?.content;
        if (resultContent && typeof resultContent === 'string') {
          const snippet = this.formatActivityLine(resultContent);
          summary += `\n\`\`\`\n${snippet}\n\`\`\``;
        }
        this.addMessage('system', summary);
        break;
      }
      case 'session.model_change': {
        const nextModel = event?.data?.newModel;
        if (nextModel) {
          this.pushActivityLine(`模型切換: ${nextModel}`);
          this.addMessage('system', `🔁 Model changed: ${nextModel}`);
        }
        break;
      }
      case 'session.error': {
        const message = event?.data?.message || 'Session error';
        this.setActivity('Error', message);
        break;
      }
      default:
        break;
    }
  }

  private startThinking(text = '收到請求，開始處理...') {
    this.setActivity('Thinking', text, true);
  }

  private startWorking(text = 'Working...') {
    this.setActivity('Working', text, false);
  }

  private appendThinking(text: string) {
    if (!this.busy || !text) {
      return;
    }
    // 過濾掉不需要顯示給用戶的技術訊息
    const skipPatterns = [
      'Using model:',
      'Sending request to model',
      'Waiting for model response',
      'Generating response',
      'Tool requested:'
    ];
    if (skipPatterns.some(pattern => text.includes(pattern))) {
      return;
    }
    if (this.activityStatus !== 'Thinking') {
      this.activityStatus = 'Thinking';
    }
    this.pushActivityLine(text);
  }

  private appendWorking(text: string) {
    if (!this.busy || !text) {
      return;
    }
    if (this.activityStatus !== 'Working') {
      this.activityStatus = 'Working';
    }
    this.pushActivityLine(text);
  }

  private stopThinking() {
    if (this.activityStatus === 'Thinking') {
      this.setActivity('Idle', undefined, true);
    }
  }

  private stopWorking() {
    if (this.activityStatus === 'Working') {
      this.setActivity('Idle', undefined, true);
    }
  }

  private requestStop(): void {
    this.stopRequested = true;
    if (this.currentCancellation) {
      this.currentCancellation.cancel();
      this.currentCancellation.dispose();
      this.currentCancellation = undefined;
    }
  }

  private async confirmTerminalCommand(command: string, cwd?: string): Promise<boolean> {
    // 「代理-危險」模式：全部自動執行，不需確認
    if (this.currentMode === 'agent-full') {
      return true;
    }
    
    // 「代理-安全」模式：根據設定檢查危險命令是否需要確認
    if (this.currentMode === 'agent') {
      const settings = getSafeModeSettings();
      const { confirm, label, category } = shouldConfirmCommand(command, settings);
      if (!confirm) {
        // 不需要確認（非危險命令或用戶已取消勾選）
        return true;
      }
      
      // 檢查 session 記憶：是否已在本次對話中允許此類操作
      // 安全模式下仍然要確認「刪除/移動」類型
      if (category && this.sessionAllowedCategories.has(category)) {
        if (category !== 'delete' && category !== 'move') {
          return true;
        }
      }
      
      // 需要確認
      this.appendThinking(`${label} - 等待用戶確認...`);
      const result = await this.confirmTerminalCommandInline(command, cwd, label, category);
      await this.applyConfirmationResult(result, category);
      return result.approved;
    }
    
    // 「計畫」模式：不執行任何命令
    if (this.currentMode === 'chat') {
      this.addMessage('system', '📋 計畫模式下無法執行命令。請切換到「代理-安全」或「代理-危險」模式。');
      return false;
    }
    
    // Fallback: 使用設定的確認模式
    const mode = getTerminalConfirmationMode();
    if (mode === 'off') {
      return true;
    }
    if (mode === 'modal') {
      const result = await this.confirmTerminalCommandModal(command, cwd);
      await this.applyConfirmationResult(result, '');
      return result.approved;
    }
    this.appendThinking('Awaiting approval to run a terminal command...');
    const result = await this.confirmTerminalCommandInline(command, cwd);
    await this.applyConfirmationResult(result, '');
    return result.approved;
  }

  private async confirmTerminalCommandModal(command: string, cwd?: string): Promise<ConfirmationResult> {
    const detail = cwd ? `\n📁 ${cwd}` : '';
    const action = await this.showConfirmationPrompt(`執行終端機命令？\n\n${command}${detail}`);
    if (action.kind === 'run') {
      return { approved: true };
    }
    if (action.kind === 'projectAllow') {
      return { approved: true, projectAllow: 'terminal' };
    }
    if (action.kind === 'custom') {
      return { approved: false, customResponse: action.customText || '' };
    }
    return { approved: false };
  }

  private async confirmTerminalCommandInline(command: string, cwd?: string, dangerType?: string, category?: string): Promise<ConfirmationResult> {
    if (this.views.size === 0) {
      return this.confirmTerminalCommandModal(command, cwd);
    }
    const summary = command.length > 60 ? `${command.slice(0, 60)}...` : command;
    this.setActivity('Waiting for Confirmation', `等待確認: ${summary}`);
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const result = await new Promise<ConfirmationResult>((resolve) => {
      this.pendingConfirmations.set(id, resolve);
      this.pendingConfirmationDetails.set(id, { 
        command: command, 
        category: category || dangerType || 'terminal',
        timestamp: Date.now()
      });
      this.broadcast({ type: 'confirm', id, command, cwd, dangerType, category });
    });
    this.pendingConfirmationDetails.delete(id);
    this.broadcast({ type: 'confirmClear', id });
    return result;
  }

  private async runTerminalCommand(command: string, cwd?: string) {
    await this.runTerminalCommandWithResult(command, cwd);
  }

  /**
   * 執行終端機命令並捕獲輸出
   * 優先使用 exec 直接執行以捕獲輸出，同時也在終端機顯示
   */
  private async runTerminalCommandWithResult(command: string, cwd?: string): Promise<string> {
    const workingDir = cwd || this.currentTask.taskFolder || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const confirmed = await this.confirmTerminalCommand(command, workingDir);
    if (!confirmed) {
      this.addMessage('system', 'Terminal command cancelled.');
      return 'Terminal command cancelled.';
    }
    
    this.appendThinking('Running terminal command...');
    this.recordActivityCommand(command);
    
    const terminal = getTerminal(workingDir);

    const preview = command.length > 120 ? `${command.slice(0, 120)}...` : command;
    const cwdLabel = workingDir ? `\n📁 ${workingDir}` : '';
    this.addMessage('system', `🛠️ 執行命令:\n\`\`\`\n${preview}\n\`\`\`${cwdLabel}`);
    
    // 預處理命令：移除 shell 註解行（避免 zsh 中 # 被當作無效命令）
    const preprocessCommand = (cmd: string): string => {
      return cmd
        .split('\n')
        .filter(line => {
          const trimmed = line.trim();
          // 移除純註解行（但保留 shebang 和 heredoc 中的註解）
          return trimmed !== '' && !trimmed.startsWith('#');
        })
        .join('\n');
    };
    
    // 檢測是否包含 heredoc 或其他複雜語法
    const hasHeredoc = /<<['"]?\w+['"]?/.test(command);
    const hasMultiline = command.includes('\n');
    const isComplexCommand = hasHeredoc || hasMultiline;
    
    if (isComplexCommand) {
      // 預處理：移除註解行
      const cleanedCommand = hasHeredoc ? command : preprocessCommand(command);
      
      // 對於多行命令，將每行用 && 連接成單行（除了 heredoc）
      if (!hasHeredoc && cleanedCommand.includes('\n')) {
        const singleLineCommand = cleanedCommand
          .split('\n')
          .map(line => line.trim())
          .filter(line => line !== '')
          .join(' && ');
        
        // 嘗試用 exec 執行單行版本
        terminal.show();
        terminal.sendText(`echo "🔵 BlueMonster 執行多行命令..."`, true);
        try {
          const { stdout, stderr } = await exec(singleLineCommand, {
            cwd: workingDir,
            maxBuffer: 1024 * 1024 * 10,
            timeout: 60000,
            env: {
              ...process.env,
              PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH || ''}`
            }
          });
          
          const output = stdout + (stderr ? `\n[stderr]: ${stderr}` : '');
          const trimmedOutput = output.trim();
          
          if (trimmedOutput) {
            const displayOutput = trimmedOutput.length > 2000 
              ? trimmedOutput.substring(0, 2000) + '\n... (輸出已截斷)'
              : trimmedOutput;
            this.addMessage('system', `📟 多行命令輸出:\n\`\`\`\n${displayOutput}\n\`\`\``);
          } else {
            this.addMessage('system', `✅ 多行命令執行完成 (無輸出)`);
          }
          
          terminal.sendText(`echo "✅ 多行命令完成"`, true);
          await this.verifyOrRecoverWrite(singleLineCommand, workingDir || undefined);
          return trimmedOutput || `Multi-line command executed successfully.`;
        } catch (error: any) {
          // 如果失敗，fallback 到逐行發送
          this.addMessage('system', `⚠️ 多行命令執行失敗，逐行執行中...`);
        }
      }
      
      // Heredoc 或 fallback：直接發送到終端機
      terminal.show();
      terminal.sendText(cleanedCommand, true);
      this.addMessage('system', `⚠️ 執行複雜命令 (heredoc/多行):\n\`\`\`\n${cleanedCommand.substring(0, 500)}\n\`\`\`\n\n**重要**: heredoc 在某些環境可能失敗。請使用驗證命令確認結果。`);
      await this.verifyOrRecoverWrite(cleanedCommand, workingDir || undefined);
      return `Complex command sent to terminal. IMPORTANT: Heredoc commands may fail silently. You MUST verify the result with a separate command like: test -s <file> && cat <file> | head -c 100`;
    }
    
    // 在終端機顯示正在執行的提示（用 echo 而非 # 註解，避免 zsh 解析問題）
    terminal.show();
    const safePreview = command.substring(0, 80).replace(/[`$"\\]/g, '\\$&').replace(/\n/g, ' ');
    terminal.sendText(`echo "🔵 BlueMonster 正在執行命令..."`, true);
    
    // 使用 exec 執行命令並捕獲輸出
    try {
      const { stdout, stderr } = await exec(command, {
        cwd: workingDir,
        maxBuffer: 1024 * 1024 * 10, // 10MB
        timeout: 60000, // 60 秒超時
        env: {
          ...process.env,
          PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH || ''}`
        }
      });
      
      const output = stdout + (stderr ? `\n[stderr]: ${stderr}` : '');
      const trimmedOutput = output.trim();
      
      // 顯示實際輸出到聊天視窗
      if (trimmedOutput) {
        const displayOutput = trimmedOutput.length > 2000 
          ? trimmedOutput.substring(0, 2000) + '\n... (輸出已截斷)'
          : trimmedOutput;
        this.addMessage('system', `📟 實際命令輸出:\n\`\`\`\n${displayOutput}\n\`\`\``);
      } else {
        this.addMessage('system', `✅ 命令執行完成 (無輸出): ${command.substring(0, 100)}`);
      }
      
      // 在終端機顯示執行結果（不重複執行命令，只顯示輸出摘要）
      const shortOutput = trimmedOutput.substring(0, 200).replace(/\n/g, ' ');
      terminal.sendText(`echo "✅ 命令完成: ${command.substring(0, 60).replace(/[`$"\\]/g, '\\$&').replace(/\n/g, ' ')}${command.length > 60 ? '...' : ''}"`, true);
      
      await this.verifyOrRecoverWrite(command, workingDir || undefined);
      return trimmedOutput || `Command executed successfully with no output. You should verify the result.`;
    } catch (error: any) {
      const errorMsg = error.stdout || error.stderr || String(error);
      this.addMessage('system', `❌ 命令執行錯誤:\n\`\`\`\n${errorMsg}\n\`\`\``);
      
      // 如果 exec 失敗，fallback 到純終端機執行
      terminal.sendText(`echo "⚠️ Fallback: 在終端機直接執行命令..."`, true);
      terminal.sendText(command, true);
      await this.verifyOrRecoverWrite(command, workingDir || undefined);
      return `Command may have failed: ${errorMsg}. The command was also sent to terminal. Please verify the result manually.`;
    }
  }

  // BlueMonster 自我控制指令（安全模式下也允許，但需確認）
  private readonly SELF_CONTROL_COMMANDS = new Set([
    'blueMonster.selectModel',
    'blueMonster.setModel',
    'blueMonster.setMode',
    'blueMonster.listModels',
    'blueMonster.clearHistory', 
    'blueMonster.openSettings',
    'blueMonster.mcp.startAll',
    'blueMonster.mcp.stopAll',
    'blueMonster.openView',
    'blueMonster.openPanel'
  ]);

  async runVsCodeCommandWithResult(command: string, args?: unknown[]): Promise<string> {
    const isSelfControl = this.SELF_CONTROL_COMMANDS.has(command);
    
    // 非自我控制指令需要 Danger Mode
    if (!isSelfControl && !getDangerModeEnabled()) {
      return 'Danger mode is disabled. Enable blueMonster.dangerMode to use this tool.';
    }
    
    // 安全模式下執行自我控制指令需要確認
    if (isSelfControl && this.currentMode === 'agent' && !getDangerModeEnabled()) {
      const argsStr = args && args.length > 0 ? ` (${args.join(', ')})` : '';
      const confirmed = await this.confirmVsCodeCommand(command + argsStr);
      if (!confirmed) {
        return `VS Code command cancelled: ${command}`;
      }
    }
    
    try {
      // 特殊處理：setModel, listModels, setMode 需要回傳結果字串
      if (command === 'blueMonster.setModel' && args && args.length > 0) {
        return await this.setModel(String(args[0]));
      }
      if (command === 'blueMonster.listModels') {
        return await this.listModels();
      }
      if (command === 'blueMonster.setMode' && args && args.length > 0) {
        return this.setMode(String(args[0]));
      }
      
      const result = await vscode.commands.executeCommand(command, ...(args || []));
      if (result === undefined) {
        return `VS Code command executed: ${command}`;
      }
      if (typeof result === 'string') {
        return result;
      }
      return `VS Code command result: ${JSON.stringify(result)}`;
    } catch (error) {
      return `VS Code command failed: ${String(error)}`;
    }
  }

  private async confirmVsCodeCommand(command: string): Promise<boolean> {
    if (this.views.size === 0) {
      const action = await this.showConfirmationPrompt(`BlueMonster 要求執行:\n\n${command}`);
      const result: ConfirmationResult =
        action.kind === 'run'
          ? { approved: true }
          : action.kind === 'projectAllow'
          ? { approved: true, projectAllow: 'blueMonster-self-control' }
          : action.kind === 'custom'
          ? { approved: false, customResponse: action.customText || '' }
          : { approved: false };
      await this.applyConfirmationResult(result, 'blueMonster-self-control');
      return result.approved;
    }
    
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const result = await new Promise<ConfirmationResult>((resolve) => {
      this.pendingConfirmations.set(id, resolve);
      this.pendingConfirmationDetails.set(id, { 
        command: `VS Code 指令: ${command}`,
        category: 'blueMonster-self-control',
        timestamp: Date.now()
      });
      this.broadcast({ 
        type: 'confirm', 
        id, 
        command: `VS Code 指令: ${command}`,
        dangerType: 'BlueMonster 自我控制'
      });
    });
    this.pendingConfirmationDetails.delete(id);
    this.broadcast({ type: 'confirmClear', id });
    await this.applyConfirmationResult(result, 'blueMonster-self-control');
    return result.approved;
  }

  private async applyConfirmationResult(result: ConfirmationResult, category: string) {
    if (result.remember) {
      await setTerminalConfirmationMode('off');
      this.addMessage('system', 'Terminal confirmations disabled in settings.');
    }
    if (result.projectAllow) {
      const updated = await this.applyProjectAllow(category);
      if (!updated && category) {
        this.sessionAllowedCategories.add(category);
      }
    }
    if (result.sessionAllow && category) {
      this.sessionAllowedCategories.add(category);
      this.addMessage('system', `✅ 已在本次對話中允許「${category}」類操作`);
    }
    if (result.customResponse) {
      this.addMessage('system', `💭 您的回饋：${result.customResponse}`);
    }
  }

  private async showConfirmationPrompt(message: string): Promise<{ kind: 'run' | 'projectAllow' | 'cancel' | 'custom'; customText?: string }> {
    const options = [
      { label: '1. Yes, 開始執行', kind: 'run' as const, detail: '立即執行這個動作' },
      { label: '2. Yes, 在這專案中永遠同意', kind: 'projectAllow' as const, detail: '此專案以後不再詢問同類型操作' },
      { label: '3. No', kind: 'cancel' as const, detail: '拒絕執行' },
      { label: '4. 其他想法', kind: 'custom' as const, detail: '輸入你的想法' }
    ];
    const picked = await vscode.window.showQuickPick(options, {
      title: '需要你的確認',
      placeHolder: message,
      canPickMany: false,
      ignoreFocusOut: true
    });
    if (!picked) return { kind: 'cancel' };
    if (picked.kind === 'custom') {
      const custom = await vscode.window.showInputBox({ prompt: '請輸入您的想法', ignoreFocusOut: true });
      if (!custom) return { kind: 'cancel' };
      return { kind: 'custom', customText: custom };
    }
    return { kind: picked.kind };
  }

  private async applyProjectAllow(category: string): Promise<boolean> {
    const updated = await setSafeModeCategoryConfirmation(category, false, vscode.ConfigurationTarget.Workspace);
    if (updated) {
      this.addMessage('system', `✅ 已在此專案永遠允許「${category}」類操作`);
      return true;
    }
    this.addMessage('system', `⚠️ 無法在此專案永久允許「${category}」，改為本次對話允許`);
    return false;
  }

  async readFileWithResult(path: string): Promise<string> {
    if (!getDangerModeEnabled()) {
      return 'Danger mode is disabled. Enable blueMonster.dangerMode to use this tool.';
    }
    try {
      const data = await vscode.workspace.fs.readFile(vscode.Uri.file(path));
      const text = Buffer.from(data).toString('utf8');
      this.referenceCount += 1;
      
      // 顯示檔案讀取訊息
      const fileName = path.split('/').pop() || path;
      const lineCount = text.split('\n').length;
      
      // 記錄讀取活動
      this.recordActivityFile({
        name: fileName,
        added: 0,
        removed: 0,
        action: 'read',
        lineStart: 1,
        lineEnd: lineCount
      });
      
      if (text.length > 200_000) {
        return `File read (${text.length} chars, ${lineCount} lines). Content too large to display.`;
      }
      return text;
    } catch (error) {
      this.addMessage('system', `❌ 無法讀取檔案: ${path}`);
      throw error;
    }
  }

  async writeFileWithResult(path: string, content: string): Promise<string> {
    if (!getDangerModeEnabled()) {
      return 'Danger mode is disabled. Enable blueMonster.dangerMode to use this tool.';
    }
    
    // 檢查檔案是否已存在
    let isNew = false;
    let previousText = '';
    let previousLineCount = 0;
    try {
      await vscode.workspace.fs.stat(vscode.Uri.file(path));
      const data = await vscode.workspace.fs.readFile(vscode.Uri.file(path));
      previousText = Buffer.from(data).toString('utf8');
      previousLineCount = previousText.split('\n').length;
    } catch {
      isNew = true;
    }
    
    await vscode.workspace.fs.writeFile(vscode.Uri.file(path), Buffer.from(content, 'utf8'));
    
    const fileName = path.split('/').pop() || path;
    const newLineCount = content.split('\n').length;

    const diff = countLineDiff(previousText, content);
    
    // 計算變更的行號範圍 (簡化版：顯示整個檔案)
    this.recordActivityFile({
      name: fileName,
      added: diff.added,
      removed: diff.removed,
      action: isNew ? 'created' : 'edited',
      lineStart: 1,
      lineEnd: newLineCount
    });
    
    // 自動在編輯器中開啟檔案
    try {
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(path));
      await vscode.window.showTextDocument(doc, { preview: true, viewColumn: vscode.ViewColumn.Beside });
    } catch {
      // 忽略開啟失敗
    }
    
    return `File written: ${path} (${newLineCount} lines)`;
  }

  async openFileWithResult(path: string, preview?: boolean): Promise<string> {
    if (!getDangerModeEnabled()) {
      return 'Danger mode is disabled. Enable blueMonster.dangerMode to use this tool.';
    }
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(path));
    await vscode.window.showTextDocument(doc, { preview: preview ?? true });
    return `Opened file: ${path}`;
  }

  async switchWindowWithResult(): Promise<string> {
    if (!getDangerModeEnabled()) {
      return 'Danger mode is disabled. Enable blueMonster.dangerMode to use this tool.';
    }
    await vscode.commands.executeCommand('workbench.action.switchWindow');
    return 'Opened window switcher.';
  }

  async searchTasksWithResult(query: string): Promise<string> {
    const results = await this.getChatHistories(query);
    if (results.length === 0) {
      return `No tasks found matching: "${query}"`;
    }
    const taskList = results.slice(0, 10).map(task => {
      const taskId = task.taskId || '#????';
      const preview = task.preview ? `\n   Preview: ${task.preview.substring(0, 100)}...` : '';
      return `[${taskId}] ${task.title} (${task.date}, ${task.messageCount} messages)${preview}`;
    }).join('\n');
    return `Found ${results.length} task(s) matching "${query}":\n\n${taskList}`;
  }

  async selectModel(): Promise<void> {
    if (!vscode.lm?.selectChatModels) {
      vscode.window.showErrorMessage('Language Model API is not available in this VS Code version.');
      return;
    }

    const models = await vscode.lm.selectChatModels({ vendor: 'copilot' });
    if (models.length === 0) {
      vscode.window.showWarningMessage('No Copilot models available. Check Copilot login and plan.');
      return;
    }

    const items = models.map((model) => ({
      label: model.name,
      description: model.id,
      detail: `${model.vendor} - ${model.family} - ${model.version}`,
      model
    }));

    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select a Copilot model for BlueMonster'
    });

    if (!picked) {
      return;
    }

    await vscode.workspace
      .getConfiguration(CONFIG_SECTION)
      .update('model', picked.model.id, vscode.ConfigurationTarget.Global);

    this.setModelLabel(`Model: ${picked.model.name}`);
    vscode.window.showInformationMessage(`BlueMonster model set to: ${picked.model.name}`);
  }

  /**
   * 直接設定模型（透過模型 ID 或名稱）
   * 支援的格式：
   * - 完整 ID: "gpt-4o", "claude-3.5-sonnet"
   * - 部分名稱: "gpt-4", "claude", "gemini"
   * - 數字索引: "1", "2", "3" (從可用模型列表中選擇)
   * - 帶 Reasoning Effort: "gpt-5 (high)", "gpt-5-mini (low)"
   */
  async setModel(modelIdOrIndex: string): Promise<string> {
    const input = modelIdOrIndex.trim();
    
    // 解析 reasoning effort（如果有的話）
    let reasoningEffort = '';
    let modelName = input;
    const parenMatch = input.match(/\(([^)]+)\)/);
    if (parenMatch) {
      const inside = parenMatch[1];
      const insideMatch = inside.match(/\b(low|medium|high|extra-high)\b/i);
      if (insideMatch) {
        reasoningEffort = insideMatch[1].toLowerCase();
      }
      modelName = input.replace(parenMatch[0], '').trim();
    }
    if (!reasoningEffort) {
      const looseMatch = input.match(/\b(low|medium|high|extra-high)\b/i);
      if (looseMatch) {
        reasoningEffort = looseMatch[1].toLowerCase();
        modelName = input.replace(looseMatch[0], '').trim();
      }
    }
    modelName = modelName.replace(/\s+/g, ' ').trim();

    let models: vscode.LanguageModelChat[] = [];
    let modelFetchError: string | undefined;
    if (vscode.lm?.selectChatModels) {
      try {
        models = await vscode.lm.selectChatModels({ vendor: 'copilot' });
      } catch (err) {
        modelFetchError = String(err);
      }
    }

    let targetModel: vscode.LanguageModelChat | undefined;
    const inputLower = modelName.toLowerCase();

    if (models.length > 0) {
      // 嘗試數字索引 (1-based) - 僅純數字
      const index = /^\d+$/.test(modelName) ? parseInt(modelName, 10) : NaN;
      if (!isNaN(index) && index >= 1 && index <= models.length) {
        targetModel = models[index - 1];
      }

      // 嘗試完全匹配 ID
      if (!targetModel) {
        targetModel = models.find(m => m.id.toLowerCase() === inputLower);
      }

      // 嘗試部分匹配 ID 或名稱
      if (!targetModel) {
        targetModel = models.find(m =>
          m.id.toLowerCase().includes(inputLower) ||
          m.name.toLowerCase().includes(inputLower)
        );
      }

      // 嘗試從常見模型別名解析
      if (!targetModel) {
        const resolvedId = this.resolveModelIdFromText(modelName, models);
        if (resolvedId) {
          targetModel = models.find(m => m.id === resolvedId);
        }
      }
    }

    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);

    if (!targetModel && models.length > 0) {
      const availableModels = models.map((m, i) => `${i + 1}. ${m.name} (${m.id})`).join('\n');
      return `Model not found: "${modelIdOrIndex}". Available models:\n${availableModels}`;
    }

    if (!targetModel) {
      const fallbackId = this.resolveModelIdFromText(modelName) || modelName;
      if (!fallbackId || /^\d+$/.test(modelName)) {
        const note = modelFetchError
          ? `⚠️ Copilot 模型清單無法取得：${modelFetchError}\n`
          : '⚠️ Copilot 模型清單不可用。\n';
        return this.formatStaticModelList(`${note}請改用模型名稱（例如 gpt-5-mini）再試一次。`);
      }
      await config.update('model', fallbackId, vscode.ConfigurationTarget.Global);
      if (reasoningEffort) {
        await config.update('reasoningEffort', reasoningEffort, vscode.ConfigurationTarget.Global);
      }
      this.setModelLabel(`Model: ${fallbackId}`);
      const modelOptions = await this.getModelOptions();
      this.broadcast({ type: 'modelOptions', ...modelOptions });
      const suffix = modelFetchError ? ' (Copilot 清單暫時無法取得，已存為覆寫)' : ' (已存為覆寫)';
      return reasoningEffort
        ? `Model set to: ${fallbackId} with reasoning: ${reasoningEffort}${suffix}`
        : `Model set to: ${fallbackId}${suffix}`;
    }

    await config.update('model', targetModel.id, vscode.ConfigurationTarget.Global);
    if (reasoningEffort) {
      await config.update('reasoningEffort', reasoningEffort, vscode.ConfigurationTarget.Global);
    }

    this.setModelLabel(`Model: ${targetModel.name}`);

    // 更新 webview 的模型選擇器
    const modelOptions = await this.getModelOptions();
    this.broadcast({ type: 'modelOptions', ...modelOptions });

    if (reasoningEffort) {
      return `Model switched to: ${targetModel.name} (${targetModel.id}) with reasoning: ${reasoningEffort}`;
    }
    return `Model switched to: ${targetModel.name} (${targetModel.id})`;
  }

  private formatStaticModelList(note?: string): string {
    const currentId = getPreferredModelId();
    const lines = SDK_MODELS.map((m, i) => {
      const current = m.id === currentId ? ' ← current' : '';
      const reasoning = m.reasoningOptions?.length ? ` [reasoning: ${m.reasoningOptions.join('/')}]` : '';
      const multiplier = m.multiplier ? ` ${m.multiplier}` : '';
      return `${i + 1}. ${m.label} (${m.id})${multiplier}${reasoning}${current}`;
    }).join('\n');
    const prefix = note ? `${note.trim()}\n\n` : '';
    return `${prefix}Available models (built-in list):\n${lines}\n\nUse blueMonster.setModel with number or name to switch.`;
  }

  /**
   * 列出所有可用模型
   */
  async listModels(): Promise<string> {
    if (!vscode.lm?.selectChatModels) {
      return this.formatStaticModelList('⚠️ Language Model API 不可用，顯示內建清單。');
    }

    try {
      const models = await vscode.lm.selectChatModels({ vendor: 'copilot' });
      if (models.length === 0) {
        return this.formatStaticModelList('⚠️ Copilot 沒有回傳模型清單，顯示內建清單。');
      }

      const currentId = getPreferredModelId();
      const list = models.map((m, i) => {
        const current = m.id === currentId ? ' ← current' : '';
        return `${i + 1}. ${m.name} (${m.id})${current}`;
      }).join('\n');

      return `Available models:\n${list}\n\nUse blueMonster.setModel with number or name to switch.`;
    } catch (err) {
      return this.formatStaticModelList(`⚠️ 取得 Copilot 模型清單失敗：${String(err)}\n顯示內建清單。`);
    }
  }

  /**
   * 切換代理模式
   * @param mode 模式: 'chat', 'agent', 'agent-full'
   */
  setMode(mode: string): string {
    const validModes = ['chat', 'agent', 'agent-full'];
    const input = mode.trim().toLowerCase();
    
    // 支援別名
    const aliases: Record<string, string> = {
      'plan': 'chat',
      '計畫': 'chat',
      'safe': 'agent',
      '安全': 'agent',
      '代理-安全': 'agent',
      'danger': 'agent-full',
      '危險': 'agent-full',
      '代理-危險': 'agent-full',
      'full': 'agent-full'
    };
    
    const targetMode = aliases[input] || input;
    
    if (!validModes.includes(targetMode)) {
      return `Invalid mode: "${mode}". Available modes: chat (計畫), agent (代理-安全), agent-full (代理-危險)`;
    }
    
    this.currentMode = targetMode as 'chat' | 'agent' | 'agent-full';
    
    // 更新 webview 的模式選擇器
    this.broadcast({ type: 'modeUpdate', mode: targetMode });
    
    const modeLabels: Record<string, string> = {
      'chat': '計畫',
      'agent': '代理-安全',
      'agent-full': '代理-危險'
    };
    
    return `Mode switched to: ${modeLabels[targetMode]} (${targetMode})`;
  }

  // ============================================================
  // 外部 API：供 Gateway/LINE 等外部服務呼叫
  // ============================================================

  /**
   * 設定目前任務的工作資料夾（同時會影響 prompt 注入的 <current_working_directory>）
   * - UFO 可用此方法把 BlueMonster 指向 UFO 任務資料夾
   */
  async setTaskFolder(taskFolderPath: string): Promise<string> {
    const raw = String(taskFolderPath || '').trim();
    if (!raw) {
      return 'No task folder provided.';
    }

    const resolved = this.resolvePath(raw);
    try {
      await vscode.workspace.fs.createDirectory(vscode.Uri.file(resolved));
    } catch (e) { console.error('[BlueMonster] Error creating task directory:', e); }

	    this.currentTask.taskFolder = resolved;
	    await this.refreshPersonaMeta(this.currentTask);
	    this.addMessage('system', `📁 Working directory set:\n${resolved}`);
	    return `Task folder set: ${resolved}`;
	  }

  /**
   * External entrypoint: append a non-LLM system note to the current task.
   * Used by UFO to inject preview URLs / delivery info.
   */
  addSystemNote(text: string): void {
    const t = String(text || '').trim();
    if (!t) return;
    this.addMessage('system', t);
  }

  /**
   * External entrypoint: create/switch to a task seeded by UFO.
   * - Ensures the task appears in the task list immediately (even before messages exist).
   */
  async createExternalTask(externalTaskId: string, taskFolderPath: string, title?: string): Promise<{ chatId: string }> {
    const extId = String(externalTaskId || '').trim();
    const rawFolder = String(taskFolderPath || '').trim();
    if (!extId) {
      throw new Error('No externalTaskId provided.');
    }
    if (!rawFolder) {
      throw new Error('No taskFolderPath provided.');
    }

    const resolvedFolder = this.resolvePath(rawFolder);
    try {
      await vscode.workspace.fs.createDirectory(vscode.Uri.file(resolvedFolder));
    } catch (e) { console.error('[BlueMonster] Error creating external task directory:', e); }

    // Reuse existing task if the same external id already exists.
    for (const t of this.tasks.values()) {
	      if (t.displayTaskId === extId) {
	        t.taskFolder = resolvedFolder;
	        await this.refreshPersonaMeta(t);
	        if (title && String(title).trim()) {
	          t.displayTitle = String(title).trim();
	        }
        this.activeChatId = t.chatId;
        this.broadcast({ type: 'history', messages: t.messages });
        this.broadcast({ type: 'busy', value: t.busy });
        this.broadcast({ type: 'agentInfo', name: t.agentName, emoji: t.agentEmoji, requestCount: t.requestCount });
        if (t.activityLines.length > 0 || t.activityStatus !== 'Idle') {
          this.broadcast({ type: 'activity', status: t.activityStatus, lines: [...t.activityLines] });
        }
        this.scheduleHistoryBroadcast(0);
        return { chatId: t.chatId };
      }
    }

    const usedNames = this.getUsedAgentNames();
    const preferredNameRaw = vscode.workspace.getConfiguration(CONFIG_SECTION).get<string>('primaryAgentName', 'Jack');
    const preferredName = String(preferredNameRaw || '').trim();
    const agentName = preferredName && !usedNames.has(preferredName) ? preferredName : generateRandomName(usedNames);
    const agentEmoji = getNameEmoji(agentName);

    const safeId = extId.replace(/[^a-zA-Z0-9\\-_.]/g, '-').slice(0, 80);
    let chatId = `ufo-${safeId}`;
    if (this.tasks.has(chatId)) {
      chatId = `ufo-${safeId}-${Date.now().toString(36)}`;
    }

    const task = createTaskState(chatId, agentName, agentEmoji);
    task.displayTaskId = extId;
    const t = String(title || '').trim();
    if (t) {
      task.displayTitle = t;
    } else {
      task.displayTitle = path.basename(resolvedFolder) || 'UFO Task';
	    }
	    task.taskFolder = resolvedFolder;
	    await this.refreshPersonaMeta(task);
	    this.tasks.set(chatId, task);
	    this.activeChatId = chatId;

    // Update UI + task list.
    this.broadcast({ type: 'history', messages: task.messages });
    this.broadcast({ type: 'busy', value: task.busy });
    this.broadcast({ type: 'agentInfo', name: task.agentName, emoji: task.agentEmoji, requestCount: task.requestCount });
    this.broadcast({ type: 'toast', text: `${task.agentEmoji} ${task.agentName} 已加入任務清單：${task.displayTitle}` });
    this.scheduleHistoryBroadcast(0);

    return { chatId };
  }

  /**
   * 取得所有待處理的確認請求
   * 回傳格式：[{ id, command, category, timestamp, age }]
   */
  getPendingConfirmations(): Array<{ id: string; command: string; category: string; timestamp: number; age: number }> {
    const now = Date.now();
    const result: Array<{ id: string; command: string; category: string; timestamp: number; age: number }> = [];
    
    for (const [id, details] of this.pendingConfirmationDetails.entries()) {
      result.push({
        id,
        command: details.command,
        category: details.category,
        timestamp: details.timestamp,
        age: Math.round((now - details.timestamp) / 1000) // 秒數
      });
    }
    
    return result;
  }

  /**
   * 回應確認請求
   * @param id 確認請求 ID
   * @param action 動作: 'run' | 'sessionAllow' | 'projectAllow' | 'cancel' | 'custom'
   * @param customText 自定義回應文字（當 action 為 'custom' 時）
   * @returns 回應結果訊息
   */
  respondToConfirmation(id: string, action: 'run' | 'sessionAllow' | 'projectAllow' | 'cancel' | 'custom', customText?: string): string {
    const pending = this.pendingConfirmations.get(id);
    const details = this.pendingConfirmationDetails.get(id);
    
    if (!pending) {
      return `Confirmation not found: ${id}`;
    }
    
    const category = details?.category || '';
    this.pendingConfirmations.delete(id);
    this.pendingConfirmationDetails.delete(id);
    this.broadcast({ type: 'confirmClear', id });
    
    switch (action) {
      case 'run':
        pending({ approved: true });
        return `Confirmation ${id} approved`;
      case 'projectAllow':
        pending({ approved: true, projectAllow: category });
        return `Confirmation ${id} approved (project allow for ${category})`;
      case 'sessionAllow':
        pending({ approved: true, sessionAllow: category });
        return `Confirmation ${id} approved (session allow for ${category})`;
      case 'cancel':
        pending({ approved: false });
        return `Confirmation ${id} cancelled`;
      case 'custom':
        pending({ approved: false, customResponse: customText || '' });
        return `Confirmation ${id} responded with custom text`;
      default:
        pending({ approved: false });
        return `Confirmation ${id} cancelled (unknown action)`;
    }
  }

  /**
   * 取得當前狀態摘要（供外部監控）
   */
  getStatus(): { 
    busy: boolean; 
    mode: string; 
    model: string; 
    modelId?: string;
    modelName?: string;
    pendingConfirmations: number;
    chatId: string;
    messageCount: number;
    agentName: string;
    agentEmoji: string;
    taskFolder?: string;
    activityStatus: string;
    activityLines: string[];
    tasksTotal: number;
    tasksRunning: number;
  } {
    const sdk = geminiSDK.getStatus();
    return {
      busy: this.busy,
      mode: this.currentMode,
      model: this.currentModelLabel,
      modelId: this.lastResolvedModelId,
      modelName: this.lastResolvedModelName,
      pendingConfirmations: this.pendingConfirmations.size,
      chatId: this.currentChatId,
      messageCount: this.messages.length,
      agentName: this.currentAgentName,
      agentEmoji: this.currentAgentEmoji,
      taskFolder: this.currentTask.taskFolder,
      activityStatus: this.activityStatus,
      activityLines: [...this.activityLines],
      tasksTotal: sdk.total,
      tasksRunning: sdk.running,
    };
  }

  /**
   * 發送使用者訊息（供外部服務呼叫）
   * @param text 訊息內容
   * @param mode 操作模式（可選）
   */
  async sendMessage(text: string, mode?: 'chat' | 'agent' | 'agent-full'): Promise<void> {
    if (mode) {
      this.currentMode = mode;
      this.broadcast({ type: 'modeUpdate', mode });
    }
    await this.handleUserMessage(text, this.currentMode, [], []);
  }

  private async resolveModel(): Promise<vscode.LanguageModelChat | undefined> {
    if (!vscode.lm?.selectChatModels) {
      return undefined;
    }
    try {
      const preferredModelId = getPreferredModelId();
      if (preferredModelId) {
        const matches = await vscode.lm.selectChatModels({ vendor: 'copilot', id: preferredModelId });
        if (matches.length > 0) {
          this.lastResolvedModelId = matches[0].id;
          this.lastResolvedModelName = matches[0].name;
          return matches[0];
        }
      }

      const models = await vscode.lm.selectChatModels({ vendor: 'copilot' });
      if (models[0]) {
        this.lastResolvedModelId = models[0].id;
        this.lastResolvedModelName = models[0].name;
      }
      return models[0];
    } catch (err) {
      console.warn('[BlueMonster] Failed to resolve model:', err);
      return undefined;
    }
  }

  private async runChatLoop(
    model: vscode.LanguageModelChat,
    messages: vscode.LanguageModelChatMessage[],
    token: vscode.CancellationToken
  ): Promise<ChatResult> {
    let combinedText = '';
    const parts: UiMessagePart[] = [];

    const pushPart = (part: UiMessagePart) => {
      if (part.kind === 'text' || part.kind === 'thought') {
        const text = part.text ?? '';
        if (!text) {
          return;
        }
        const last = parts[parts.length - 1];
        if (last && last.kind === part.kind) {
          last.text = `${last.text ?? ''}${text}`;
          return;
        }
      }
      parts.push(part);
    };

    const appendText = (text: string) => {
      combinedText += text;
      pushPart({ kind: 'text', text });
    };

    const isThoughtMime = (mimeType: string) => /reason|thought|analysis/i.test(mimeType);
    const isTextMime = (mimeType: string) =>
      mimeType.startsWith('text/') || mimeType === 'application/json' || mimeType === 'application/xml';

    const handleDataPart = (dataPart: vscode.LanguageModelDataPart) => {
      const mimeType = dataPart.mimeType || '';
      if (!dataPart.data) {
        return;
      }
      if (mimeType.startsWith('image/')) {
        const base64 = Buffer.from(dataPart.data).toString('base64');
        pushPart({
          kind: 'image',
          dataUrl: `data:${mimeType};base64,${base64}`,
          mimeType
        });
        return;
      }

      const text = Buffer.from(dataPart.data).toString('utf8');
      if (!text) {
        return;
      }

      if (isThoughtMime(mimeType)) {
        pushPart({ kind: 'thought', text, mimeType });
        return;
      }

      if (isTextMime(mimeType)) {
        appendText(text);
      }
    };

    for (let turn = 0; turn < MAX_TOOL_TURNS; turn += 1) {
      // 檢查是否已取消
      if (token.isCancellationRequested || this.stopRequested) {
        this.appendThinking('已取消生成');
        return { text: combinedText.trim() || 'Generation cancelled.', parts };
      }
      
      this.appendThinking('Waiting for model response...');
      this.appendWorking('向模型送出請求...');
      
      // 「計畫」模式下不提供工具，只能聊天
      let tools: vscode.LanguageModelChatTool[] = [];
      if (this.currentMode !== 'chat') {
        tools = [terminalToolDefinition(), searchTasksToolDefinition(), vsCodeCommandToolDefinition()];
        if (getDangerModeEnabled()) {
          tools.push(
            readFileToolDefinition(),
            writeFileToolDefinition(),
            openFileToolDefinition(),
            switchWindowToolDefinition()
          );
        }
      }
      
      // 根據模型 multiplier 計算 request 消耗
      const multiplierValue = getModelMultiplierValue(model.name);
      this.currentTask.requestCount += multiplierValue;
      // 同時記錄到全域預算追蹤
      requestQueue.recordUsage(multiplierValue);
      this.broadcast({ 
        type: 'agentInfo', 
        name: this.currentTask.agentName, 
        emoji: this.currentTask.agentEmoji, 
        requestCount: this.currentTask.requestCount 
      });
      // 廣播更新的佇列狀態（包含預算）
      this.broadcastQueueStatus();
      
      const chatResponse = await model.sendRequest(
        messages,
        {
          tools,
          toolMode: vscode.LanguageModelChatToolMode.Auto
        },
        token
      );

      const toolCalls: vscode.LanguageModelToolCallPart[] = [];
      let announcedStreaming = false;
      let announcedWorking = false;

      for await (const part of chatResponse.stream) {
        // 在串流中檢查取消
        if (token.isCancellationRequested || this.stopRequested) {
          this.appendThinking('已取消生成');
          return { text: combinedText.trim() || 'Generation cancelled.', parts };
        }
        
        if (part instanceof vscode.LanguageModelTextPart) {
          if (!announcedStreaming) {
            this.appendThinking('Generating response...');
            announcedStreaming = true;
          }
          if (!announcedWorking) {
            this.appendWorking('產生回應中...');
            announcedWorking = true;
          }
          appendText(part.value);
        } else if (part instanceof vscode.LanguageModelToolCallPart) {
          toolCalls.push(part);
        } else if (part instanceof vscode.LanguageModelDataPart) {
          handleDataPart(part);
        }
      }

      if (toolCalls.length === 0) {
        if (!parts.length && !combinedText.trim()) {
          const text = 'No response.';
          return { text, parts: [{ kind: 'text', text }] };
        }
        return { text: combinedText.trim(), parts };
      }

      for (const call of toolCalls) {
        // 在處理每個工具呼叫前檢查取消
        if (token.isCancellationRequested || this.stopRequested) {
          this.appendThinking('已取消生成');
          return { text: combinedText.trim() || 'Generation cancelled.', parts };
        }
        
        // 支援的工具名稱集合
        const SUPPORTED_TOOLS = new Set([
          TOOL_NAME, VS_COMMAND_TOOL_NAME, READ_FILE_TOOL_NAME, 
          WRITE_FILE_TOOL_NAME, OPEN_FILE_TOOL_NAME, SWITCH_WINDOW_TOOL_NAME, SEARCH_TASKS_TOOL_NAME
        ]);
        
        if (!SUPPORTED_TOOLS.has(call.name)) {
          appendText(`\n\nUnsupported tool call: ${call.name}`);
          continue;
        }
        
        // 工具處理器映射表
        type ToolHandler = { normalize: (input: object) => any; action: (normalized: any) => Promise<string>; label: string };
        const toolHandlers: Record<string, ToolHandler> = {
          [TOOL_NAME]: {
            normalize: normalizeToolInput,
            action: (n) => this.runTerminalCommandWithResult(n.command, n.cwd),
            label: 'run terminal command'
          },
          [VS_COMMAND_TOOL_NAME]: {
            normalize: normalizeVsCodeCommandInput,
            action: (n) => this.runVsCodeCommandWithResult(n.command, n.args),
            label: 'execute VS Code command'
          },
          [READ_FILE_TOOL_NAME]: {
            normalize: normalizeReadFileInput,
            action: (n) => this.readFileWithResult(n.path),
            label: 'read file'
          },
          [WRITE_FILE_TOOL_NAME]: {
            normalize: normalizeWriteFileInput,
            action: (n) => this.writeFileWithResult(n.path, n.content),
            label: 'write file'
          },
          [OPEN_FILE_TOOL_NAME]: {
            normalize: normalizeOpenFileInput,
            action: (n) => this.openFileWithResult(n.path, n.preview),
            label: 'open file'
          },
          [SEARCH_TASKS_TOOL_NAME]: {
            normalize: normalizeSearchTasksInput,
            action: (n) => this.searchTasksWithResult(n.query),
            label: 'search tasks'
          },
          [SWITCH_WINDOW_TOOL_NAME]: {
            normalize: () => ({}),
            action: () => this.switchWindowWithResult(),
            label: 'switch window'
          }
        };
        
        let result: vscode.LanguageModelToolResult;
        try {
          const handler = toolHandlers[call.name];
          const normalized = handler.normalize(call.input);
          if (!normalized) {
            appendText(`\n\nTool input invalid for ${call.name}.`);
            continue;
          }
          this.appendThinking(`Tool requested: ${handler.label}.`);
          this.appendWorking(`執行工具：${handler.label}`);
          const text = await handler.action(normalized);
          result = new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(text)]);
        } catch (error) {
          const errorText = String(error);
          appendText(`\n\nTool invocation failed: ${errorText}`);
          continue;
        }

        messages.push(vscode.LanguageModelChatMessage.Assistant([call]));
        messages.push(
          vscode.LanguageModelChatMessage.User([
            new vscode.LanguageModelToolResultPart(call.callId, result.content)
          ])
        );
      }
      
      // 在第 5 次迭代時提醒用戶
      if (turn === 4) {
        this.addMessage('system', `⚠️ 已執行 5 次工具呼叫。如果任務仍未完成，將在 ${MAX_TOOL_TURNS - 5} 次後停止。`);
      }
    }

    appendText(`\n\n⚠️ **已達到最大迭代次數 (${MAX_TOOL_TURNS} 次)**\n\n如果任務尚未完成，請再次發送訊息讓我繼續嘗試，或告訴我具體遇到什麼問題。`);
    return { text: combinedText.trim(), parts };
  }

  private async runLm(
    prompt: string,
    images?: Array<{dataUrl: string, mimeType: string, name: string}>,
    memoryContext?: string
  ): Promise<ChatResult> {
    const chatId = this.currentChatId;
    const task = this.currentTask;
    const preferredModel = getPreferredModelId() || '';
    const preferredType = preferredModel ? detectModelType(preferredModel) : undefined;

    // If the selected model is not a Gemini model, skip Gemini API and go straight to Copilot LM.
    if (preferredModel && preferredType !== 'gemini') {
      return await this._runLmCore(prompt, images, memoryContext);
    }
    
    // ===== 真正的並行執行 - 使用 Copilot SDK =====
    try {
      // 嘗試使用 SDK 並行模式
      return await this._runWithSDK(chatId, task, prompt, images, memoryContext);
    } catch (sdkErr) {
      // SDK 失敗時 fallback 到 VS Code API
      console.warn('[BlueMonster] SDK failed, falling back to VS Code API:', sdkErr);
      this.appendThinking('SDK 不可用，使用 VS Code API...');
      return await this._runLmCore(prompt, images, memoryContext);
    }
  }
  
  // 使用 Copilot SDK 的真正並行執行
  private async _runWithSDK(
    chatId: string,
    task: TaskState,
    prompt: string,
    images?: Array<{dataUrl: string, mimeType: string, name: string}>,
    memoryContext?: string
  ): Promise<ChatResult> {
    // 取得或創建獨立的 Worker Session
    this.appendThinking('🏭 啟動並行 Worker...');
		    const preferredModel = getPreferredModelId() || 'gemini-3-pro-preview';
	    const configuredReasoning = getReasoningEffort();
	    const reasoningSupported = supportsReasoningEffort(preferredModel);
	    const reasoningEffort = reasoningSupported ? configuredReasoning : 'medium';
	    task.modelId = preferredModel;
	    task.modelName = preferredModel;
	    task.reasoningEffort = reasoningSupported ? reasoningEffort : undefined;
	    console.log(`[BlueMonster] Using model: ${preferredModel}${reasoningSupported ? ` (Reasoning: ${reasoningEffort})` : ''}`);
    this.appendThinking(`🤖 模型: ${preferredModel}${reasoningSupported && reasoningEffort !== 'medium' ? ` (${reasoningEffort})` : ''}`);
    this.appendWorking('啟動並行 Worker...');
    const session = await geminiSDK.createWorker(chatId, preferredModel, reasoningEffort);
    const unsubscribe = session.on((event: any) => this.handleSdkActivityEvent(event, chatId));
    
    // 標記為忙碌
    geminiSDK.markBusy(chatId);
    this.broadcastQueueStatus();
    this.appendThinking(`🔵 Worker ${chatId.slice(0, 8)} 開始執行`);
    
    try {
      // 組建提示 - 使用 prompts/index.ts 的 buildPrompt
      const modelType = detectModelType(preferredModel);
      const dangerMode = this.currentMode === 'agent-full';
      const systemPrompt = buildPrompt(modelType, { 
        dangerMode,
        modelName: preferredModel,
        agentMode: this.currentMode as 'chat' | 'agent' | 'agent-full',
        reasoningEffort
      });
      
      let fullPrompt = systemPrompt;

      const personaPrompt = await this.loadTaskPersonaPrompt(task.taskFolder);
      if (personaPrompt) {
        fullPrompt += `\n\n${personaPrompt}`;
      }
      
      // 注入工作目錄資訊 (Fix: AI 不知道自己在哪裡)
      const currentCwd = task.taskFolder || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (currentCwd) {
        fullPrompt += `\n\n<current_working_directory>${currentCwd}</current_working_directory>`;
        fullPrompt += `\nSystem Note: You are executing in "${currentCwd}".\n1. Do NOT mention this path unless asked.\n2. Always SAVE files to this directory (cwd) by default, do NOT use /tmp or other system paths unless explicitly requested.`;
      }

      if (memoryContext) {
        fullPrompt += `\n\nLong-term memory:\n${memoryContext}`;
      }
      fullPrompt += `\n\nUser: ${prompt}`;
      
      // 記錄 request 消耗
      const multiplierValue = getModelMultiplierValue(preferredModel);
      task.requestCount += multiplierValue;
      geminiSDK.recordUsage(multiplierValue);
	      this.broadcast({ 
	        type: 'agentInfo', 
	        name: task.agentName, 
	        emoji: task.agentEmoji, 
	        requestCount: task.requestCount,
	        modelId: task.modelId,
	        modelName: task.modelName,
	        reasoningEffort: task.reasoningEffort,
	        personaTitle: task.personaTitle
	      });
      this.broadcastQueueStatus();
      
	      // 使用 sendAndWait - 更簡潔的 API
	      // 這是真正的並行！多個 session 可以同時 sendAndWait
	      this.appendThinking('🚀 發送請求 (並行模式)...');
	      this.appendWorking('送出請求到 Gemini API...');
      
      try {
        const response = await session.sendAndWait(
          { prompt: fullPrompt },
          300000 // 5 分鐘超時
        );
        
        const responseText = response?.data?.content || 'No response.';
        this.pushActivityLine('已收到回應');
        this.setActivity('Idle');
        return { 
          text: responseText, 
          parts: [{ kind: 'text', text: responseText }]
        };
      } catch (err) {
        // 如果 session 內部錯誤 (例如 timeout 或 invalid body)，可能會導致 session 狀態卡住
        // 因此必須銷毀此 session，確保下次請求能建立新的 worker
        console.error(`[BlueMonster] Worker ${chatId} crashed, destroying session:`, err);
        await geminiSDK.destroyWorker(chatId);
        throw err; // 拋出給外層 catch 處理 (fallback)
      } finally {
        try { unsubscribe(); } catch {}
        geminiSDK.markIdle(chatId);
        this.broadcastQueueStatus();
      }
    } catch (err) {
       // 外層會 catch 並 fallback to LM API
       // 確保這裡也標記為閒置 (雖然 finally 已經處理了 inner try，但為了保險起見)
       geminiSDK.markIdle(chatId);
       this.broadcastQueueStatus();
       throw err; 
    }
  }
  
  // 廣播狀態給所有 webview
  private broadcastQueueStatus(): void {
    const status = geminiSDK.getStatus();
    this.broadcast({
      type: 'queueStatus',
      ...status
    });
  }

  private async loadTaskPersonaPrompt(taskFolder?: string): Promise<string> {
    if (!taskFolder) return '';
    const p = await import('path');
    const vscodeDir = p.join(taskFolder, '.vscode');
    const instructionsPath = p.join(vscodeDir, 'copilot-instructions.md');
    const mePath = p.join(vscodeDir, 'me.md');

    const [instructions, me] = await Promise.all([
      readLimited(instructionsPath, 12000),
      readLimited(mePath, 8000)
    ]);

    const sections: string[] = [];
    if (instructions) {
      sections.push(`<copilot_instructions>\n${instructions}\n</copilot_instructions>`);
    }
    if (me) {
      sections.push(`<persona>\n${me}\n</persona>`);
    }

    return sections.join('\n\n');
  }

  private async _runLmCore(
    prompt: string,
    images?: Array<{dataUrl: string, mimeType: string, name: string}>,
    memoryContext?: string
  ): Promise<ChatResult> {
    const model = await this.resolveModel();
    if (!model) {
      const text = 'No Copilot model available. Check Copilot login and plan.';
      return { text, parts: [{ kind: 'text', text }] };
    }

	    this.setModelLabel(`Model: ${model.name}`);
	    this.appendThinking(`Using model: ${model.name}`);
	    // Persist per-task model metadata for agent cards / details.
	    this.currentTask.modelId = model.id || model.name;
	    this.currentTask.modelName = model.name || model.id;
	    const access = this.context.languageModelAccessInformation;
    if (access?.canSendRequest && access.canSendRequest(model) === false) {
      const text = 'Copilot access not granted. Please run a chat request from the UI first.';
      return { text, parts: [{ kind: 'text', text }] };
    }

    // 檢查模型是否支援圖片輸入 (fallback 為 true)
    const supportsImages = (model as any).capabilities?.imageInput !== false;

    // 組建 System Prompt（根據模型類型自動選擇最佳化 prompt）
    const modelType = detectModelType(model.name);
    const dangerMode = getDangerModeEnabled();
	    const currentReasoning = supportsReasoningEffort(model.id || model.name)
	      ? getReasoningEffort()
	      : 'medium';
	    this.currentTask.reasoningEffort = supportsReasoningEffort(model.id || model.name) ? currentReasoning : undefined;
    
    let systemPrompt = buildPrompt(modelType, { 
      dangerMode,
      modelName: model.name || model.id,
      agentMode: this.currentMode,
      reasoningEffort: currentReasoning
    });

    const personaPrompt = await this.loadTaskPersonaPrompt(this.currentTask.taskFolder);
    if (personaPrompt) {
      systemPrompt += `\n\n${personaPrompt}`;
    }
    
    if (memoryContext) {
      systemPrompt += `\nSystem: Long-term memory (previous chats, may be relevant):\n${memoryContext}`;
    }

    const messages: vscode.LanguageModelChatMessage[] = [vscode.LanguageModelChatMessage.User(systemPrompt)];
    for (const entry of this.messages) {
      if (entry.role === 'user') {
        if (entry.text) {
          messages.push(vscode.LanguageModelChatMessage.User(entry.text));
        }
      } else if (entry.role === 'assistant') {
        if (entry.kind !== 'thought' && entry.kind !== 'image' && entry.text) {
          messages.push(vscode.LanguageModelChatMessage.Assistant(entry.text));
        }
      }
    }
    
    // 處理圖片附件 - 建立包含圖片的訊息
    if (images && images.length > 0 && !supportsImages) {
      this.addMessage('system', 'Selected model does not support image input. Images were ignored.');
    }

    if (images && images.length > 0 && supportsImages) {
      // 如果有圖片，建立多部分訊息
      const userContent: (vscode.LanguageModelTextPart | vscode.LanguageModelDataPart)[] = [];
      
      // 先加入文字
      if (prompt) {
        userContent.push(new vscode.LanguageModelTextPart(prompt));
      }
      
      // 加入圖片
      for (const img of images) {
        try {
          // 從 dataUrl 提取 base64 資料
          if (!img.dataUrl || typeof img.dataUrl !== 'string') {
            continue;
          }
          const base64Match = img.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
          if (base64Match) {
            const mimeType = base64Match[1];
            const base64Data = base64Match[2];
            if (!base64Data) {
              continue;
            }
            const buffer = Buffer.from(base64Data, 'base64');
            const uint8Array = new Uint8Array(buffer);
            // 注意：參數順序是 (data, mimeType)
            userContent.push(new vscode.LanguageModelDataPart(uint8Array, mimeType));
            this.appendThinking(`附加圖片: ${img.name}`);
          }
        } catch (e) {
          this.appendThinking(`圖片處理失敗: ${img.name}`);
        }
      }
      if (userContent.length === 0) {
        userContent.push(new vscode.LanguageModelTextPart(prompt || ''));
      }
      
      messages.push(vscode.LanguageModelChatMessage.User(userContent));
    } else {
      messages.push(vscode.LanguageModelChatMessage.User(prompt));
    }

    this.appendThinking('Sending request to model...');
    const tokenSource = new vscode.CancellationTokenSource();
    if (this.currentCancellation) {
      this.currentCancellation.dispose();
    }
    this.currentCancellation = tokenSource;
    try {
      return await this.runChatLoop(model, messages, tokenSource.token);
    } finally {
      if (this.currentCancellation === tokenSource) {
        this.currentCancellation.dispose();
        this.currentCancellation = undefined;
      }
    }
  }

  private async listCopilotModels(): Promise<string> {
    return this.listModels();
  }

  private async getModelOptions(): Promise<{ current?: string; currentReasoning?: string; options?: any[]; hint?: string }> {
    // Copilot SDK 支援的模型列表（含 Reasoning Effort 選項）- 參考 GitHub Copilot 官方 Multiplier
    let hint = '🏭 Copilot SDK: 真正並行執行';
    let dynamicModels: vscode.LanguageModelChat[] = [];
    try {
      if (vscode.lm?.selectChatModels) {
        dynamicModels = await vscode.lm.selectChatModels({ vendor: 'copilot' });
      }
      if (dynamicModels.length > 0) {
        hint = '✅ 使用 Copilot 服務提供的模型清單';
      }
    } catch (err) {
      hint = '⚠️ 無法取得 Copilot 模型清單，顯示內建清單';
    }

    const currentReasoning = getReasoningEffort();
    const availableIds = new Set(dynamicModels.map(m => m.id));
    const baseOptions = availableIds.size > 0
      ? SDK_MODELS.filter(m => availableIds.has(m.id))
      : SDK_MODELS;

    const extras = dynamicModels
      .filter(m => !SDK_MODELS.some(s => s.id === m.id))
      .map((m) => ({
        id: m.id,
        label: m.name || m.id,
        multiplier: '',
        reasoningOptions: undefined
      }));

    let mergedOptions = [...baseOptions, ...extras];
    const current = getPreferredModelId() || (dynamicModels[0]?.id ?? 'gemini-3-pro-preview');
    if (current && !mergedOptions.some(o => o.id === current)) {
      mergedOptions.unshift({
        id: current,
        label: current,
        multiplier: '',
        reasoningOptions: undefined
      });
    }

    const multiplierOrder: Record<string, number> = { '0x': 0, '0.33x': 1, '1x': 2, '3x': 3, '10x': 4, '': 99 };
    const sortedOptions = [...mergedOptions].sort((a, b) => {
      const orderA = multiplierOrder[a.multiplier] ?? 99;
      const orderB = multiplierOrder[b.multiplier] ?? 99;
      if (orderA !== orderB) return orderA - orderB;
      return a.label.localeCompare(b.label);
    });
    let lastMultiplier = '';
    const options = sortedOptions.map((opt) => {
      const isNewGroup = opt.multiplier !== lastMultiplier;
      lastMultiplier = opt.multiplier;
      return { ...opt, isNewGroup };
    });
    return {
      current,
      currentReasoning,
      options,
      hint
    };
  }

  private async setCopilotModelByName(name: string): Promise<string> {
    return this.setModel(name);
  }

  private handleConfirmResponse(message: any) {
    const id = typeof message?.id === 'string' ? message.id : '';
    if (!id) {
      return;
    }
    const action = typeof message?.action === 'string' ? message.action : 'cancel';
    const category = typeof message?.category === 'string' ? message.category : '';
    const customText = typeof message?.customText === 'string' ? message.customText : '';
    const pending = this.pendingConfirmations.get(id);
    if (!pending) {
      return;
    }
    this.pendingConfirmations.delete(id);
    
    if (action === 'always') {
      // 舊的「不再詢問」- 永久關閉確認（保留向後相容）
      pending({ approved: true, remember: true });
    } else if (action === 'projectAllow') {
      pending({ approved: true, projectAllow: category });
    } else if (action === 'sessionAllow') {
      pending({ approved: true, sessionAllow: category });
    } else if (action === 'run') {
      pending({ approved: true });
    } else if (action === 'custom') {
      pending({ approved: false, customResponse: customText });
    } else {
      pending({ approved: false });
    }
  }

  private handleChoiceResponse(message: any) {
    const id = typeof message?.id === 'string' ? message.id : '';
    if (!id) {
      return;
    }
    const selectedIndex = typeof message?.selectedIndex === 'number' ? message.selectedIndex : 0;
    const customText = typeof message?.customText === 'string' ? message.customText : '';
    const pending = this.pendingChoices.get(id);
    if (!pending) {
      return;
    }
    this.pendingChoices.delete(id);
    pending({ selectedIndex, customResponse: customText || undefined });
  }

  /**
   * 顯示多選項給用戶選擇
   * @param title 標題
   * @param description 說明
   * @param options 選項列表
   * @returns 用戶選擇結果
   */
  async showChoiceToUser(title: string, description: string, options: ChoiceOption[]): Promise<ChoiceResult> {
    if (this.views.size === 0) {
      // Fallback: 使用 VS Code 內建的 QuickPick
      const items = options.map((opt, idx) => ({
        label: `${idx + 1}. ${opt.label}${opt.recommended ? ' ⭐' : ''}`,
        description: opt.description
      }));
      items.push({ label: `${options.length + 1}. 其他`, description: '輸入自定義想法' });
      
      const selected = await vscode.window.showQuickPick(items, { title, placeHolder: description });
      if (!selected) {
        return { selectedIndex: 0 };
      }
      const idx = items.indexOf(selected);
      if (idx === options.length) {
        const custom = await vscode.window.showInputBox({ prompt: '請輸入您的想法' });
        return { selectedIndex: 0, customResponse: custom || undefined };
      }
      return { selectedIndex: idx + 1 };
    }

    const id = `choice-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const result = await new Promise<ChoiceResult>((resolve) => {
      this.pendingChoices.set(id, resolve);
      this.broadcast({ type: 'choice', id, title, description, options });
    });
    this.broadcast({ type: 'choiceClear', id });
    return result;
  }

  private async handleApplyModel(message: any) {
    const value = typeof message?.value === 'string' ? message.value.trim() : '';
    const reasoningEffort = typeof message?.reasoningEffort === 'string' ? message.reasoningEffort.trim() : '';
    if (!value) {
      return;
    }
    console.log(`[BlueMonster] Switching model to: ${value} (requested reasoning: ${reasoningEffort})`);
    await vscode.workspace
      .getConfiguration(CONFIG_SECTION)
      .update('model', value, vscode.ConfigurationTarget.Global);

    if (reasoningEffort) {
      await vscode.workspace
        .getConfiguration(CONFIG_SECTION)
        .update('reasoningEffort', reasoningEffort, vscode.ConfigurationTarget.Global);
    }
    
    // 銷毀當前 chat 的 session，讓下次請求使用新模型
    const chatId = this.currentChatId;
    await geminiSDK.destroyWorker(chatId);
    console.log(`[BlueMonster] Session destroyed, next request will use: ${value}`);
    
    let msg = `✅ 已切換模型為 **${value}**`;
    if (reasoningEffort) {
      const effortLabels: Record<string, string> = {
        'low': '⚡',
        'medium': '⚖️',
        'high': '🧠',
        'extra-high': '🔥'
      };
      msg += ` (${reasoningEffort} ${effortLabels[reasoningEffort] || ''})`;
    }
    this.addMessage('system', msg);
    this.setModelLabel(`Model: ${value}`);
    const modelOptions = await this.getModelOptions();
    this.broadcast({ type: 'modelOptions', ...modelOptions });
  }

  async handleUserMessage(
    text: string,
    mode?: string,
    images?: Array<{dataUrl: string, mimeType: string, name: string}>,
    files?: Array<{name: string, path: string}>
  ): Promise<ChatResult | undefined> {
    if (this.busy) {
      this.addMessage('system', 'BlueMonster is busy. Please wait.');
      return;
    }
    this.resetActivity();
    
    // 更新當前操作模式
    if (mode === 'chat' || mode === 'agent' || mode === 'agent-full') {
      this.currentMode = mode;
    }

    const trimmed = text.trim();
    if (!trimmed && (!images || images.length === 0) && (!files || files.length === 0)) {
      return;
    }

    // Help 指令
    if (trimmed === '/help') {
      this.addMessage('system', `🔵 BlueMonster 指令說明:

/model [name|list] - 查看或設定模型
/terminal <command> - 執行終端機指令
/help - 顯示此說明

模式說明:
• 🤖 Agent - AI 自主執行任務
• 💬 Ask - 單純問答對話
• ✏️ Edit - 編輯程式碼
• 📋 Plan - 規劃任務步驟

支援上傳多張圖片進行分析`);
      return;
    }

    if (trimmed.startsWith('/model')) {
      const arg = trimmed.replace('/model', '').trim();
      if (!arg) {
        const current = getPreferredModelId();
        this.addMessage(
          'system',
          current ? `Copilot model id: ${current}` : 'Copilot model is not set. Use "/model list".'
        );
        return;
      }
      if (arg === 'list') {
        const list = await this.listCopilotModels();
        this.addMessage('system', list);
        return;
      }
      const result = await this.setCopilotModelByName(arg);
      this.addMessage('system', result);
      return;
    }

    if (trimmed.startsWith('/terminal ')) {
      const command = trimmed.replace('/terminal', '').trim();
      if (!command) {
        this.addMessage('system', 'Usage: /terminal <command>');
        return;
      }
      await this.runTerminalCommand(command);
      return;
    }

    if (trimmed === '/terminal') {
      this.addMessage('system', 'Usage: /terminal <command>');
      return;
    }

    this.stopRequested = false;

    if (trimmed) {
      this.addMessage('user', trimmed);
    }
    
    // 顯示圖片（如果有）
    if (images && images.length > 0) {
      for (const img of images) {
        this.addMessage('user', '', { kind: 'image', dataUrl: img.dataUrl, mimeType: img.mimeType, name: img.name });
      }
    }

    if (files && files.length > 0) {
      for (const file of files) {
        this.addMessage('user', '', { kind: 'file', name: file.name });
      }
    }

    // 在進入模型前，優先處理「模型/模式」自動控制
    if (trimmed) {
      const handled = await this.tryHandleSelfControl(trimmed);
      if (handled) {
        return;
      }
    }
    
    this.setBusy(true);
    this.startThinking();

    try {
      // 將模式資訊加入 prompt
      const modePrompt = mode && mode !== 'agent' ? `[Mode: ${mode}] ` : '';
      const basePrompt =
        trimmed ||
        (images && images.length > 0
          ? 'Analyze the attached image(s).'
          : files && files.length > 0
            ? 'Use the attached file(s).'
            : '');
      const fileContext =
        files && files.length > 0
          ? `\n\nAttached files:\n${files.map((file) => `- ${file.name}: ${file.path}`).join('\n')}`
          : '';
      const memoryContext = trimmed ? await this.buildMemoryContext(trimmed) : '';
      const fullPrompt = modePrompt + basePrompt + fileContext;
      
      const response = await this.runLm(fullPrompt, images, memoryContext);
      if (this.stopRequested) {
        return;
      }
      this.addAssistantResult(response);
      return response;
    } catch (error) {
      if (this.stopRequested) {
        return;
      }
      this.addMessage('system', `Error: ${String(error)}`);
      return;
    } finally {
      this.stopThinking();
      this.stopWorking();
      this.setBusy(false);
    }
  }

  /**
   * External entrypoint: run a message and return assistant output + pending confirmations.
   * Used by UFO to bridge Telegram <-> BlueMonster without relying on the webview UI.
   */
  async sendMessageExternal(
    text: string,
    mode?: 'chat' | 'agent' | 'agent-full'
  ): Promise<{
    text: string;
    pendingConfirmations: Array<{ id: string; command: string; category: string; timestamp: number; age: number }>;
  }> {
    const before = this.messages.length;
    const result = await this.handleUserMessage(text, mode, [], []);
    const assistantText =
      (result?.text || '').trim() ||
      this.messages
        .slice(before)
        .filter((m) => m.role === 'assistant' && typeof m.text === 'string')
        .map((m) => m.text)
        .join('')
        .trim();
    return {
      text: assistantText,
      pendingConfirmations: this.getPendingConfirmations(),
    };
  }

  async handleMessage(message: any) {
    switch (message?.type) {
      case 'ready':
        this.broadcast({ type: 'history', messages: this.messages });
        void this.refreshModelLabel();
        if (this.activityLines.length > 0 || this.activityStatus !== 'Idle') {
          this.broadcast({ type: 'activity', status: this.activityStatus, lines: [...this.activityLines] });
        }
        break;
      case 'userMessage':
        await this.handleUserMessage(
          String(message.text || ''),
          message.mode,
          message.images,
          message.files
        );
        break;
      case 'requestModelOptions': {
        const options = await this.getModelOptions();
        this.broadcast({ type: 'modelOptions', ...options });
        break;
      }
      case 'applyModel':
        await this.handleApplyModel(message);
        break;
      case 'clear':
        this.clearHistory();
        break;
      case 'newChat': {
        // 保存當前對話到歷史記錄（不中斷正在執行的任務！）
        if (this.messages.length > 0) {
          await this.saveCurrentChatToHistory();
        }
        // 創建新任務（舊任務繼續在背景執行）- 等待 taskFolder 建立完成
        const newTask = await this.createNewTask();
        // 更新 UI 顯示新任務
        this.broadcast({ type: 'history', messages: [] });
        this.broadcast({ type: 'busy', value: false });
        this.broadcast({ 
          type: 'agentInfo', 
          name: newTask.agentName, 
          emoji: newTask.agentEmoji,
          requestCount: newTask.requestCount
        });
        this.broadcast({ 
          type: 'toast', 
          text: `${newTask.agentEmoji} ${newTask.agentName} 準備好了！` 
        });
        break;
      }
      case 'getHistory': {
        const query = typeof message?.query === 'string' ? message.query : '';
        // 合併歷史記錄和當前活動的任務
        const histories = await this.getChatHistoriesWithActiveTasks(query);
        this.broadcast({ type: 'chatHistories', histories });
        break;
      }
      case 'getTaskDetails': {
        const id = typeof message?.id === 'string' ? message.id : '';
        if (!id) break;
        const details = await this.getTaskDetails(id);
        if (details) {
          this.broadcast({ type: 'taskDetails', details });
        }
        break;
      }
      case 'loadHistory':
        await this.loadChatHistory(message.id);
        break;
      case 'exportChat':
        await this.exportChat();
        break;
      case 'insertCode':
        await this.insertCodeAtCursor(message.code);
        break;
      case 'runInTerminal':
        await this.runTerminalCommand(message.command);
        break;
      case 'openFile':
        // 開啟檔案
        if (message.path) {
          try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            let fileUri: vscode.Uri;
            if (message.path.startsWith('/')) {
              fileUri = vscode.Uri.file(message.path);
            } else if (workspaceFolder) {
              fileUri = vscode.Uri.joinPath(workspaceFolder.uri, message.path);
            } else {
              fileUri = vscode.Uri.file(message.path);
            }
            const doc = await vscode.workspace.openTextDocument(fileUri);
            await vscode.window.showTextDocument(doc);
          } catch (e) {
            vscode.window.showErrorMessage(`無法開啟檔案: ${message.path}`);
          }
        }
        break;
      case 'selectFiles': {
        const files: Array<{ name: string; path: string }> = [];
        if (message?.includeActive) {
          const editor = vscode.window.activeTextEditor;
          if (editor?.document?.uri?.fsPath) {
            const fsPath = editor.document.uri.fsPath;
            files.push({
              name: fsPath.split('/').pop() || fsPath,
              path: fsPath
            });
          }
        }
        if (files.length === 0) {
          const picked = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: true,
            openLabel: 'Attach'
          });
          if (picked && picked.length > 0) {
            picked.forEach((uri) => {
              files.push({
                name: uri.path.split('/').pop() || uri.path,
                path: uri.fsPath
              });
            });
          }
        }
        if (files.length > 0) {
          this.broadcast({ type: 'filesSelected', files });
        }
        break;
      }
      case 'viewImage':
        // 在新視窗中開啟圖片
        if (message.dataUrl) {
          const panel = vscode.window.createWebviewPanel(
            'blueMonster.imageView',
            'Image Preview',
            vscode.ViewColumn.Beside,
            {}
          );
          panel.webview.html = `<!DOCTYPE html><html><body style="margin:0;display:flex;justify-content:center;align-items:center;min-height:100vh;background:#1e1e1e;"><img src="${message.dataUrl}" style="max-width:100%;max-height:100vh;"/></body></html>`;
        }
        break;
      case 'stop':
        // TODO: 實作取消生成
        this.requestStop();
        this.stopThinking();
        this.setBusy(false);
        this.addMessage('system', '⏹️ Generation stopped by user.');
        break;
      case 'openTerminal':
        getTerminal().show();
        break;
      case 'openPanel':
        BlueMonsterPanel.show(this, this.context);
        break;
      case 'openSettings':
        await vscode.commands.executeCommand('workbench.action.openSettings', '@ext:vsmonster.blue-monster');
        break;
      case 'selectModel':
        await this.selectModel();
        void this.refreshModelLabel();
        break;
      case 'confirmResponse':
        this.handleConfirmResponse(message);
        break;
      case 'choiceResponse':
        this.handleChoiceResponse(message);
        break;
      default:
        break;
    }
  }

  private normalizeText(value: string): string {
    return value.toLowerCase().replace(/\s+/g, ' ').trim();
  }

  private tokenize(value: string): string[] {
    const tokens: string[] = [];
    const regex = /[a-z0-9]{2,}|[\u4e00-\u9fff]+/gi;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(value)) !== null) {
      const token = match[0].toLowerCase();
      if (!token) continue;
      if (STOP_WORDS.has(token)) continue;
      tokens.push(token);
    }
    return tokens;
  }

  private compactToken(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  private resolveModelIdFromText(text: string, models?: vscode.LanguageModelChat[]): string | undefined {
    const lower = text.toLowerCase();
    const compactText = this.compactToken(lower);
    const candidates: Array<{ id: string; alias: string; compact: string }> = [];
    const seen = new Set<string>();

    const addCandidate = (id: string, alias?: string) => {
      if (!id) return;
      const aliasValue = (alias || id).toLowerCase().trim();
      if (!aliasValue) return;
      const compact = this.compactToken(aliasValue);
      if (compact.length < 3) return;
      const key = `${id}|${aliasValue}`;
      if (seen.has(key)) return;
      seen.add(key);
      candidates.push({ id, alias: aliasValue, compact });
    };

    if (models && models.length > 0) {
      for (const model of models) {
        addCandidate(model.id);
        if (model.name) addCandidate(model.id, model.name);
      }
    }

    for (const model of SDK_MODELS) {
      addCandidate(model.id);
      if (model.label) addCandidate(model.id, model.label);
    }

    const ordered = candidates.sort((a, b) => b.compact.length - a.compact.length);
    for (const candidate of ordered) {
      if (lower.includes(candidate.alias)) {
        return candidate.id;
      }
    }
    for (const candidate of ordered) {
      if (compactText.includes(candidate.compact)) {
        return candidate.id;
      }
    }

    return undefined;
  }

  private async classifySelfControlIntent(text: string): Promise<{ action: 'none' | 'listModels' | 'setModel' | 'setMode'; model?: string; reasoning?: string; mode?: string }> {
    if (!vscode.lm?.selectChatModels) {
      return { action: 'none' };
    }
    const model = await this.resolveModel();
    if (!model) {
      return { action: 'none' };
    }
    const prompt = [
      'You are an intent classifier for a VS Code assistant.',
      'Return JSON ONLY.',
      'Decide if the user wants to list models, set model, set mode, or none.',
      'Use action in ["none","listModels","setModel","setMode"].',
      'If setMode, mode must be one of ["chat","agent","agent-full"].',
      'If setModel, include model as the model id or name if mentioned.',
      'If reasoning effort is mentioned, include reasoning in ["low","medium","high","extra-high"].',
      `User: ${text}`
    ].join('\n');

    const response = await model.sendRequest(
      [vscode.LanguageModelChatMessage.User(prompt)],
      { tools: [], toolMode: vscode.LanguageModelChatToolMode.None }
    );
    let textOut = '';
    for await (const part of response.stream) {
      if (part instanceof vscode.LanguageModelTextPart) {
        textOut += part.value;
      }
    }
    const jsonMatch = textOut.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { action: 'none' };
    }
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      const action = parsed.action as 'none' | 'listModels' | 'setModel' | 'setMode';
      return {
        action: action || 'none',
        model: typeof parsed.model === 'string' ? parsed.model : undefined,
        reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : undefined,
        mode: typeof parsed.mode === 'string' ? parsed.mode : undefined
      };
    } catch {
      return { action: 'none' };
    }
  }

  // 嘗試從自然語句中解析「模型/模式」控制指令（改成先用 LLM 做意圖判斷）
  private async tryHandleSelfControl(text: string): Promise<boolean> {
    const raw = text.trim();
    if (!raw) return false;
    const hint = /(模型|model|mode|代理|計畫|安全|危險|danger|safe|chat|plan)/i;
    if (!hint.test(raw)) {
      return false;
    }

    const intent = await this.classifySelfControlIntent(raw);
    if (intent.action === 'listModels') {
      const list = await this.listModels();
      this.addMessage('system', list);
      return true;
    }
    if (intent.action === 'setMode') {
      if (!intent.mode) {
        this.addMessage('system', '請告訴我要切換到哪一種模式（chat / agent / agent-full）。');
        return true;
      }
      const result = this.setMode(intent.mode);
      this.addMessage('system', result);
      return true;
    }
    if (intent.action === 'setModel') {
      const modelText = intent.model?.trim();
      if (!modelText) {
        this.addMessage('system', '請告訴我要切換到哪個模型，或輸入「列出可用模型」。');
        return true;
      }
      const reasoning = intent.reasoning && /(low|medium|high|extra-high)/i.test(intent.reasoning)
        ? intent.reasoning.toLowerCase()
        : '';
      const arg = reasoning ? `${modelText} (${reasoning})` : modelText;
      const result = await this.setModel(arg);
      this.addMessage('system', result);
      return true;
    }
    return false;
  }

  private buildSearchText(messages: UiMessage[]): string {
    const combined = messages
      .filter((m) => m.kind !== 'image' && typeof m.text === 'string' && m.text.trim())
      .map((m) => m.text || '')
      .join('\n');
    const normalized = this.normalizeText(combined);
    return normalized.slice(0, MAX_HISTORY_TEXT_CHARS);
  }

  private buildTokenCounts(searchText: string): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const token of this.tokenize(searchText)) {
      counts[token] = (counts[token] || 0) + 1;
    }
    return counts;
  }

  private buildHistoryPreview(messages: UiMessage[]): string {
    const recent = [...messages].reverse().find((m) => m.text && m.kind !== 'image');
    const preview = recent?.text ? recent.text.replace(/\s+/g, ' ').trim() : '';
    if (!preview) return '';
    return preview.length > 120 ? `${preview.slice(0, 120)}…` : preview;
  }

  private cloneMessages(messages: UiMessage[]): UiMessage[] {
    return messages.map((m) => ({ ...m }));
  }

  private async ensureHistoryIndex(histories: ChatHistoryEntry[]): Promise<ChatHistoryEntry[]> {
    let changed = false;
    const updated = histories.map((entry) => {
      let searchText = entry.searchText;
      let tokenCounts = entry.tokenCounts;
      let preview = entry.preview;
      let createdAt = entry.createdAt;
      let updatedAt = entry.updatedAt;
      if (!createdAt && updatedAt) {
        createdAt = updatedAt;
        changed = true;
      }
      if (!updatedAt && createdAt) {
        updatedAt = createdAt;
        changed = true;
      }
      if (!createdAt && !updatedAt) {
        createdAt = Date.now();
        updatedAt = createdAt;
        changed = true;
      }
      if (!searchText) {
        searchText = this.buildSearchText(entry.messages || []);
        changed = true;
      }
      if (!tokenCounts) {
        tokenCounts = this.buildTokenCounts(searchText || '');
        changed = true;
      }
      if (!preview) {
        preview = this.buildHistoryPreview(entry.messages || []);
        changed = true;
      }
      return { ...entry, searchText, tokenCounts, preview, createdAt, updatedAt };
    });

    if (changed) {
      await this.context.globalState.update('chatHistories', updated);
    }
    return updated;
  }

  private scoreHistory(entry: ChatHistoryEntry, tokens: string[], normalizedQuery: string): { score: number; matchCount: number } {
    let score = 0;
    let matchCount = 0;
    const counts = entry.tokenCounts || {};
    for (const token of tokens) {
      const hit = counts[token] || 0;
      if (hit > 0) {
        score += hit;
        matchCount += 1;
      }
    }
    if (normalizedQuery && entry.searchText && entry.searchText.includes(normalizedQuery)) {
      score += 2;
      if (matchCount === 0) {
        matchCount = 1;
      }
    }
    return { score, matchCount };
  }

  private async findRelevantHistories(query: string, limit = MAX_MEMORY_MATCHES): Promise<Array<{ entry: ChatHistoryEntry; score: number; matchCount: number }>> {
    const normalizedQuery = this.normalizeText(query);
    if (!normalizedQuery) {
      return [];
    }
    const histories = await this.ensureHistoryIndex(
      this.context.globalState.get<ChatHistoryEntry[]>('chatHistories') || []
    );
    const tokens = this.tokenize(normalizedQuery);
    const scored = histories
      .filter((entry) => entry.id !== this.currentChatId)
      .map((entry) => {
        const { score, matchCount } = this.scoreHistory(entry, tokens, normalizedQuery);
        return { entry, score, matchCount };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => {
        const timeA = a.entry.updatedAt || a.entry.createdAt || 0;
        const timeB = b.entry.updatedAt || b.entry.createdAt || 0;
        return b.score - a.score || timeB - timeA;
      });
    return scored.slice(0, limit);
  }

  private async buildMemoryContext(query: string): Promise<string> {
    const matches = await this.findRelevantHistories(query);
    if (!matches.length) {
      return '';
    }

    const lines = matches.map(({ entry }) => {
      const lastUser = [...(entry.messages || [])].reverse().find((m) => m.role === 'user' && m.text);
      const lastAssistant = [...(entry.messages || [])].reverse().find((m) => m.role === 'assistant' && m.text);
      const snippetParts: string[] = [];
      if (lastUser?.text) {
        snippetParts.push(`User: ${lastUser.text.trim()}`);
      }
      if (lastAssistant?.text) {
        snippetParts.push(`Assistant: ${lastAssistant.text.trim()}`);
      }
      const snippet = snippetParts.join(' | ');
      const compactSnippet = snippet.length > 300 ? `${snippet.slice(0, 300)}…` : snippet;
      return `- ${entry.title} (${entry.date}): ${compactSnippet}`;
    });

    let context = lines.join('\n');
    if (context.length > MAX_MEMORY_CONTEXT_CHARS) {
      context = `${context.slice(0, MAX_MEMORY_CONTEXT_CHARS)}…`;
    }
    return context;
  }

  // 新增：保存當前對話到歷史記錄
  private async saveCurrentChatToHistory(options?: { reason?: string; force?: boolean }): Promise<void> {
    if (this.messages.length === 0) return;
    if (!options?.force && !this.hasUnsavedChanges) return;

    const history = this.context.globalState.get<ChatHistoryEntry[]>('chatHistories') || [];
    const firstUserMsg = this.messages.find((m) => m.role === 'user' && m.text);
    const title = firstUserMsg?.text?.substring(0, 50) || 'Untitled Chat';
    const now = Date.now();
    const clonedMessages = this.cloneMessages(this.messages);
    const searchText = this.buildSearchText(clonedMessages);
    const tokenCounts = this.buildTokenCounts(searchText);
    const preview = this.buildHistoryPreview(clonedMessages);

    const existingIndex = history.findIndex((entry) => entry.id === this.currentChatId);
    const createdAt = existingIndex >= 0 ? history[existingIndex].createdAt : this.currentChatCreatedAt;
    
    // 生成任務 ID：找到現有最大的編號 +1（包含所有歷史記錄，確保全域唯一）
    let taskId: string;
    let agentName: string;
    let agentEmoji: string;
    if (existingIndex >= 0 && history[existingIndex].taskId) {
      // 已存在的任務保留原有 ID 和名稱
      taskId = history[existingIndex].taskId;
      agentName = history[existingIndex].agentName || this.currentAgentName || generateRandomName();
      agentEmoji = history[existingIndex].agentEmoji || this.currentAgentEmoji || getNameEmoji(agentName);
    } else {
      // 新任務：從所有歷史記錄中找到最大 ID
      const existingIds = history
        .map(h => h.taskId)
        .filter(id => id && id.startsWith('#'))
        .map(id => parseInt(id.slice(1), 10))
        .filter(n => !isNaN(n));
      // 同時考慮 globalState 中儲存的最大 ID 計數器
      const storedMaxId = this.context.globalState.get<number>('maxTaskId') || 0;
      const maxId = Math.max(storedMaxId, existingIds.length > 0 ? Math.max(...existingIds) : 0);
      const newId = maxId + 1;
      taskId = '#' + String(newId).padStart(4, '0');
      // 使用當前 session 的名稱，或生成新名稱
      agentName = this.currentAgentName || generateRandomName(this.getUsedAgentNames());
      agentEmoji = this.currentAgentEmoji || getNameEmoji(agentName);
      // 儲存新的最大 ID
      await this.context.globalState.update('maxTaskId', newId);
    }
    
    // 日期格式：YYYY/MM/DD HH:mm
    const dateObj = new Date(now);
    const dateStr = dateObj.toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' }) + 
      ' ' + dateObj.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false });
    
    const entry: ChatHistoryEntry = {
      id: this.currentChatId,
      taskId,
      agentName,
      agentEmoji,
      title,
      date: dateStr,
      messageCount: clonedMessages.length,
      messages: clonedMessages,
      createdAt,
      updatedAt: now,
      preview,
      searchText,
      tokenCounts
    };

    if (existingIndex >= 0) {
      history.splice(existingIndex, 1);
    }
    history.unshift(entry);
    if (history.length > MAX_HISTORY_ITEMS) {
      history.length = MAX_HISTORY_ITEMS;
    }

    await this.context.globalState.update('chatHistories', history);
    this.hasUnsavedChanges = false;
  }

  // 新增：取得對話歷史記錄
  private async getChatHistories(query?: string): Promise<any[]> {
    const history = await this.ensureHistoryIndex(
      this.context.globalState.get<ChatHistoryEntry[]>('chatHistories') || []
    );
    const trimmedQuery = typeof query === 'string' ? query.trim() : '';
    if (!trimmedQuery) {
      return history.map((entry) => ({
        id: entry.id,
        taskId: entry.taskId || '#????', // 正常情況不應走到這，taskId 應該在儲存時已生成
        agentName: entry.agentName || '',
        agentEmoji: entry.agentEmoji || '👾',
        title: entry.title,
        date: entry.date,
        messageCount: entry.messageCount,
        preview: entry.preview || ''
      }));
    }

    const normalizedQuery = this.normalizeText(trimmedQuery);
    const tokens = this.tokenize(normalizedQuery);
    const results = history
      .map((entry) => {
        const { score, matchCount } = this.scoreHistory(entry, tokens, normalizedQuery);
        return { entry, score, matchCount };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => {
        const timeA = a.entry.updatedAt || a.entry.createdAt || 0;
        const timeB = b.entry.updatedAt || b.entry.createdAt || 0;
        return b.score - a.score || timeB - timeA;
      });

    return results.map(({ entry, matchCount }) => ({
      id: entry.id,
      taskId: entry.taskId || '',
      agentName: entry.agentName || '',
      agentEmoji: entry.agentEmoji || '👾',
      title: entry.title,
      date: entry.date,
      messageCount: entry.messageCount,
      preview: entry.preview || '',
      matchCount
    }));
  }

  // 取得歷史記錄，並合併當前活動的任務（標記執行中的任務）
  private async getChatHistoriesWithActiveTasks(query?: string): Promise<any[]> {
    const history = await this.ensureHistoryIndex(
      this.context.globalState.get<ChatHistoryEntry[]>('chatHistories') || []
    );
    const trimmedQuery = typeof query === 'string' ? query.trim() : '';
    
    // 將活動任務轉換為歷史格式
    const activeTasks: any[] = [];
    for (const task of this.tasks.values()) {
      if (task.messages.length === 0 && !task.displayTaskId && !task.displayTitle) continue; // 跳過空任務（除非是外部注入的任務）
      
      const firstUserMsg = task.messages.find((m) => m.role === 'user' && m.text);
      const title = task.displayTitle || firstUserMsg?.text?.substring(0, 50) || 'New Task';
      const dateObj = new Date(task.createdAt);
      const dateStr = dateObj.toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' }) + 
        ' ' + dateObj.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false });
      
	      activeTasks.push({
	        id: task.chatId,
	        taskId: task.displayTaskId || '#LIVE', // 特殊標記：活動中的任務
	        agentName: task.agentName,
	        agentEmoji: task.agentEmoji,
	        modelId: task.modelId || '',
	        modelName: task.modelName || '',
	        reasoningEffort: task.reasoningEffort || '',
	        personaTitle: task.personaTitle || '',
	        mode: task.mode,
	        taskFolder: task.taskFolder || '',
	        title,
	        date: dateStr,
	        messageCount: task.messages.length,
	        preview: '',
	        isActive: true,
	        isBusy: task.busy,
	        isWaiting: task.pendingConfirmations.size > 0 || task.pendingChoices.size > 0
	      });
    }
    
    // 過濾掉已在活動任務中的歷史記錄
    const activeIds = new Set(activeTasks.map(t => t.id));
    const filteredHistory = history.filter(h => !activeIds.has(h.id));
    
    if (!trimmedQuery) {
      // 活動任務排在最前面
	      const historyItems = filteredHistory.map((entry) => ({
	        id: entry.id,
	        taskId: entry.taskId || '#????',
	        agentName: entry.agentName || '',
	        agentEmoji: entry.agentEmoji || '👾',
	        modelId: entry.modelId || '',
	        modelName: entry.modelName || '',
	        reasoningEffort: entry.reasoningEffort || '',
	        personaTitle: entry.personaTitle || '',
	        title: entry.title,
	        date: entry.date,
	        messageCount: entry.messageCount,
	        preview: entry.preview || '',
	        isActive: false,
	        isBusy: false,
	        isWaiting: false
	      }));
      return [...activeTasks, ...historyItems];
    }

    // 有搜尋詞時，搜尋活動任務和歷史記錄
    const normalizedQuery = this.normalizeText(trimmedQuery);
    const tokens = this.tokenize(normalizedQuery);
    
    // 簡單搜尋活動任務
    const matchedActiveTasks = activeTasks.filter(t => 
      t.title.toLowerCase().includes(trimmedQuery.toLowerCase()) ||
      t.agentName.toLowerCase().includes(trimmedQuery.toLowerCase())
    );
    
    // 搜尋歷史記錄
    const results = filteredHistory
      .map((entry) => {
        const { score, matchCount } = this.scoreHistory(entry, tokens, normalizedQuery);
        return { entry, score, matchCount };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => {
        const timeA = a.entry.updatedAt || a.entry.createdAt || 0;
        const timeB = b.entry.updatedAt || b.entry.createdAt || 0;
        return b.score - a.score || timeB - timeA;
      });

	    const historyItems = results.map(({ entry, matchCount }) => ({
	      id: entry.id,
	      taskId: entry.taskId || '',
	      agentName: entry.agentName || '',
	      agentEmoji: entry.agentEmoji || '👾',
	      modelId: entry.modelId || '',
	      modelName: entry.modelName || '',
	      reasoningEffort: entry.reasoningEffort || '',
	      personaTitle: entry.personaTitle || '',
	      title: entry.title,
	      date: entry.date,
	      messageCount: entry.messageCount,
	      preview: entry.preview || '',
	      isActive: false,
      isBusy: false,
      isWaiting: false,
      matchCount
    }));
    
    return [...matchedActiveTasks, ...historyItems];
  }

  private async getTaskDetails(id: string): Promise<any | undefined> {
    const task = this.tasks.get(id);
    if (task) {
      const firstUserMsg = task.messages.find((m) => m.role === 'user' && m.text);
      const title = task.displayTitle || firstUserMsg?.text?.substring(0, 50) || 'New Task';
      const dateObj = new Date(task.createdAt);
      const dateStr =
        dateObj.toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' }) +
        ' ' +
        dateObj.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false });
      return {
        id: task.chatId,
        taskId: task.displayTaskId || '#LIVE',
        title,
        date: dateStr,
        agentName: task.agentName,
        agentEmoji: task.agentEmoji,
        modelId: task.modelId || '',
        modelName: task.modelName || '',
        reasoningEffort: task.reasoningEffort || '',
        personaTitle: task.personaTitle || '',
        hasPersona: Boolean(task.hasPersona),
        hasInstructions: Boolean(task.hasInstructions),
        mode: task.mode,
        taskFolder: task.taskFolder || '',
        messageCount: task.messages.length,
        requestCount: task.requestCount,
        isActive: true,
        isBusy: task.busy,
        isWaiting: task.pendingConfirmations.size > 0 || task.pendingChoices.size > 0,
      };
    }

    const history = await this.ensureHistoryIndex(
      this.context.globalState.get<ChatHistoryEntry[]>('chatHistories') || []
    );
    const entry = history.find((h) => h.id === id);
    if (!entry) return undefined;

    return {
      id: entry.id,
      taskId: entry.taskId || '',
      title: entry.title,
      date: entry.date,
      agentName: entry.agentName || '',
      agentEmoji: entry.agentEmoji || '👾',
      modelId: entry.modelId || '',
      modelName: entry.modelName || '',
      reasoningEffort: entry.reasoningEffort || '',
      personaTitle: entry.personaTitle || '',
      hasPersona: Boolean(entry.personaTitle),
      hasInstructions: false,
      mode: '',
      taskFolder: '',
      messageCount: entry.messageCount,
      requestCount: 0,
      isActive: false,
      isBusy: false,
      isWaiting: false,
    };
  }

  // 保存指定任務到歷史記錄
  private async saveTaskToHistory(task: TaskState, options?: { reason?: string; force?: boolean }): Promise<void> {
    if (task.messages.length === 0) return;
    if (!options?.force && !task.hasUnsavedChanges) return;

    const history = this.context.globalState.get<ChatHistoryEntry[]>('chatHistories') || [];
    const firstUserMsg = task.messages.find((m) => m.role === 'user' && m.text);
    const title = firstUserMsg?.text?.substring(0, 50) || 'Untitled Chat';
    const now = Date.now();
    const clonedMessages = this.cloneMessages(task.messages);
    const searchText = this.buildSearchText(clonedMessages);
    const tokenCounts = this.buildTokenCounts(searchText);
    const preview = this.buildHistoryPreview(clonedMessages);

    const existingIndex = history.findIndex((entry) => entry.id === task.chatId);
    const createdAt = existingIndex >= 0 ? history[existingIndex].createdAt : task.createdAt;
    
    let taskId: string;
    let agentName = task.agentName;
    let agentEmoji = task.agentEmoji;
    
    if (existingIndex >= 0 && history[existingIndex].taskId) {
      taskId = history[existingIndex].taskId;
    } else {
      const existingIds = history
        .map(h => h.taskId)
        .filter(id => id && id.startsWith('#'))
        .map(id => parseInt(id.slice(1), 10))
        .filter(n => !isNaN(n));
      const storedMaxId = this.context.globalState.get<number>('maxTaskId') || 0;
      const maxId = Math.max(storedMaxId, existingIds.length > 0 ? Math.max(...existingIds) : 0);
      const newId = maxId + 1;
      taskId = '#' + String(newId).padStart(4, '0');
      await this.context.globalState.update('maxTaskId', newId);
    }
    
    const dateObj = new Date(now);
    const dateStr = dateObj.toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' }) + 
      ' ' + dateObj.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false });
    
	    const entry: ChatHistoryEntry = {
	      id: task.chatId,
	      taskId,
	      agentName,
	      agentEmoji,
	      modelId: task.modelId,
	      modelName: task.modelName,
	      reasoningEffort: task.reasoningEffort,
	      personaTitle: task.personaTitle,
	      title,
	      date: dateStr,
	      messageCount: clonedMessages.length,
	      messages: clonedMessages,
	      createdAt,
      updatedAt: now,
      preview,
      searchText,
      tokenCounts
    };

    if (existingIndex >= 0) {
      history.splice(existingIndex, 1);
    }
    history.unshift(entry);
    if (history.length > MAX_HISTORY_ITEMS) {
      history.length = MAX_HISTORY_ITEMS;
    }

    await this.context.globalState.update('chatHistories', history);
    task.hasUnsavedChanges = false;
  }

  // 新增：載入歷史對話（或切換到活動任務）
  private async loadChatHistory(id: string): Promise<void> {
    // 首先檢查是否是當前活動的任務
    if (this.tasks.has(id)) {
      // 切換到該活動任務（不中斷任何任務！）
      this.switchToTask(id);
      const task = this.tasks.get(id)!;
      const agentDisplay = task.agentEmoji && task.agentName 
        ? `${task.agentEmoji} ${task.agentName}` 
        : 'Task';
      // 如果該任務正在執行，顯示狀態
      if (task.busy) {
        this.broadcast({ type: 'toast', text: `🔄 ${agentDisplay} 正在執行中...` });
      } else {
        this.broadcast({ type: 'toast', text: `📋 切換到 ${agentDisplay}` });
      }
      return;
    }
    
    // 從歷史記錄中載入
    const history = await this.ensureHistoryIndex(
      this.context.globalState.get<ChatHistoryEntry[]>('chatHistories') || []
    );
    const chat = history.find((entry) => entry.id === id);
    
    if (chat && chat.messages) {
      // 保存當前任務（如果有內容）
      if (this.currentTask.messages.length > 0) {
        await this.saveCurrentChatToHistory();
      }
      
      // 從歷史創建新的活動任務
      const task = createTaskState(
        chat.id,
        chat.agentName || generateRandomName(this.getUsedAgentNames()),
        chat.agentEmoji || '👾'
      );
      task.messages.push(...chat.messages);
      task.createdAt = chat.createdAt;
      
      // 加入活動任務列表
      this.tasks.set(chat.id, task);
      this.activeChatId = chat.id;
      
      // 更新 UI
      this.broadcast({ type: 'history', messages: task.messages });
      this.broadcast({ type: 'busy', value: false });
      const agentDisplay = task.agentEmoji && task.agentName 
        ? `${task.agentEmoji} ${task.agentName}` 
        : chat.title;
      this.broadcast({ type: 'toast', text: `📋 Loaded: ${agentDisplay}` });
      this.broadcast({ type: 'agentInfo', name: task.agentName, emoji: task.agentEmoji, requestCount: task.requestCount });
    }
  }

  // 新增：匯出對話
  private async exportChat(): Promise<void> {
    if (this.messages.length === 0) {
      this.broadcast({ type: 'toast', text: 'No messages to export' });
      return;
    }
    
    const content = this.messages.map(m => {
      const role = m.role === 'user' ? '👤 You' : m.role === 'assistant' ? '🔵 BlueMonster' : 'ℹ️ System';
      const time = m.ts ? new Date(m.ts).toLocaleString() : '';
      return `## ${role} ${time}\n\n${m.text || '[Image]'}\n`;
    }).join('\n---\n\n');
    
    const doc = await vscode.workspace.openTextDocument({
      content: `# BlueMonster Chat Export\n\nExported: ${new Date().toLocaleString()}\n\n---\n\n${content}`,
      language: 'markdown'
    });
    await vscode.window.showTextDocument(doc);
    this.broadcast({ type: 'toast', text: '✓ Chat exported' });
  }

  // 新增：在游標位置插入程式碼
  private async insertCodeAtCursor(code: string): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      this.broadcast({ type: 'toast', text: 'No active editor' });
      return;
    }
    
    await editor.edit(editBuilder => {
      editBuilder.insert(editor.selection.active, code);
    });
  }
}

class McpManager {
  private readonly output = vscode.window.createOutputChannel('BlueMonster MCP');
  private readonly processes = new Map<string, ChildProcess>();

  startAll(servers: McpServerConfig[]): void {
    servers.forEach((server) => {
      if (server.enabled === false) {
        return;
      }
      if (server.autostart === false) {
        return;
      }
      this.start(server);
    });
  }

  start(server: McpServerConfig): void {
    if (this.processes.has(server.name)) {
      this.output.appendLine(`[${server.name}] already running`);
      return;
    }
    if (!server.command) {
      this.output.appendLine(`[${server.name}] missing command`);
      return;
    }
    const child = spawn(server.command, server.args || [], {
      env: { ...process.env, ...(server.env || {}) },
      stdio: ['pipe', 'pipe', 'pipe']
    });
    this.processes.set(server.name, child);
    this.output.appendLine(`[${server.name}] started: ${server.command} ${(server.args || []).join(' ')}`);

    child.stdout?.on('data', (data) => {
      this.output.appendLine(`[${server.name}] ${data.toString().trim()}`);
    });
    child.stderr?.on('data', (data) => {
      this.output.appendLine(`[${server.name}][err] ${data.toString().trim()}`);
    });
    child.on('exit', (code) => {
      this.output.appendLine(`[${server.name}] exited with code ${code ?? 'unknown'}`);
      this.processes.delete(server.name);
    });
    child.on('error', (err) => {
      this.output.appendLine(`[${server.name}] error: ${err.message}`);
    });
  }

  stopAll(): void {
    for (const name of this.processes.keys()) {
      this.stop(name);
    }
  }

  stop(name: string): void {
    const proc = this.processes.get(name);
    if (!proc) {
      this.output.appendLine(`[${name}] not running`);
      return;
    }
    proc.kill('SIGTERM');
    this.output.appendLine(`[${name}] stopped`);
    this.processes.delete(name);
  }

  dispose(): void {
    this.stopAll();
    this.output.dispose();
  }
}

class BlueMonsterViewProvider implements vscode.WebviewViewProvider {
  private readonly session: BlueMonsterSession;
  private readonly context: vscode.ExtensionContext;

  constructor(session: BlueMonsterSession, context: vscode.ExtensionContext) {
    this.session = session;
    this.context = context;
  }

  resolveWebviewView(view: vscode.WebviewView) {
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, 'resources'),
        this.context.extensionUri
      ]
    };

    view.webview.html = getWebviewHtml(view.webview, this.context.extensionUri);
    this.session.addView(view.webview);

    view.webview.onDidReceiveMessage((message) => this.session.handleMessage(message));
    view.onDidDispose(async () => await this.session.removeView(view.webview));
  }

}

class BlueMonsterPanel {
  private static currentPanel: BlueMonsterPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private readonly session: BlueMonsterSession;
  private readonly context: vscode.ExtensionContext;

  private constructor(panel: vscode.WebviewPanel, session: BlueMonsterSession, context: vscode.ExtensionContext) {
    this.panel = panel;
    this.session = session;
    this.context = context;

    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, 'resources'),
        this.context.extensionUri
      ]
    };

    panel.webview.html = getWebviewHtml(panel.webview, this.context.extensionUri);
    session.addView(panel.webview);

    panel.webview.onDidReceiveMessage((message) => session.handleMessage(message));
    panel.onDidDispose(async () => {
      await session.removeView(panel.webview);
      BlueMonsterPanel.currentPanel = undefined;
    });
  }

  static show(session: BlueMonsterSession, context: vscode.ExtensionContext) {
    if (BlueMonsterPanel.currentPanel) {
      BlueMonsterPanel.currentPanel.panel.reveal();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'blueMonster.panel',
      'BlueMonster',
      vscode.ViewColumn.Beside,
      {}
    );
    BlueMonsterPanel.currentPanel = new BlueMonsterPanel(panel, session, context);
  }
}

export async function activate(context: vscode.ExtensionContext) {
  const session = new BlueMonsterSession(context);
  const mcpManager = new McpManager();
  const config = getConfig();
  console.log('[BlueMonster] Running in SDK-only mode (CLI backend removed).');

  // CLI backend 已移除：提示使用者並自動遷移 reasoning 設定
  const legacyBackend = (config.get<string>('backend') || '').toLowerCase();
  if (legacyBackend === 'cli') {
    vscode.window.showWarningMessage('BlueMonster: CLI backend 已移除，將改用 Copilot SDK。請移除 blueMonster.backend 設定。');
  }
  const legacyReasoning = config.get<string>('cliReasoningEffort');
  const currentReasoning = config.get<string>('reasoningEffort');
  if (!currentReasoning && legacyReasoning) {
    await config.update('reasoningEffort', legacyReasoning, vscode.ConfigurationTarget.Global);
  }

  if (getMcpAutoStart()) {
    const servers = getMcpServers();
    if (servers.length > 0) {
      mcpManager.startAll(servers);
    }
  }

  const toolDisposable = vscode.lm?.registerTool<RunInTerminalInput>(TOOL_NAME, {
    prepareInvocation(options) {
      const input = normalizeToolInput(options.input as object);
      const command = input?.command || '<unknown>';
      const cwdLabel = input?.cwd ? `\nWorking dir: ${input.cwd}` : '';
      return {
        invocationMessage: `Running: ${command}`,
        confirmationMessages: {
          title: 'Run terminal command',
          message: `Run the following command?\n\n${command}${cwdLabel}`
        }
      };
    },
    async invoke(options) {
      const input = normalizeToolInput(options.input as object);
      if (!input) {
        return new vscode.LanguageModelToolResult([
          new vscode.LanguageModelTextPart('No command provided.')
        ]);
      }

      const terminal = getTerminal(input.cwd);
      terminal.show();
      terminal.sendText(input.command, true);

      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(
          `Command sent to terminal: ${input.command}${input.cwd ? ` (cwd: ${input.cwd})` : ''}`
        )
      ]);
    }
  });

  if (toolDisposable) {
    context.subscriptions.push(toolDisposable);
  }

  const vsCommandDisposable = vscode.lm?.registerTool<VsCodeCommandInput>(VS_COMMAND_TOOL_NAME, {
    prepareInvocation(options) {
      const input = normalizeVsCodeCommandInput(options.input as object);
      const command = input?.command || '<unknown>';
      return {
        invocationMessage: `Executing: ${command}`,
        confirmationMessages: {
          title: 'Execute VS Code command',
          message: `Execute the following VS Code command?\n\n${command}`
        }
      };
    },
    async invoke(options) {
      const input = normalizeVsCodeCommandInput(options.input as object);
      if (!input) {
        return new vscode.LanguageModelToolResult([
          new vscode.LanguageModelTextPart('No command provided.')
        ]);
      }
      const text = await session.runVsCodeCommandWithResult(input.command, input.args);
      return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(text)]);
    }
  });

  if (vsCommandDisposable) {
    context.subscriptions.push(vsCommandDisposable);
  }

  const readFileDisposable = vscode.lm?.registerTool<ReadFileInput>(READ_FILE_TOOL_NAME, {
    prepareInvocation(options) {
      const input = normalizeReadFileInput(options.input as object);
      const path = input?.path || '<unknown>';
      return {
        invocationMessage: `Reading: ${path}`,
        confirmationMessages: {
          title: 'Read file',
          message: `Read the following file?\n\n${path}`
        }
      };
    },
    async invoke(options) {
      const input = normalizeReadFileInput(options.input as object);
      if (!input) {
        return new vscode.LanguageModelToolResult([
          new vscode.LanguageModelTextPart('No path provided.')
        ]);
      }
      const text = await session.readFileWithResult(input.path);
      return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(text)]);
    }
  });

  if (readFileDisposable) {
    context.subscriptions.push(readFileDisposable);
  }

  const writeFileDisposable = vscode.lm?.registerTool<WriteFileInput>(WRITE_FILE_TOOL_NAME, {
    prepareInvocation(options) {
      const input = normalizeWriteFileInput(options.input as object);
      const path = input?.path || '<unknown>';
      return {
        invocationMessage: `Writing: ${path}`,
        confirmationMessages: {
          title: 'Write file',
          message: `Write to the following file?\n\n${path}`
        }
      };
    },
    async invoke(options) {
      const input = normalizeWriteFileInput(options.input as object);
      if (!input) {
        return new vscode.LanguageModelToolResult([
          new vscode.LanguageModelTextPart('No path/content provided.')
        ]);
      }
      const text = await session.writeFileWithResult(input.path, input.content);
      return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(text)]);
    }
  });

  if (writeFileDisposable) {
    context.subscriptions.push(writeFileDisposable);
  }

  const openFileDisposable = vscode.lm?.registerTool<OpenFileInput>(OPEN_FILE_TOOL_NAME, {
    prepareInvocation(options) {
      const input = normalizeOpenFileInput(options.input as object);
      const path = input?.path || '<unknown>';
      return {
        invocationMessage: `Opening: ${path}`,
        confirmationMessages: {
          title: 'Open file',
          message: `Open the following file?\n\n${path}`
        }
      };
    },
    async invoke(options) {
      const input = normalizeOpenFileInput(options.input as object);
      if (!input) {
        return new vscode.LanguageModelToolResult([
          new vscode.LanguageModelTextPart('No path provided.')
        ]);
      }
      const text = await session.openFileWithResult(input.path, input.preview);
      return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(text)]);
    }
  });

  if (openFileDisposable) {
    context.subscriptions.push(openFileDisposable);
  }

  const switchWindowDisposable = vscode.lm?.registerTool(SWITCH_WINDOW_TOOL_NAME, {
    prepareInvocation() {
      return {
        invocationMessage: 'Switching window',
        confirmationMessages: {
          title: 'Switch window',
          message: 'Open the VS Code window switcher?'
        }
      };
    },
    async invoke() {
      const text = await session.switchWindowWithResult();
      return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(text)]);
    }
  });

  if (switchWindowDisposable) {
    context.subscriptions.push(switchWindowDisposable);
  }

  const provider = new BlueMonsterViewProvider(session, context);
  context.subscriptions.push(vscode.window.registerWebviewViewProvider(VIEW_ID, provider));

  context.subscriptions.push(
    vscode.commands.registerCommand('blueMonster.openView', async () => {
      await vscode.commands.executeCommand('workbench.view.extension.blueMonster');
    }),
    vscode.commands.registerCommand('blueMonster.openPanel', () => BlueMonsterPanel.show(session, context)),
    vscode.commands.registerCommand('blueMonster.clearHistory', () => session.clearHistory()),
    vscode.commands.registerCommand('blueMonster.selectModel', () => session.selectModel()),
    vscode.commands.registerCommand('blueMonster.setModel', (modelId: string) => session.setModel(modelId)),
    vscode.commands.registerCommand('blueMonster.setMode', (mode: string) => session.setMode(mode)),
    vscode.commands.registerCommand('blueMonster.listModels', () => session.listModels()),
    // 外部 API 命令（供 Gateway/LINE 使用）
    vscode.commands.registerCommand('blueMonster.getStatus', () => session.getStatus()),
    vscode.commands.registerCommand('blueMonster.getPendingConfirmations', () => session.getPendingConfirmations()),
    vscode.commands.registerCommand('blueMonster.respondToConfirmation', 
      (id: string, action: 'run' | 'sessionAllow' | 'projectAllow' | 'cancel' | 'custom', customText?: string) => 
        session.respondToConfirmation(id, action, customText)
    ),
    vscode.commands.registerCommand('blueMonster.sendMessage', 
      (text: string, mode?: 'chat' | 'agent' | 'agent-full') => session.sendMessage(text, mode)
    ),
    vscode.commands.registerCommand('blueMonster.sendMessageExternal',
      (text: string, mode?: 'chat' | 'agent' | 'agent-full') => session.sendMessageExternal(text, mode)
    ),
    vscode.commands.registerCommand('blueMonster.addSystemNote',
      (text: string) => session.addSystemNote(text)
    ),
    vscode.commands.registerCommand('blueMonster.setTaskFolder',
      (folderPath: string) => session.setTaskFolder(folderPath)
    ),
    vscode.commands.registerCommand('blueMonster.createExternalTask',
      (externalTaskId: string, taskFolderPath: string, title?: string) => session.createExternalTask(externalTaskId, taskFolderPath, title)
    ),
    vscode.commands.registerCommand('blueMonster.mcp.startAll', () => {
      mcpManager.startAll(getMcpServers());
      vscode.window.showInformationMessage('BlueMonster MCP servers started.');
    }),
    vscode.commands.registerCommand('blueMonster.mcp.stopAll', () => {
      mcpManager.stopAll();
      vscode.window.showInformationMessage('BlueMonster MCP servers stopped.');
    })
  );

  context.subscriptions.push({
    dispose: () => mcpManager.dispose()
  });
}

export async function deactivate() {
  // 確保在 extension 停用時儲存歷史
  const session = BlueMonsterSession.getInstance();
  if (session) {
    await session.forceSaveHistory();
  }
  // 關閉 Copilot SDK 所有 Workers
  await geminiSDK.shutdown();
  disposeTerminal();
}
