import * as vscode from 'vscode';
import { exec as execCallback, spawn, ChildProcess } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';

const exec = promisify(execCallback);

const VIEW_ID = 'blueMonster.chatView';
const TOOL_NAME = 'blueMonster_runInTerminal';
const VS_COMMAND_TOOL_NAME = 'blueMonster_executeVsCodeCommand';
const READ_FILE_TOOL_NAME = 'blueMonster_readFile';
const WRITE_FILE_TOOL_NAME = 'blueMonster_writeFile';
const OPEN_FILE_TOOL_NAME = 'blueMonster_openFile';
const SWITCH_WINDOW_TOOL_NAME = 'blueMonster_switchWindow';
const SEARCH_TASKS_TOOL_NAME = 'blueMonster_searchTasks';
const CONFIG_SECTION = 'blueMonster';
const TERMINAL_NAME = 'BlueMonster';
const MAX_TOOL_TURNS = 8;  // 增加到 8 次以允許更多驗證迭代
const MAX_HISTORY_ITEMS = 100;
const MAX_HISTORY_TEXT_CHARS = 20000;
const MAX_MEMORY_MATCHES = 3;
const MAX_MEMORY_CONTEXT_CHARS = 1200;
const STOP_WORDS = new Set([
  'the',
  'and',
  'or',
  'but',
  'with',
  'to',
  'for',
  'of',
  'in',
  'on',
  'at',
  'a',
  'an',
  'is',
  'are',
  'was',
  'were',
  'be',
  'as',
  'by',
  'it',
  'this',
  'that',
  'these',
  'those'
]);

function countLineDiff(before: string, after: string): { added: number; removed: number } {
  const beforeLines = before ? before.split(/\r?\n/) : [];
  const afterLines = after ? after.split(/\r?\n/) : [];
  const maxMatrix = 4_000_000;
  if (beforeLines.length === 0 && afterLines.length === 0) {
    return { added: 0, removed: 0 };
  }
  if (beforeLines.length * afterLines.length > maxMatrix) {
    const added = Math.max(0, afterLines.length - beforeLines.length);
    const removed = Math.max(0, beforeLines.length - afterLines.length);
    return { added, removed };
  }
  const rows = beforeLines.length + 1;
  const cols = afterLines.length + 1;
  const dp = Array.from({ length: rows }, () => new Array(cols).fill(0));
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      if (beforeLines[i - 1] === afterLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  const lcs = dp[rows - 1][cols - 1];
  return {
    added: Math.max(0, afterLines.length - lcs),
    removed: Math.max(0, beforeLines.length - lcs)
  };
}

function extractHeredocWrite(command: string): { path: string; content: string } | undefined {
  const match = command.match(/cat\s*>\s*([^\s]+)\s*<<\s*['"]?([A-Za-z0-9_]+)['"]?\s*\r?\n([\s\S]*?)\r?\n\2\b/);
  if (!match) {
    return undefined;
  }
  return { path: match[1], content: match[3] };
}

function extractRedirectTarget(command: string): string | undefined {
  const match = command.match(/(?:^|\s)(?:>>?|2>|&>)\s*([^\s'"]+)/);
  return match ? match[1] : undefined;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const stat = await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
    return stat.size > 0;
  } catch {
    return false;
  }
}

type UiMessageKind = 'text' | 'thought' | 'image' | 'file';
type TerminalConfirmationMode = 'modal' | 'chat' | 'off';

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

interface McpServerConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  enabled?: boolean;
  autostart?: boolean;
}

interface ConfirmationResult {
  approved: boolean;
  remember?: boolean;
  sessionAllow?: string; // 這次 session 允許的危險類型
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

interface RunInTerminalInput {
  command: string;
  cwd?: string;
}

interface VsCodeCommandInput {
  command: string;
  args?: unknown[];
}

interface ReadFileInput {
  path: string;
}

interface WriteFileInput {
  path: string;
  content: string;
}

interface OpenFileInput {
  path: string;
  preview?: boolean;
}

let sharedTerminal: vscode.Terminal | undefined;
let sharedTerminalCwd: string | undefined;

function getConfig() {
  return vscode.workspace.getConfiguration(CONFIG_SECTION);
}

function getBackend(): 'lm' | 'cli' {
  const value = getConfig().get<string>('backend');
  return value === 'cli' ? 'cli' : 'lm';
}

function getCliCommand(): string {
  return (getConfig().get<string>('cliCommand') || '').trim();
}

function getCliCwd(): string | undefined {
  const cwd = (getConfig().get<string>('cliCwd') || '').trim();
  return cwd || undefined;
}

function getCliModel(): string {
  return (getConfig().get<string>('cliModel') || '').trim();
}

function getPreferredModelId(): string {
  return (getConfig().get<string>('model') || '').trim();
}

function getDangerModeEnabled(): boolean {
  return Boolean(getConfig().get<boolean>('dangerMode'));
}

function getMcpAutoStart(): boolean {
  return Boolean(getConfig().get<boolean>('mcpAutoStart'));
}

function getMcpServers(): McpServerConfig[] {
  const value = getConfig().get<McpServerConfig[]>('mcpServers');
  return Array.isArray(value) ? value : [];
}

function getTerminalConfirmationMode(): TerminalConfirmationMode {
  const value = (getConfig().get<string>('terminalConfirmation') || '').trim();
  if (value === 'modal' || value === 'chat' || value === 'off') {
    return value;
  }
  return 'chat';
}

// 安全模式設定讀取
interface SafeModeSettings {
  confirmDelete: boolean;
  confirmMove: boolean;
  confirmSudo: boolean;
  confirmNetwork: boolean;
  confirmDownload: boolean;
  confirmPackage: boolean;
  confirmGit: boolean;
  confirmDocker: boolean;
  confirmPermission: boolean;
  confirmKill: boolean;
  confirmSystem: boolean;
}

function getSafeModeSettings(): SafeModeSettings {
  const config = getConfig();
  return {
    confirmDelete: config.get<boolean>('safeMode.confirmDelete') ?? true,
    confirmMove: config.get<boolean>('safeMode.confirmMove') ?? true,
    confirmSudo: config.get<boolean>('safeMode.confirmSudo') ?? true,
    confirmNetwork: config.get<boolean>('safeMode.confirmNetwork') ?? true,
    confirmDownload: config.get<boolean>('safeMode.confirmDownload') ?? true,
    confirmPackage: config.get<boolean>('safeMode.confirmPackage') ?? true,
    confirmGit: config.get<boolean>('safeMode.confirmGit') ?? true,
    confirmDocker: config.get<boolean>('safeMode.confirmDocker') ?? true,
    confirmPermission: config.get<boolean>('safeMode.confirmPermission') ?? true,
    confirmKill: config.get<boolean>('safeMode.confirmKill') ?? true,
    confirmSystem: config.get<boolean>('safeMode.confirmSystem') ?? true,
  };
}

// 危險命令類型定義
type DangerCategory = 'delete' | 'move' | 'sudo' | 'network' | 'download' | 'package' | 'git' | 'docker' | 'permission' | 'kill' | 'system';

interface DangerInfo {
  category: DangerCategory;
  label: string;
  settingKey: keyof SafeModeSettings;
}

function detectDangerousCommand(command: string): DangerInfo | null {
  const lowerCmd = command.toLowerCase();
  
  // 刪除檔案
  if (lowerCmd.includes('rm ') || lowerCmd.includes('rm\t') || lowerCmd.includes('rmdir') || 
      lowerCmd.includes('unlink') || lowerCmd.includes('shred')) {
    return { category: 'delete', label: '🗑️ 刪除檔案', settingKey: 'confirmDelete' };
  }
  
  // 移動檔案
  if (lowerCmd.includes('mv ') || lowerCmd.includes('mv\t')) {
    return { category: 'move', label: '📁 移動檔案', settingKey: 'confirmMove' };
  }
  
  // 管理員權限
  if (lowerCmd.includes('sudo') || lowerCmd.includes('su ') || lowerCmd.includes('su\t')) {
    return { category: 'sudo', label: '🔐 管理員權限', settingKey: 'confirmSudo' };
  }
  
  // 遠端連線
  if (lowerCmd.includes('ssh') || lowerCmd.includes('scp') || lowerCmd.includes('rsync')) {
    return { category: 'network', label: '🌐 遠端連線', settingKey: 'confirmNetwork' };
  }
  
  // 網路下載
  if (lowerCmd.includes('curl') || lowerCmd.includes('wget')) {
    return { category: 'download', label: '⬇️ 網路下載', settingKey: 'confirmDownload' };
  }
  
  // 套件安裝
  if (lowerCmd.includes('npm ') || lowerCmd.includes('npm\t') || lowerCmd.includes('npx ') ||
      lowerCmd.includes('yarn ') || lowerCmd.includes('pnpm ') || 
      lowerCmd.includes('pip ') || lowerCmd.includes('pip3') ||
      lowerCmd.includes('brew ') || lowerCmd.includes('apt ') || lowerCmd.includes('apt-get') ||
      lowerCmd.includes('yum ') || lowerCmd.includes('dnf ') || lowerCmd.includes('pacman')) {
    return { category: 'package', label: '📦 套件安裝', settingKey: 'confirmPackage' };
  }
  
  // Git 操作
  if (lowerCmd.includes('git push') || lowerCmd.includes('git reset --hard') || 
      lowerCmd.includes('git clean') || lowerCmd.includes('git checkout -f')) {
    return { category: 'git', label: '📤 Git 操作', settingKey: 'confirmGit' };
  }
  
  // Docker 操作
  if (lowerCmd.includes('docker rm') || lowerCmd.includes('docker rmi') || 
      lowerCmd.includes('docker stop') || lowerCmd.includes('docker kill')) {
    return { category: 'docker', label: '🐳 Docker 操作', settingKey: 'confirmDocker' };
  }
  
  // 權限變更
  if (lowerCmd.includes('chmod') || lowerCmd.includes('chown') || lowerCmd.includes('chgrp')) {
    return { category: 'permission', label: '🔒 權限變更', settingKey: 'confirmPermission' };
  }
  
  // 終止進程
  if (lowerCmd.includes('kill ') || lowerCmd.includes('killall') || lowerCmd.includes('pkill')) {
    return { category: 'kill', label: '💀 終止進程', settingKey: 'confirmKill' };
  }
  
  // 系統操作
  if (lowerCmd.includes('reboot') || lowerCmd.includes('shutdown') || lowerCmd.includes('halt') ||
      lowerCmd.includes('poweroff') || lowerCmd.includes('mkfs') || lowerCmd.includes('fdisk') ||
      lowerCmd.includes('dd ') || lowerCmd.includes('eval ') || lowerCmd.includes('exec ') ||
      lowerCmd.includes('> /') || lowerCmd.includes('>> /')) {
    return { category: 'system', label: '⚡ 系統操作', settingKey: 'confirmSystem' };
  }
  
  return null;
}

function shouldConfirmCommand(command: string, settings: SafeModeSettings): { confirm: boolean; label: string; category: string } {
  const danger = detectDangerousCommand(command);
  if (!danger) {
    return { confirm: false, label: '', category: '' };
  }
  const confirm = settings[danger.settingKey];
  return { confirm, label: danger.label, category: danger.category };
}

async function setTerminalConfirmationMode(mode: TerminalConfirmationMode): Promise<void> {
  await getConfig().update('terminalConfirmation', mode, vscode.ConfigurationTarget.Global);
}

function escapeShellArg(value: string): string {
  if (value.length === 0) {
    return "''";
  }
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function buildCliCommand(template: string, prompt: string, model?: string): string {
  let command = template;
  if (model !== undefined) {
    command = command.split('{model}').join(escapeShellArg(model));
  }
  if (!command.includes('{prompt}')) {
    return `${command} ${escapeShellArg(prompt)}`;
  }
  return command.split('{prompt}').join(escapeShellArg(prompt));
}

function getTerminal(cwd?: string): vscode.Terminal {
  if (cwd && cwd !== sharedTerminalCwd) {
    sharedTerminal?.dispose();
    sharedTerminal = undefined;
    sharedTerminalCwd = undefined;
  }

  if (!sharedTerminal) {
    sharedTerminal = vscode.window.createTerminal({
      name: TERMINAL_NAME,
      cwd: cwd || undefined
    });
    sharedTerminalCwd = cwd;
  }

  return sharedTerminal;
}

function normalizeToolInput(input: object): RunInTerminalInput | undefined {
  if (!input || typeof input !== 'object') {
    return undefined;
  }
  const candidate = input as RunInTerminalInput;
  const command = typeof candidate.command === 'string' ? candidate.command.trim() : '';
  if (!command) {
    return undefined;
  }
  const cwd = typeof candidate.cwd === 'string' && candidate.cwd.trim() ? candidate.cwd.trim() : undefined;
  return { command, cwd };
}

function terminalToolDefinition(): vscode.LanguageModelChatTool {
  return {
    name: TOOL_NAME,
    description: 'Run a shell command in the VS Code integrated terminal',
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Shell command to run' },
        cwd: { type: 'string', description: 'Optional working directory (absolute path)' }
      },
      required: ['command']
    }
  };
}

function normalizeVsCodeCommandInput(input: object): VsCodeCommandInput | undefined {
  if (!input || typeof input !== 'object') {
    return undefined;
  }
  const candidate = input as VsCodeCommandInput;
  const command = typeof candidate.command === 'string' ? candidate.command.trim() : '';
  if (!command) {
    return undefined;
  }
  const args = Array.isArray(candidate.args) ? candidate.args : undefined;
  return { command, args };
}

function vsCodeCommandToolDefinition(): vscode.LanguageModelChatTool {
  return {
    name: VS_COMMAND_TOOL_NAME,
    description: 'Execute a VS Code command via the command registry',
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'VS Code command id' },
        args: { type: 'array', description: 'Optional arguments for the command', items: {} }
      },
      required: ['command']
    }
  };
}

function normalizeReadFileInput(input: object): ReadFileInput | undefined {
  if (!input || typeof input !== 'object') {
    return undefined;
  }
  const candidate = input as ReadFileInput;
  const path = typeof candidate.path === 'string' ? candidate.path.trim() : '';
  if (!path) {
    return undefined;
  }
  return { path };
}

function readFileToolDefinition(): vscode.LanguageModelChatTool {
  return {
    name: READ_FILE_TOOL_NAME,
    description: 'Read a file from disk',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute file path' }
      },
      required: ['path']
    }
  };
}

function normalizeWriteFileInput(input: object): WriteFileInput | undefined {
  if (!input || typeof input !== 'object') {
    return undefined;
  }
  const candidate = input as WriteFileInput;
  const path = typeof candidate.path === 'string' ? candidate.path.trim() : '';
  const content = typeof candidate.content === 'string' ? candidate.content : '';
  if (!path) {
    return undefined;
  }
  return { path, content };
}

function writeFileToolDefinition(): vscode.LanguageModelChatTool {
  return {
    name: WRITE_FILE_TOOL_NAME,
    description: 'Write a file to disk',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute file path' },
        content: { type: 'string', description: 'File content' }
      },
      required: ['path', 'content']
    }
  };
}

function normalizeOpenFileInput(input: object): OpenFileInput | undefined {
  if (!input || typeof input !== 'object') {
    return undefined;
  }
  const candidate = input as OpenFileInput;
  const path = typeof candidate.path === 'string' ? candidate.path.trim() : '';
  if (!path) {
    return undefined;
  }
  const preview = typeof candidate.preview === 'boolean' ? candidate.preview : undefined;
  return { path, preview };
}

function openFileToolDefinition(): vscode.LanguageModelChatTool {
  return {
    name: OPEN_FILE_TOOL_NAME,
    description: 'Open a file in VS Code',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute file path' },
        preview: { type: 'boolean', description: 'Open in preview mode (optional)' }
      },
      required: ['path']
    }
  };
}

function switchWindowToolDefinition(): vscode.LanguageModelChatTool {
  return {
    name: SWITCH_WINDOW_TOOL_NAME,
    description: 'Switch VS Code window (opens the window switcher)',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  };
}

interface SearchTasksInput {
  query: string;
}

function normalizeSearchTasksInput(input: object): SearchTasksInput | undefined {
  if (!input || typeof input !== 'object') {
    return undefined;
  }
  const candidate = input as SearchTasksInput;
  const query = typeof candidate.query === 'string' ? candidate.query.trim() : '';
  if (!query) {
    return undefined;
  }
  return { query };
}

function searchTasksToolDefinition(): vscode.LanguageModelChatTool {
  return {
    name: SEARCH_TASKS_TOOL_NAME,
    description: 'Search previous task history by keyword. Returns a list of matching tasks with taskId (e.g. #0001), title, date, and preview. Use this to find relevant past conversations.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search keyword or phrase to find matching tasks' }
      },
      required: ['query']
    }
  };
}

function getWebviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const nonce = Math.random().toString(36).slice(2);
  const blueMonsterWhSvgUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, '..', 'vscode-extension', 'resources', 'bluemonster', 'blueMonster_wh.svg')
  );
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>BlueMonster</title>
  <style>
    /* VS Code Native Style - Copilot Chat 風格 */
    :root {
      color-scheme: light dark;
    }
    * {
      box-sizing: border-box;
    }
    body {
      margin: 0;
      padding: 0;
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
      height: 100vh;
      display: flex;
      flex-direction: column;
    }
    
    /* Header - Copilot Chat 風格 */
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 10px;
      border-bottom: 1px solid var(--vscode-panel-border);
      background: var(--vscode-sideBar-background);
      flex-shrink: 0;
    }
    .header-left {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .header-title {
      font-weight: 600;
      font-size: 13px;
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .header-title .icon {
      font-size: 16px;
    }
    .header-right {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    /* 自定義選擇器 */
    .custom-select {
      position: relative;
      display: inline-block;
    }
    .custom-select-trigger {
      background: #3c3c3c;
      color: #cccccc;
      border: none;
      border-radius: 6px;
      padding: 5px 28px 5px 10px;
      font-size: 12px;
      cursor: pointer;
      min-width: 80px;
      display: flex;
      align-items: center;
      gap: 6px;
      white-space: nowrap;
      user-select: none;
    }
    .custom-select-trigger:hover {
      background: #4a4a4a;
    }
    .custom-select-trigger::after {
      content: '';
      position: absolute;
      right: 10px;
      top: 50%;
      transform: translateY(-50%);
      border: 4px solid transparent;
      border-top-color: #888;
    }
    .custom-select-trigger.open::after {
      border-top-color: transparent;
      border-bottom-color: #888;
      transform: translateY(-80%);
    }
    .custom-select-options {
      position: absolute;
      bottom: calc(100% + 4px);
      left: 0;
      min-width: 100%;
      background: #2d2d2d;
      border: 1px solid #454545;
      border-radius: 8px;
      box-shadow: 0 -4px 16px rgba(0,0,0,0.3);
      z-index: 1000;
      display: none;
      overflow: hidden;
    }
    .custom-select-options.show {
      display: block;
    }
    .custom-select-option {
      padding: 8px 12px;
      cursor: pointer;
      font-size: 12px;
      color: #cccccc;
      display: flex;
      align-items: center;
      gap: 8px;
      white-space: nowrap;
    }
    .custom-select-option:hover {
      background: #3c3c3c;
    }
    .custom-select-option.selected {
      color: #ffffff;
    }
    .custom-select-option.selected:hover {
      background: #3c3c3c;
    }
    .custom-select-option .check-mark {
      width: 16px;
      opacity: 0;
      color: #4fc3f7;
    }
    .custom-select-option.selected .check-mark {
      opacity: 1;
    }
    .select-pill {
      display: none;
    }
    .toolbar {
      display: flex;
      gap: 1px;
    }
    .toolbar button {
      background: transparent;
      color: var(--vscode-icon-foreground);
      border: none;
      padding: 4px 6px;
      cursor: pointer;
      border-radius: 4px;
      font-size: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      min-width: 26px;
      height: 26px;
    }
    .toolbar button:hover {
      background: var(--vscode-toolbar-hoverBackground);
    }
    .toolbar button.active {
      background: var(--vscode-toolbar-activeBackground);
    }
    .toolbar button:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
    .toolbar .divider {
      width: 1px;
      height: 16px;
      background: var(--vscode-panel-border);
      margin: 0 4px;
      align-self: center;
    }
    
    /* Messages */
    .messages {
      flex: 1;
      overflow-y: auto;
      padding: 8px 12px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      height: 100%;
    }
    .messages-wrap {
      position: relative;
      flex: 1;
      min-height: 0;
      overflow: hidden;
      z-index: 1;
    }
    .empty-state {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-direction: column;
      gap: 10px;
      opacity: 0.3;
      pointer-events: none;
      text-align: center;
    }
    .empty-state img {
      width: 48px;
      height: auto;
    }
    .message {
      display: flex;
      flex-direction: column;
      gap: 6px;
      position: relative;
    }
    .message-header {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .message-avatar {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      flex-shrink: 0;
    }
    .message-avatar img {
      width: 100%;
      height: 100%;
      display: block;
    }
    .message.user .message-avatar {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    .message.assistant .message-avatar {
      background: none;
      color: inherit;
    }
    .message.system .message-avatar {
      display: none;
    }
    .message-role {
      font-size: 12px;
      font-weight: 600;
    }
    .message-time {
      font-size: 10px;
      opacity: 0.5;
      margin-left: auto;
    }
    .message-content {
      padding-left: 32px;
      font-size: 13px;
      line-height: 1.6;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .message.user {
      align-items: flex-end;
    }
    .message.user .message-header {
      display: none;
    }
    .message.user .message-avatar {
      display: none;
    }
    .message.user .message-role {
      display: none;
    }
    .message.user .message-content {
      padding: 10px 12px;
      text-align: left;
      max-width: 100%;
      background: #2b3442;
      border-radius: 12px;
      align-self: flex-end;
    }
    .message.user .message-content:empty {
      display: none;
    }
    .message.system .message-header {
      display: none;
    }
    .message.system .message-role {
      display: none;
    }
    .message.system .message-content {
      padding-left: 0;
      font-size: 11px;
      opacity: 0.7;
    }
    .message.assistant .message-content {
      max-width: 90%;
    }
    .user-attachments {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 6px;
      justify-content: flex-end;
    }
    .user-attachment-chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 8px;
      border-radius: 8px;
      background: #2a2a2a;
      border: 1px solid #3a3a3a;
      font-size: 11px;
      color: #d7d7d7;
      max-width: 220px;
    }
    .user-attachment-chip svg {
      width: 14px;
      height: 14px;
      fill: currentColor;
    }
    .user-attachment-name {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    /* 可折疊步驟卡片 - Copilot 風格 */
    .activity-card {
      margin-left: 32px;
      margin-bottom: 8px;
      border-radius: 6px;
      border: 1px solid var(--vscode-panel-border);
      background: var(--vscode-editor-background);
      overflow: hidden;
    }
    .activity-card summary {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      cursor: pointer;
      user-select: none;
      font-size: 12px;
      color: var(--vscode-foreground);
      list-style: none;
    }
    .activity-card summary::-webkit-details-marker {
      display: none;
    }
    .activity-card summary::before {
      content: '▶';
      font-size: 8px;
      transition: transform 0.2s;
      color: var(--vscode-icon-foreground);
    }
    .activity-card[open] summary::before {
      transform: rotate(90deg);
    }
    .activity-card .card-icon {
      font-size: 14px;
    }
    .activity-card .card-icon.done {
      color: #89d185;
    }
    .activity-card .card-icon.working {
      color: var(--vscode-progressBar-background);
    }
    .activity-card .card-title {
      flex: 1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .activity-card .card-badge {
      display: inline-flex;
      gap: 4px;
      padding: 1px 6px;
      border-radius: 4px;
      background: var(--vscode-badge-background);
      font-size: 10px;
      font-family: var(--vscode-editor-font-family);
    }
    .activity-card .card-badge .plus {
      color: #89d185;
    }
    .activity-card .card-badge .minus {
      color: #f48771;
    }
    .activity-card .card-body {
      padding: 8px 12px;
      border-top: 1px solid var(--vscode-panel-border);
      font-size: 11px;
      background: var(--vscode-textCodeBlock-background);
      max-height: 200px;
      overflow-y: auto;
    }
    .activity-card .card-body pre {
      margin: 0;
      white-space: pre-wrap;
      word-break: break-all;
      font-family: var(--vscode-editor-font-family);
    }
    .activity-card .file-link {
      color: var(--vscode-textLink-foreground);
      cursor: pointer;
      text-decoration: underline;
    }
    .activity-card .file-link:hover {
      color: var(--vscode-textLink-activeForeground);
    }
    .activity-card .line-range {
      opacity: 0.7;
      font-size: 10px;
    }
    
    /* 舊的 activity 樣式保留相容性 */
    .assistant-activity {
      margin-left: 32px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .assistant-activity + .message-content {
      margin-top: 10px;
    }
    .activity-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
      font-size: 12px;
    }
    .activity-item {
      display: flex;
      align-items: center;
      gap: 8px;
      color: #c9c9c9;
    }
    .activity-check {
      color: #8dd39c;
      font-size: 12px;
    }
    .activity-file {
      display: flex;
      align-items: center;
      gap: 8px;
      color: #c9c9c9;
      font-size: 12px;
    }
    .file-badge {
      display: inline-flex;
      gap: 6px;
      align-items: center;
      padding: 2px 6px;
      border-radius: 6px;
      background: #1f1f1f;
      border: 1px solid #303030;
      font-family: var(--vscode-editor-font-family);
      font-size: 11px;
    }
    .file-badge .plus {
      color: #7bd88f;
    }
    .file-badge .minus {
      color: #f06c6c;
    }
    .command-row {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 6px 8px;
      border-radius: 8px;
      border: 1px solid #2f2f2f;
      background: #1b1b1b;
      font-family: var(--vscode-editor-font-family);
      font-size: 12px;
      color: #d8d8d8;
    }
    .command-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #64b5ff;
    }
    
    /* 訊息操作按鈕 - Copilot 風格 */
    .message-actions {
      display: none;
      gap: 2px;
      margin-left: 32px;
      margin-top: 4px;
    }
    .message.user .message-actions {
      margin-left: 0;
      margin-right: 6px;
      align-self: flex-end;
    }
    .message:hover .message-actions {
      display: flex;
    }
    .message-actions button {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      border: none;
      padding: 3px 8px;
      border-radius: 3px;
      font-size: 11px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .message-actions button:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }
    
    /* Code blocks - Copilot 風格 */
    .message-content code {
      background: var(--vscode-textCodeBlock-background);
      padding: 2px 5px;
      border-radius: 4px;
      font-family: var(--vscode-editor-font-family);
      font-size: 12px;
    }
    .code-block {
      position: relative;
      margin: 8px 0;
      border-radius: 6px;
      overflow: hidden;
      border: 1px solid var(--vscode-panel-border);
    }
    .code-block-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 4px 10px;
      background: var(--vscode-editor-background);
      border-bottom: 1px solid var(--vscode-panel-border);
    }
    /* code-block-lang 樣式已移至下方 */
    .code-block-actions {
      display: flex;
      gap: 4px;
    }
    .code-block-actions button {
      background: transparent;
      color: var(--vscode-icon-foreground);
      border: none;
      padding: 2px 6px;
      border-radius: 3px;
      font-size: 11px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 3px;
    }
    .code-block-actions button:hover {
      background: var(--vscode-toolbar-hoverBackground);
    }
    .code-block pre {
      margin: 0;
      padding: 10px 12px;
      background: var(--vscode-textCodeBlock-background);
      overflow-x: auto;
      font-size: 12px;
      line-height: 1.5;
      white-space: pre-wrap;
      word-wrap: break-word;
      word-break: break-all;
    }
    .code-block pre code {
      background: none;
      padding: 0;
      font-family: var(--vscode-editor-font-family);
      white-space: pre-wrap;
      word-wrap: break-word;
    }
    .code-block-lang {
      font-size: 10px;
      color: #888;
      opacity: 0.6;
      font-family: var(--vscode-editor-font-family);
      text-transform: lowercase;
    }
    
    /* Image in message - Copilot style attachment */
    .message-attachment {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      margin-left: 32px;
      padding: 6px 8px;
      border-radius: 6px;
      border: 1px solid var(--vscode-panel-border);
      background: var(--vscode-input-background);
      cursor: pointer;
      max-width: 240px;
      transition: background 0.2s, box-shadow 0.2s;
    }
    .message.user .message-attachment {
      margin-left: 0;
      margin-right: 6px;
      align-self: flex-end;
    }
    .message-attachment:hover {
      background: var(--vscode-list-hoverBackground);
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    }
    .message-image {
      width: 56px;
      height: 56px;
      border-radius: 4px;
      object-fit: cover;
      border: 1px solid var(--vscode-panel-border);
      flex-shrink: 0;
    }
    .attachment-text {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }
    .attachment-name {
      font-size: 11px;
      font-weight: 500;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .attachment-meta {
      font-size: 10px;
      opacity: 0.6;
    }
    
    /* Thought details */
    .message details.thought {
      margin-left: 32px;
      background: var(--vscode-textBlockQuote-background);
      border-left: 3px solid var(--vscode-charts-blue);
      border-radius: 0 4px 4px 0;
      padding: 8px 12px;
      margin-top: 6px;
    }
    .message details.thought summary {
      cursor: pointer;
      font-size: 12px;
      opacity: 0.8;
      user-select: none;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .message details.thought .thought-body {
      margin-top: 8px;
      font-size: 12px;
      opacity: 0.9;
      line-height: 1.5;
    }
    
    /* Panels */
    .panel {
      margin: 8px 12px;
      padding: 12px;
      background: var(--vscode-notifications-background);
      border: 1px solid var(--vscode-notifications-border);
      border-radius: 6px;
    }
    .panel-title {
      font-size: 13px;
      font-weight: 600;
      margin-bottom: 10px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .panel-body {
      font-family: var(--vscode-editor-font-family);
      font-size: 12px;
      white-space: pre-wrap;
      background: var(--vscode-textCodeBlock-background);
      padding: 8px 10px;
      border-radius: 4px;
      margin-bottom: 10px;
    }
    .panel-meta {
      font-size: 11px;
      opacity: 0.7;
      margin-bottom: 10px;
    }
    .panel-actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .panel-actions button {
      padding: 5px 12px;
      font-size: 12px;
      border-radius: 4px;
      cursor: pointer;
      border: none;
      font-weight: 500;
    }
    .btn-primary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    .btn-primary:hover {
      background: var(--vscode-button-hoverBackground);
    }
    .btn-secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    .btn-secondary:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }
    .btn-danger {
      background: var(--vscode-inputValidation-errorBackground);
      color: var(--vscode-inputValidation-errorForeground);
      border: 1px solid var(--vscode-inputValidation-errorBorder);
    }
    
    /* 確認選項樣式 - 程式碼區塊風格 */
    .confirm-panel-inline {
      margin: 8px 12px;
      border-radius: 12px;
      overflow: hidden;
      border: 1px solid var(--vscode-panel-border);
      background: var(--vscode-textCodeBlock-background);
    }
    .confirm-panel-inline .confirm-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 6px 12px;
      background: var(--vscode-editor-background);
      border-bottom: 1px solid var(--vscode-panel-border);
    }
    .confirm-panel-inline .confirm-title {
      font-size: 12px;
      font-weight: 500;
      color: #f48771;
    }
    .confirm-panel-inline .confirm-danger-type {
      font-size: 10px;
      color: #888;
      opacity: 0.8;
    }
    .confirm-panel-inline .confirm-command {
      padding: 10px 12px;
      font-family: var(--vscode-editor-font-family);
      font-size: 12px;
      line-height: 1.5;
      white-space: pre-wrap;
      word-wrap: break-word;
      border-bottom: 1px solid var(--vscode-panel-border);
    }
    .confirm-panel-inline .confirm-cwd {
      padding: 4px 12px;
      font-size: 11px;
      color: #888;
      border-bottom: 1px solid var(--vscode-panel-border);
    }
    .confirm-options {
      padding: 8px;
    }
    .confirm-option {
      padding: 8px 12px;
      margin: 4px 0;
      background: #2d2d2d;
      border-radius: 8px;
      cursor: pointer;
      display: flex;
      align-items: center;
      transition: background 0.15s ease;
      font-size: 13px;
    }
    .confirm-option:hover {
      background: #3c3c3c !important;
    }
    .confirm-option .option-num {
      color: #4fc3f7;
      margin-right: 8px;
      font-weight: 500;
    }
    .confirm-input-wrap {
      display: flex;
      gap: 8px;
      padding: 8px 12px;
      border-top: 1px solid var(--vscode-panel-border);
    }
    .confirm-input-wrap input {
      flex: 1;
      padding: 8px 12px;
      background: #1e1e1e;
      border: 1px solid #3c3c3c;
      border-radius: 8px;
      color: #fff;
      font-size: 13px;
      outline: none;
    }
    .confirm-input-wrap input:focus {
      border-color: var(--vscode-focusBorder) !important;
    }
    .confirm-input-wrap button {
      padding: 8px 16px;
      border-radius: 8px;
      background: #0078d4;
      color: #fff;
      border: none;
      cursor: pointer;
      font-weight: 500;
    }
    .confirm-input-wrap button:hover {
      background: #106ebe;
    }
    .confirm-hint {
      padding: 6px 12px;
      font-size: 11px;
      opacity: 0.6;
    }
    
    /* Thinking panel - 改進動畫 */
    .thinking-panel {
      margin: 8px 12px;
      padding: 10px 12px;
      background: var(--vscode-textBlockQuote-background);
      border-left: 3px solid var(--vscode-progressBar-background);
      border-radius: 0 4px 4px 0;
      font-size: 12px;
    }
    .thinking-header {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 500;
    }
    .thinking-body {
      margin-top: 6px;
      font-size: 11px;
      opacity: 0.8;
      white-space: pre-wrap;
      max-height: 120px;
      overflow-y: auto;
    }
    .spinner {
      width: 14px;
      height: 14px;
      border: 2px solid var(--vscode-progressBar-background);
      border-top-color: transparent;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    
    /* 任務清單面板 - 全寬樣式 */
    .history-panel {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      width: 100%;
      height: 100%;
      background: var(--vscode-sideBar-background);
      z-index: 100;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    .history-panel[hidden] {
      display: none !important;
    }
    .history-search {
      padding: 12px 12px 8px 12px;
      flex-shrink: 0;
    }
    .history-search input {
      width: 100%;
      padding: 8px 12px;
      font-size: 13px;
      background: transparent;
      color: var(--vscode-input-foreground);
      border: none;
      outline: none;
    }
    .history-search input::placeholder {
      color: var(--vscode-input-placeholderForeground);
      opacity: 0.6;
    }
    .history-search input:focus {
      border: none;
      outline: none;
      box-shadow: none;
    }
    .history-header {
      padding: 4px 12px 8px 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-shrink: 0;
    }
    .history-header span {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      opacity: 0.7;
      font-weight: 400;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .history-header button {
      display: none;
    }
    .history-list {
      flex: 1;
      overflow-y: auto;
      padding: 0 4px;
    }
    .history-item {
      padding: 10px 12px;
      cursor: pointer;
      border-radius: 6px;
      margin: 2px 0;
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
    }
    .history-item:hover {
      background: var(--vscode-list-hoverBackground);
    }
    .history-item-icon {
      width: 32px;
      height: 32px;
      border-radius: 6px;
      flex-shrink: 0;
      object-fit: cover;
    }
    .history-item-content {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .history-item-header {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .history-item-taskid {
      font-size: 11px;
      color: var(--vscode-textLink-foreground);
      font-family: monospace;
      flex-shrink: 0;
      background: var(--vscode-badge-background);
      padding: 2px 6px;
      border-radius: 4px;
      font-weight: 500;
    }
    .history-item-title {
      font-size: 13px;
      font-weight: 400;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      flex: 1;
    }
    .history-item-meta {
      display: none;
    }
    .history-item-time {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      opacity: 0.6;
      white-space: nowrap;
      flex-shrink: 0;
    }
    .history-item-preview {
      display: none;
    }
    .history-empty {
      padding: 20px;
      text-align: center;
      font-size: 12px;
      opacity: 0.5;
    }
    .history-panel-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 8px 0 8px;
      flex-shrink: 0;
    }
    .history-panel-header .icon-btn {
      padding: 6px;
    }
    .history-panel-title {
      font-size: 14px;
      font-weight: 500;
    }
    .back-btn {
      padding: 4px;
    }
    .back-btn[hidden] {
      display: none !important;
    }
    .header-title {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    
    /* Input area - Refined Copilot Style */
    .input-area {
      padding: 10px 12px;
      background: var(--vscode-sideBar-background);
      border-top: 1px solid var(--vscode-panel-border);
      flex-shrink: 0;
      position: sticky;
      bottom: 0;
      z-index: 2;
    }
    
    .input-container {
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border);
      border-radius: 8px;
      padding: 8px 10px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    @media (max-width: 300px) {
      .input-footer-toolbar .select-pill {
        display: none;
      }
    }
    
    .input-container:focus-within {
      border-color: var(--vscode-focusBorder);
      outline: 1px solid var(--vscode-focusBorder);
    }
    
    .attachment-area {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    
    .attachment-chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: #3c3c3c; /* Dark gray match */
      color: #cccccc;
      padding: 4px 8px;
      border-radius: 6px;
      font-size: 11px;
      user-select: none;
      border: 1px solid #454545;
    }
    
    .attachment-chip .chip-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0.8;
    }
    .attachment-chip .chip-thumb {
      width: 16px;
      height: 16px;
      border-radius: 3px;
      object-fit: cover;
      border: 1px solid #555555;
    }
    
    .attachment-chip .chip-name {
      max-width: 120px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    
    .attachment-chip .chip-remove {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 14px;
      height: 14px;
      margin-left: 2px;
      border-radius: 50%;
      background: #cccccc;
      color: #333333;
      cursor: pointer;
      font-size: 12px;
      font-weight: bold;
      border: none;
      padding: 0;
      line-height: 1;
    }
    .attachment-chip .chip-remove:hover {
      background: #ffffff;
    }

    .input-wrapper {
      position: relative;
    }
    
    .input-textarea {
      width: 100%;
      min-height: 24px;
      max-height: 200px;
      padding: 4px 0;
      font-family: var(--vscode-font-family);
      font-size: 13px;
      background: transparent;
      color: var(--vscode-input-foreground);
      border: none;
      resize: none;
      outline: none;
      line-height: 1.5;
    }
    .input-textarea::placeholder {
      color: var(--vscode-input-placeholderForeground);
      opacity: 0.6;
    }
    
    .input-footer-toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 4px;
      padding-top: 4px;
    }
    
    .toolbar-left {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }
    .toolbar-right {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .icon-btn {
      background: transparent;
      border: none;
      color: var(--vscode-icon-foreground);
      padding: 4px;
      border-radius: 4px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0.8;
      transition: all 0.2s;
    }
    .icon-btn:hover {
      background: var(--vscode-toolbar-hoverBackground);
      opacity: 1;
    }
    .icon-btn svg {
      width: 16px;
      height: 16px;
      fill: currentColor;
    }
    .icon-btn[data-tooltip] {
      position: relative;
    }
    .icon-btn[data-tooltip]:hover::after {
      content: attr(data-tooltip);
      position: absolute;
      bottom: 32px;
      right: 0;
      background: var(--vscode-editorWidget-background);
      color: var(--vscode-editorWidget-foreground);
      border: 1px solid var(--vscode-editorWidget-border);
      border-radius: 8px;
      padding: 4px 8px;
      font-size: 11px;
      white-space: nowrap;
      box-shadow: 0 4px 12px rgba(0,0,0,0.35);
      z-index: 500;
    }
    .icon-btn[data-tooltip-align="left"]:hover::after {
      left: 0;
      right: auto;
    }
    .icon-btn[data-tooltip-align="center"]:hover::after {
      left: 50%;
      right: auto;
      transform: translateX(-50%);
    }
    .icon-btn[data-tooltip-position="bottom"]:hover::after {
      top: 32px;
      bottom: auto;
      left: 50%;
      right: auto;
      transform: translateX(-50%);
    }
    .icon-btn[hidden],
    .send-icon-btn[hidden],
    .stop-icon-btn[hidden],
    .empty-state[hidden] {
      display: none !important;
    }
    .send-icon-btn {
      background: #ffffff;
      color: #1e1e1e;
      border: none;
      border-radius: 50%;
      width: 26px;
      height: 26px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: background 0.2s;
    }
    .send-icon-btn:hover {
      background: #f2f2f2;
    }
    .send-icon-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      background: var(--vscode-disabledForeground);
    }
    .send-icon-btn svg {
      width: 14px;
      height: 14px;
      fill: currentColor;
    }
    
    .stop-icon-btn {
      background: transparent;
      border: 1px solid var(--vscode-charts-red);
      color: var(--vscode-charts-red);
      border-radius: 50%;
      width: 26px;
      height: 26px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
    }
    .stop-icon-btn:hover {
      background: rgba(255, 0, 0, 0.1);
    }

    /* Toast 通知 */
    .toast {
      position: fixed;
      bottom: 80px;
      left: 50%;
      transform: translateX(-50%);
      background: var(--vscode-notifications-background);
      border: 1px solid var(--vscode-notifications-border);
      padding: 8px 16px;
      border-radius: 6px;
      font-size: 12px;
      z-index: 1000;
      animation: fadeInOut 2s ease-in-out;
    }
    @keyframes fadeInOut {
      0% { opacity: 0; transform: translateX(-50%) translateY(10px); }
      15% { opacity: 1; transform: translateX(-50%) translateY(0); }
      85% { opacity: 1; transform: translateX(-50%) translateY(0); }
      100% { opacity: 0; transform: translateX(-50%) translateY(-10px); }
    }
    
    /* Follow-up 建議 */
    .followup-suggestions {
      margin-left: 32px;
      margin-top: 8px;
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .followup-btn {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      border: 1px solid var(--vscode-button-border);
      padding: 4px 10px;
      border-radius: 12px;
      font-size: 11px;
      cursor: pointer;
    }
    .followup-btn:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-left">
      <button id="headerBack" class="icon-btn back-btn" hidden title="返回任務清單">
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M15 19l-7-7 7-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
      <div class="header-title" id="headerTitle">
        <span class="icon">👾</span>
        <span id="headerTitleText">BlueMonster</span>
      </div>
    </div>
    <div class="header-right">
      <div class="toolbar">
        <button id="headerHistory" class="icon-btn" data-tooltip="任務清單" data-tooltip-position="bottom" data-tooltip-align="center" title="任務清單">
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 8V12L14.5 14.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M5.60423 5.60423L5.0739 5.0739V5.0739L5.60423 5.60423ZM4.33785 6.87061L3.58786 6.87438C3.58992 7.28564 3.92281 7.61853 4.33408 7.6206L4.33785 6.87061ZM6.87963 7.63339C7.29384 7.63547 7.63131 7.30138 7.63339 6.88717C7.63547 6.47296 7.30138 6.13549 6.88717 6.13341L6.87963 7.63339ZM5.07505 4.32129C5.07296 3.90708 4.7355 3.57298 4.32129 3.57506C3.90708 3.57715 3.57298 3.91462 3.57507 4.32882L5.07505 4.32129ZM3.75 12C3.75 11.5858 3.41421 11.25 3 11.25C2.58579 11.25 2.25 11.5858 2.25 12H3.75ZM16.8755 20.4452C17.2341 20.2378 17.3566 19.779 17.1492 19.4204C16.9418 19.0619 16.483 18.9393 16.1245 19.1468L16.8755 20.4452ZM19.1468 16.1245C18.9393 16.483 19.0619 16.9418 19.4204 17.1492C19.779 17.3566 20.2378 17.2341 20.4452 16.8755L19.1468 16.1245ZM5.14033 5.07126C4.84598 5.36269 4.84361 5.83756 5.13505 6.13191C5.42648 6.42626 5.90134 6.42862 6.19569 6.13719L5.14033 5.07126ZM18.8623 5.13786C15.0421 1.31766 8.86882 1.27898 5.0739 5.0739L6.13456 6.13456C9.33366 2.93545 14.5572 2.95404 17.8017 6.19852L18.8623 5.13786ZM5.0739 5.0739L3.80752 6.34028L4.86818 7.40094L6.13456 6.13456L5.0739 5.0739ZM4.33408 7.6206L6.87963 7.63339L6.88717 6.13341L4.34162 6.12062L4.33408 7.6206ZM5.08784 6.86684L5.07505 4.32129L3.57507 4.32882L3.58786 6.87438L5.08784 6.86684ZM12 3.75C16.5563 3.75 20.25 7.44365 20.25 12H21.75C21.75 6.61522 17.3848 2.25 12 2.25V3.75ZM12 20.25C7.44365 20.25 3.75 16.5563 3.75 12H2.25C2.25 17.3848 6.61522 21.75 12 21.75V20.25ZM16.1245 19.1468C14.9118 19.8483 13.5039 20.25 12 20.25V21.75C13.7747 21.75 15.4407 21.2752 16.8755 20.4452L16.1245 19.1468ZM20.25 12C20.25 13.5039 19.8483 14.9118 19.1468 16.1245L20.4452 16.8755C21.2752 15.4407 21.75 13.7747 21.75 12H20.25ZM6.19569 6.13719C7.68707 4.66059 9.73646 3.75 12 3.75V2.25C9.32542 2.25 6.90113 3.32791 5.14033 5.07126L6.19569 6.13719Z" fill="currentColor"/>
          </svg>
        </button>
        <button id="headerSettings" class="icon-btn" data-tooltip="設定" data-tooltip-position="bottom" data-tooltip-align="center" title="設定">
          <svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
            <path d="M600.704 64a32 32 0 0 1 30.464 22.208l35.2 109.376c14.784 7.232 28.928 15.36 42.432 24.512l112.384-24.192a32 32 0 0 1 34.432 15.36L944.32 364.8a32 32 0 0 1-4.032 37.504l-77.12 85.12a357.12 357.12 0 0 1 0 49.024l77.12 85.248a32 32 0 0 1 4.032 37.504l-88.704 153.6a32 32 0 0 1-34.432 15.296L708.8 803.904c-13.44 9.088-27.648 17.28-42.368 24.512l-35.264 109.376A32 32 0 0 1 600.704 960H423.296a32 32 0 0 1-30.464-22.208L357.696 828.48a351.616 351.616 0 0 1-42.56-24.64l-112.32 24.256a32 32 0 0 1-34.432-15.36L79.68 659.2a32 32 0 0 1 4.032-37.504l77.12-85.248a357.12 357.12 0 0 1 0-48.896l-77.12-85.248A32 32 0 0 1 79.68 364.8l88.704-153.6a32 32 0 0 1 34.432-15.296l112.32 24.256c13.568-9.152 27.776-17.408 42.56-24.64l35.2-109.312A32 32 0 0 1 423.232 64H600.64zm-23.424 64H446.72l-36.352 113.088-24.512 11.968a294.113 294.113 0 0 0-34.816 20.096l-22.656 15.36-116.224-25.088-65.28 113.152 79.68 88.192-1.92 27.136a293.12 293.12 0 0 0 0 40.192l1.92 27.136-79.808 88.192 65.344 113.152 116.224-25.024 22.656 15.296a294.113 294.113 0 0 0 34.816 20.096l24.512 11.968L446.72 896h130.688l36.48-113.152 24.448-11.904a288.282 288.282 0 0 0 34.752-20.096l22.592-15.296 116.288 25.024 65.28-113.152-79.744-88.192 1.92-27.136a293.12 293.12 0 0 0 0-40.256l-1.92-27.136 79.808-88.128-65.344-113.152-116.288 24.96-22.592-15.232a287.616 287.616 0 0 0-34.752-20.096l-24.448-11.904L577.344 128zM512 320a192 192 0 1 1 0 384 192 192 0 0 1 0-384zm0 64a128 128 0 1 0 0 256 128 128 0 0 0 0-256z" fill="currentColor"/>
          </svg>
        </button>
        <button id="headerNewChat" class="icon-btn" data-tooltip="新聊天" data-tooltip-position="bottom" data-tooltip-align="center" title="新聊天">
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M12.75 9C12.75 8.58579 12.4142 8.25 12 8.25C11.5858 8.25 11.25 8.58579 11.25 9L11.25 11.25H9C8.58579 11.25 8.25 11.5858 8.25 12C8.25 12.4142 8.58579 12.75 9 12.75H11.25V15C11.25 15.4142 11.5858 15.75 12 15.75C12.4142 15.75 12.75 15.4142 12.75 15L12.75 12.75H15C15.4142 12.75 15.75 12.4142 15.75 12C15.75 11.5858 15.4142 11.25 15 11.25H12.75V9Z" fill="currentColor"/>
            <path fill-rule="evenodd" clip-rule="evenodd" d="M12.0574 1.25H11.9426C9.63424 1.24999 7.82519 1.24998 6.41371 1.43975C4.96897 1.63399 3.82895 2.03933 2.93414 2.93414C2.03933 3.82895 1.63399 4.96897 1.43975 6.41371C1.24998 7.82519 1.24999 9.63422 1.25 11.9426V12.0574C1.24999 14.3658 1.24998 16.1748 1.43975 17.5863C1.63399 19.031 2.03933 20.1711 2.93414 21.0659C3.82895 21.9607 4.96897 22.366 6.41371 22.5603C7.82519 22.75 9.63423 22.75 11.9426 22.75H12.0574C14.3658 22.75 16.1748 22.75 17.5863 22.5603C19.031 22.366 20.1711 21.9607 21.0659 21.0659C21.9607 20.1711 22.366 19.031 22.5603 17.5863C22.75 16.1748 22.75 14.3658 22.75 12.0574V11.9426C22.75 9.63423 22.75 7.82519 22.5603 6.41371C22.366 4.96897 21.9607 3.82895 21.0659 2.93414C20.1711 2.03933 19.031 1.63399 17.5863 1.43975C16.1748 1.24998 14.3658 1.24999 12.0574 1.25ZM3.9948 3.9948C4.56445 3.42514 5.33517 3.09825 6.61358 2.92637C7.91356 2.75159 9.62177 2.75 12 2.75C14.3782 2.75 16.0864 2.75159 17.3864 2.92637C18.6648 3.09825 19.4355 3.42514 20.0052 3.9948C20.5749 4.56445 20.9018 5.33517 21.0736 6.61358C21.2484 7.91356 21.25 9.62177 21.25 12C21.25 14.3782 21.2484 16.0864 21.0736 17.3864C20.9018 18.6648 20.5749 19.4355 20.0052 20.0052C19.4355 20.5749 18.6648 20.9018 17.3864 21.0736C16.0864 21.2484 14.3782 21.25 12 21.25C9.62177 21.25 7.91356 21.2484 6.61358 21.0736C5.33517 20.9018 4.56445 20.5749 3.9948 20.0052C3.42514 19.4355 3.09825 18.6648 2.92637 17.3864C2.75159 16.0864 2.75 14.3782 2.75 12C2.75 9.62177 2.75159 7.91356 2.92637 6.61358C3.09825 5.33517 3.42514 4.56445 3.9948 3.9948Z" fill="currentColor"/>
          </svg>
        </button>
      </div>
    </div>
  </div>
  
  <!-- 確認面板和選擇面板移到 messages 後，thinking 前 -->
  
  <div class="panel" id="modelPanel" hidden>
    <div class="panel-title">🤖 Select Model</div>
    <div class="panel-meta" id="modelHint"></div>
    <select id="modelSelect" style="width: 100%; margin-bottom: 8px; padding: 8px; background: var(--vscode-dropdown-background); color: var(--vscode-dropdown-foreground); border: 1px solid var(--vscode-dropdown-border); border-radius: 4px;"></select>
    <input id="modelInput" type="text" placeholder="Enter model name" style="width: 100%; margin-bottom: 8px; padding: 8px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); border-radius: 4px;" />
    <div class="panel-actions">
      <button class="btn-primary" id="modelApply">Apply</button>
      <button class="btn-secondary" id="modelCancel">Cancel</button>
    </div>
  </div>
  
  <div class="history-panel" id="historyPanel" hidden>
    <div class="history-panel-header">
      <button id="closeHistoryPanel" class="icon-btn" title="關閉">
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M15 19l-7-7 7-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
      <span class="history-panel-title">任務</span>
    </div>
    <div class="history-search">
      <input type="text" id="historySearch" placeholder="搜尋最近的任務" />
    </div>
    <div class="history-header">
      <span>所有任務</span>
    </div>
    <div class="history-list" id="historyList">
      <div class="history-empty">尚無任務紀錄</div>
    </div>
  </div>
  
  <div class="messages-wrap">
    <div class="empty-state" id="emptyState">
      <img src="${blueMonsterWhSvgUri}" alt="BlueMonster" />
      <div>New chat</div>
    </div>
    <div class="messages" id="messages"></div>
  </div>
  
  <!-- 確認面板 - 程式碼區塊風格 -->
  <div class="confirm-panel-inline" id="confirmPanel" hidden>
    <div class="confirm-header">
      <span class="confirm-title" id="confirmTitle">⚠️ 敏感命令確認</span>
      <span class="confirm-danger-type" id="confirmDangerType"></span>
    </div>
    <div class="confirm-command" id="confirmCommand"></div>
    <div class="confirm-cwd" id="confirmCwd"></div>
    <div class="confirm-options">
      <div class="confirm-option" data-value="1">
        <span class="option-num">1.</span>
        <span>Yes, <span id="confirmTaskName"></span></span>
      </div>
      <div class="confirm-option" data-value="2">
        <span class="option-num">2.</span>
        <span>Yes, and 在這次對話中永遠允許此類操作</span>
      </div>
      <div class="confirm-option" data-value="3">
        <span class="option-num">3.</span>
        <span>No</span>
      </div>
      <div class="confirm-option" data-value="4">
        <span class="option-num">4.</span>
        <span>其他（輸入想法）</span>
      </div>
    </div>
    <div class="confirm-input-wrap">
      <input type="text" id="confirmInput" placeholder="輸入數字 (1-4) 或直接輸入想法..." />
      <button class="btn-primary" id="confirmSubmit">送出</button>
    </div>
    <div class="confirm-hint">💡 輸入 1-4 選擇選項，或直接輸入您的想法</div>
  </div>
  
  <!-- 多選項選擇面板 -->
  <div class="confirm-panel-inline" id="choicePanel" hidden>
    <div class="confirm-header">
      <span class="confirm-title" id="choiceTitle">🤔 請選擇方案</span>
    </div>
    <div class="confirm-command" id="choiceDescription" style="border-bottom: none;"></div>
    <div class="confirm-options" id="choiceOptions"></div>
    <div class="confirm-input-wrap">
      <input type="text" id="choiceInput" placeholder="輸入數字選擇，或直接輸入您的想法..." />
      <button class="btn-primary" id="choiceSubmit">送出</button>
    </div>
    <div class="confirm-hint">💡 輸入數字選擇方案，或直接輸入您的想法</div>
  </div>
  
  <div class="thinking-panel" id="thinkingPanel" hidden>
    <div class="thinking-header">
      <div class="spinner"></div>
      <span id="thinkingLabel">Thinking...</span>
    </div>
    <div class="thinking-body" id="thinkingBody"></div>
  </div>
  
  <div class="input-area">
    <div class="input-container">
      <div class="attachment-area" id="attachmentArea"></div>
      
      <div class="input-wrapper">
        <textarea id="input" class="input-textarea" placeholder="Ask BlueMonster or use /, #, @ ..." rows="1"></textarea>
      </div>
      
      <div class="input-footer-toolbar">
        <div class="toolbar-left">
          <button id="addImage" class="icon-btn" data-tooltip="新增圖像" data-tooltip-align="center" title="新增圖像">
            <svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round">
              <path d="M8 3v10M3 8h10"/>
            </svg>
          </button>
          <!-- 自定義模式選擇器 -->
          <div class="custom-select" id="modeSelectCustom">
            <div class="custom-select-trigger" id="modeSelectTrigger">計畫</div>
            <div class="custom-select-options" id="modeSelectOptions">
              <div class="custom-select-option" data-value="chat"><span class="check-mark">✓</span>計畫</div>
              <div class="custom-select-option selected" data-value="agent"><span class="check-mark">✓</span>代理-安全</div>
              <div class="custom-select-option" data-value="agent-full"><span class="check-mark">✓</span>代理-危險</div>
            </div>
          </div>
          <!-- 自定義模型選擇器 -->
          <div class="custom-select" id="modelSelectCustom">
            <div class="custom-select-trigger" id="modelSelectTrigger">載入中...</div>
            <div class="custom-select-options" id="modelSelectOptions"></div>
          </div>
        </div>
        <div class="toolbar-right">
          <button class="stop-icon-btn" id="stop" hidden title="Stop generating">
            <svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path d="M4 4h8v8H4z" fill="currentColor"/></svg>
          </button>
          <button class="send-icon-btn" id="send" title="Send (Enter)">
            <svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path d="M8.5 13.5v-10l-4 4L3.8 6.8 8 2.6l4.2 4.2-.7.7-4-4v10h1z" fill="currentColor"/></svg>
          </button>
        </div>
      </div>
    </div>
    <input type="file" id="imageInput" accept="image/*" multiple hidden />
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const assistantAvatarUrl = "${blueMonsterWhSvgUri}";
    const messagesEl = document.getElementById('messages');
    const emptyStateEl = document.getElementById('emptyState');
    const messagesWrapEl = document.querySelector('.messages-wrap');
    const inputAreaEl = document.querySelector('.input-area');
    const inputEl = document.getElementById('input');
    const sendEl = document.getElementById('send');
    const stopEl = document.getElementById('stop');
    const headerHistoryEl = document.getElementById('headerHistory');
    const headerSettingsEl = document.getElementById('headerSettings');
    const headerNewChatEl = document.getElementById('headerNewChat');
    const headerBackEl = document.getElementById('headerBack');
    const headerTitleTextEl = document.getElementById('headerTitleText');
    const historyPanelEl = document.getElementById('historyPanel');
    const historyListEl = document.getElementById('historyList');
    const historySearchEl = document.getElementById('historySearch');
    const closeHistoryEl = document.getElementById('closeHistory');
    const closeHistoryPanelEl = document.getElementById('closeHistoryPanel');
    const addImageEl = document.getElementById('addImage');
    const modelLabelEl = document.getElementById('modelLabel');
    // 自定義選擇器元素
    const modeSelectTriggerEl = document.getElementById('modeSelectTrigger');
    const modeSelectOptionsEl = document.getElementById('modeSelectOptions');
    const modelSelectTriggerEl = document.getElementById('modelSelectTrigger');
    const modelSelectOptionsEl = document.getElementById('modelSelectOptions');
    const imageInputEl = document.getElementById('imageInput');
    const attachmentAreaEl = document.getElementById('attachmentArea');
    const thinkingPanelEl = document.getElementById('thinkingPanel');
    const thinkingBodyEl = document.getElementById('thinkingBody');
    const thinkingLabelEl = document.getElementById('thinkingLabel');
    const confirmPanelEl = document.getElementById('confirmPanel');
    const confirmCommandEl = document.getElementById('confirmCommand');
    const confirmCwdEl = document.getElementById('confirmCwd');
    const confirmInputEl = document.getElementById('confirmInput');
    const confirmSubmitEl = document.getElementById('confirmSubmit');
    const confirmOptionsEl = document.querySelectorAll('.confirm-option');
    // 多選項面板元素
    const choicePanelEl = document.getElementById('choicePanel');
    const choiceTitleEl = document.getElementById('choiceTitle');
    const choiceDescriptionEl = document.getElementById('choiceDescription');
    const choiceOptionsEl = document.getElementById('choiceOptions');
    const choiceInputEl = document.getElementById('choiceInput');
    const choiceSubmitEl = document.getElementById('choiceSubmit');
    const modelPanelEl = document.getElementById('modelPanel');
    const modelSelectEl = document.getElementById('modelSelect');
    const modelInputEl = document.getElementById('modelInput');
    const modelApplyEl = document.getElementById('modelApply');
    const modelCancelEl = document.getElementById('modelCancel');
    const modelHintEl = document.getElementById('modelHint');

    let pendingConfirmId = '';
    let pendingModelBackend = '';
    let pendingChoiceId = '';
    let pendingChoiceCount = 0;
    let pendingImages = [];
    let pendingFiles = [];
    let isBusy = false;
    let hasContent = false;

    function escapeHtml(value) {
      return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    function showToast(message) {
      const toast = document.createElement('div');
      toast.className = 'toast';
      toast.textContent = message;
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 2000);
    }

    function updateEmptyState() {
      if (!emptyStateEl) return;
      emptyStateEl.hidden = hasContent || messagesEl.children.length > 0;
    }

    function markHasContent() {
      hasContent = true;
      updateEmptyState();
    }

    function updateLayoutPadding() {
      if (!inputAreaEl || !messagesEl) return;
      const padding = inputAreaEl.offsetHeight + 12;
      messagesEl.style.paddingBottom = padding + 'px';
    }

    // 自定義選擇器邏輯
    let currentModeValue = 'agent'; // 預設為代理-安全
    let currentModelValue = '';
    const modeLabels = {
      'chat': '計畫',
      'agent': '代理-安全',
      'agent-full': '代理-危險'
    };

    function truncateText(text, maxLen) {
      if (!text) return '';
      return text.length > maxLen ? text.slice(0, maxLen) + '...' : text;
    }

    function closeAllSelects() {
      document.querySelectorAll('.custom-select-trigger').forEach(t => t.classList.remove('open'));
      document.querySelectorAll('.custom-select-options').forEach(o => o.classList.remove('show'));
    }

    function initCustomSelect(triggerEl, optionsEl, onSelect, maxLen) {
      if (!triggerEl || !optionsEl) return;
      
      triggerEl.addEventListener('click', function(e) {
        e.stopPropagation();
        const isOpen = optionsEl.classList.contains('show');
        closeAllSelects();
        if (!isOpen) {
          triggerEl.classList.add('open');
          optionsEl.classList.add('show');
        }
      });

      optionsEl.addEventListener('click', function(e) {
        const option = e.target.closest('.custom-select-option');
        if (!option) return;
        const value = option.dataset.value;
        optionsEl.querySelectorAll('.custom-select-option').forEach(o => o.classList.remove('selected'));
        option.classList.add('selected');
        const fullText = option.textContent.replace('✓', '').trim();
        triggerEl.textContent = maxLen ? truncateText(fullText, maxLen) : fullText;
        closeAllSelects();
        if (onSelect) onSelect(value);
      });
    }

    // 初始化模式選擇器
    initCustomSelect(modeSelectTriggerEl, modeSelectOptionsEl, function(value) {
      currentModeValue = value;
      // 通知後端模式變更（可選）
    });

    // 初始化模型選擇器（限制12字）
    initCustomSelect(modelSelectTriggerEl, modelSelectOptionsEl, function(value) {
      currentModelValue = value;
      vscode.postMessage({ type: 'applyModel', value: value });
    }, 12);

    // 點擊外部關閉選擇器
    document.addEventListener('click', function() {
      closeAllSelects();
    });

    // 設定模式選擇器預設值
    if (modeSelectTriggerEl) {
      modeSelectTriggerEl.textContent = modeLabels[currentModeValue] || '代理-安全';
      const defaultOption = modeSelectOptionsEl?.querySelector('[data-value="agent"]');
      if (defaultOption) {
        modeSelectOptionsEl.querySelectorAll('.custom-select-option').forEach(o => o.classList.remove('selected'));
        defaultOption.classList.add('selected');
      }
    }

    function copyToClipboard(text) {
      navigator.clipboard.writeText(text).then(() => {
        showToast('✓ Copied to clipboard');
      }).catch(() => {
        showToast('Failed to copy');
      });
    }

    function setModelLabel(label) {
      if (!modelLabelEl) return;
      modelLabelEl.textContent = label || 'Model:';
    }

    function setThinkingVisible(visible) {
      if (!thinkingPanelEl) return;
      thinkingPanelEl.hidden = !visible;
      if (!visible && thinkingBodyEl) {
        thinkingBodyEl.textContent = '';
      }
    }

    function resetThinking(text) {
      if (!thinkingBodyEl) return;
      thinkingBodyEl.textContent = text || '';
      if (thinkingLabelEl) {
        thinkingLabelEl.textContent = 'Thinking...';
      }
    }

    function appendThinking(text) {
      if (!thinkingBodyEl) return;
      if (!text) return;
      if (thinkingBodyEl.textContent) {
        thinkingBodyEl.textContent += '\\n';
      }
      thinkingBodyEl.textContent += text;
    }

    // 當前確認的危險類別（用於 session 記憶）
    let pendingConfirmCategory = '';

    function showConfirm(payload) {
      if (!confirmPanelEl) return;
      pendingConfirmId = payload.id || '';
      pendingConfirmCategory = payload.category || '';
      
      // 顯示危險類型標題
      const confirmTitleEl = document.getElementById('confirmTitle');
      const confirmDangerTypeEl = document.getElementById('confirmDangerType');
      const confirmTaskNameEl = document.getElementById('confirmTaskName');
      if (confirmTitleEl) {
        confirmTitleEl.textContent = payload.dangerType ? '⚠️ 敏感命令確認' : '⚠️ 執行命令確認';
      }
      if (confirmDangerTypeEl) {
        confirmDangerTypeEl.textContent = payload.dangerType || '';
        confirmDangerTypeEl.style.display = payload.dangerType ? 'inline' : 'none';
      }
      // 設置選項1的任務名稱
      if (confirmTaskNameEl) {
        confirmTaskNameEl.textContent = payload.dangerType || '執行此命令';
      }
      
      if (confirmCommandEl) {
        confirmCommandEl.textContent = payload.command || '';
      }
      if (confirmCwdEl) {
        if (payload.cwd) {
          confirmCwdEl.textContent = '📁 ' + payload.cwd;
          confirmCwdEl.style.display = 'block';
        } else {
          confirmCwdEl.style.display = 'none';
        }
      }
      // 清空輸入框
      if (confirmInputEl) {
        confirmInputEl.value = '';
        confirmInputEl.placeholder = '輸入數字 (1-4) 或直接輸入想法...';
      }
      confirmPanelEl.hidden = false;
      // 滾動到底部並聚焦
      setTimeout(() => {
        confirmPanelEl.scrollIntoView({ behavior: 'smooth', block: 'end' });
        if (confirmInputEl) confirmInputEl.focus();
      }, 100);
    }

    function clearConfirm() {
      pendingConfirmId = '';
      pendingConfirmCategory = '';
      if (confirmPanelEl) {
        confirmPanelEl.hidden = true;
      }
      if (confirmCommandEl) {
        confirmCommandEl.textContent = '';
      }
      if (confirmCwdEl) {
        confirmCwdEl.textContent = '';
      }
      if (confirmInputEl) {
        confirmInputEl.value = '';
      }
    }

    // 多選項面板函數
    function showChoicePanel(payload) {
      if (!choicePanelEl || !choiceOptionsEl) return;
      pendingChoiceId = payload.id || '';
      const options = payload.options || [];
      pendingChoiceCount = options.length;
      
      if (choiceTitleEl) {
        choiceTitleEl.textContent = payload.title || '🤔 請選擇方案';
      }
      if (choiceDescriptionEl) {
        choiceDescriptionEl.textContent = payload.description || '';
        choiceDescriptionEl.hidden = !payload.description;
      }
      
      // 生成選項 HTML
      choiceOptionsEl.innerHTML = options.map(function(opt, idx) {
        const num = idx + 1;
        const recommended = opt.recommended ? ' ⭐ 建議' : '';
        return '<div class="choice-option" data-value="' + num + '" style="padding: 10px 12px; margin: 4px 0; background: #2d2d2d; border-radius: 4px; cursor: pointer;">' +
          '<div style="display: flex; align-items: center;">' +
            '<span style="color: #4fc3f7; margin-right: 8px; font-weight: bold;">' + num + '.</span>' +
            '<span style="font-weight: 500;">' + escapeHtml(opt.label) + recommended + '</span>' +
          '</div>' +
          (opt.description ? '<div style="margin-left: 24px; margin-top: 4px; font-size: 12px; opacity: 0.7;">' + escapeHtml(opt.description) + '</div>' : '') +
        '</div>';
      }).join('') + 
      '<div class="choice-option" data-value="other" style="padding: 10px 12px; margin: 4px 0; background: #2d2d2d; border-radius: 4px; cursor: pointer;">' +
        '<div style="display: flex; align-items: center;">' +
          '<span style="color: #4fc3f7; margin-right: 8px; font-weight: bold;">' + (options.length + 1) + '.</span>' +
          '<span>其他（輸入想法）</span>' +
        '</div>' +
      '</div>';
      
      // 綁定點擊事件
      choiceOptionsEl.querySelectorAll('.choice-option').forEach(function(optEl) {
        optEl.addEventListener('click', function() {
          const value = optEl.dataset.value;
          if (value === 'other') {
            if (choiceInputEl) {
              choiceInputEl.focus();
              choiceInputEl.placeholder = '請輸入您的想法...';
            }
          } else {
            sendChoiceResponse(parseInt(value, 10));
          }
        });
        optEl.addEventListener('mouseenter', function() {
          optEl.style.background = '#3c3c3c';
        });
        optEl.addEventListener('mouseleave', function() {
          optEl.style.background = '#2d2d2d';
        });
      });
      
      if (choiceInputEl) {
        choiceInputEl.value = '';
        choiceInputEl.placeholder = '輸入數字選擇，或直接輸入您的想法...';
      }
      choicePanelEl.hidden = false;
      setTimeout(function() {
        if (choiceInputEl) choiceInputEl.focus();
      }, 100);
    }

    function clearChoicePanel() {
      pendingChoiceId = '';
      pendingChoiceCount = 0;
      if (choicePanelEl) {
        choicePanelEl.hidden = true;
      }
      if (choiceOptionsEl) {
        choiceOptionsEl.innerHTML = '';
      }
      if (choiceInputEl) {
        choiceInputEl.value = '';
      }
    }

    function sendChoiceResponse(selectedIndex, customText) {
      if (!pendingChoiceId) return;
      vscode.postMessage({
        type: 'choiceResponse',
        id: pendingChoiceId,
        selectedIndex: selectedIndex,
        customText: customText || ''
      });
      clearChoicePanel();
    }

    function handleChoiceInput() {
      if (!choiceInputEl) return;
      const value = choiceInputEl.value.trim();
      if (!value) return;
      
      const num = parseInt(value, 10);
      if (!isNaN(num) && num >= 1 && num <= pendingChoiceCount) {
        sendChoiceResponse(num);
      } else if (num === pendingChoiceCount + 1) {
        // 選擇「其他」
        choiceInputEl.value = '';
        choiceInputEl.placeholder = '請輸入您的想法...';
      } else {
        // 當作自定義回應
        sendChoiceResponse(0, value);
      }
    }

    function showModelPanel(payload) {
      if (!modelSelectOptionsEl || !modelSelectTriggerEl) return;
      pendingModelBackend = payload.backend || '';
      modelSelectOptionsEl.innerHTML = '';

      if (pendingModelBackend === 'cli') {
        const label = payload.current || 'CLI model';
        modelSelectTriggerEl.textContent = truncateText(label, 12);
        const option = document.createElement('div');
        option.className = 'custom-select-option selected';
        option.dataset.value = payload.current || '';
        option.innerHTML = '<span class="check-mark">✓</span>' + escapeHtml(label);
        modelSelectOptionsEl.appendChild(option);
        currentModelValue = payload.current || '';
        return;
      }

      if (Array.isArray(payload.options) && payload.options.length > 0) {
        payload.options.forEach((opt, index) => {
          const value = opt.id || opt.label || '';
          const label = opt.label || opt.id || '';
          const isSelected = payload.current ? (value === payload.current) : (index === 0);
          const option = document.createElement('div');
          option.className = 'custom-select-option' + (isSelected ? ' selected' : '');
          option.dataset.value = value;
          option.innerHTML = '<span class="check-mark">✓</span>' + escapeHtml(label);
          modelSelectOptionsEl.appendChild(option);
          if (isSelected) {
            modelSelectTriggerEl.textContent = truncateText(label, 12);
            currentModelValue = value;
          }
        });
      } else {
        modelSelectTriggerEl.textContent = 'No models';
        const option = document.createElement('div');
        option.className = 'custom-select-option selected';
        option.dataset.value = '';
        option.innerHTML = '<span class="check-mark">✓</span>No models';
        modelSelectOptionsEl.appendChild(option);
      }
    }

    function clearModelPanel() {
      pendingModelBackend = '';
    }

    function applyModel() {
      if (!currentModelValue) return;
      vscode.postMessage({ type: 'applyModel', value: currentModelValue });
      clearModelPanel();
    }

    function sendConfirmResponse(action, customText) {
      if (!pendingConfirmId) return;
      vscode.postMessage({ 
        type: 'confirmResponse', 
        id: pendingConfirmId, 
        action: action,
        category: pendingConfirmCategory,
        customText: customText || ''
      });
      clearConfirm();
    }

    function handleConfirmInput() {
      if (!confirmInputEl) return;
      const value = confirmInputEl.value.trim();
      if (!value) return;
      
      // 檢查是否是數字選項
      if (value === '1') {
        sendConfirmResponse('run');
      } else if (value === '2') {
        sendConfirmResponse('sessionAllow');
      } else if (value === '3') {
        sendConfirmResponse('cancel');
      } else if (value === '4') {
        // 清空輸入框，等待用戶輸入想法
        confirmInputEl.value = '';
        confirmInputEl.placeholder = '請輸入您的想法...';
      } else {
        // 當作自定義回應
        sendConfirmResponse('custom', value);
      }
    }
    
    // 格式化程式碼區塊 - Copilot 風格
    function formatCodeBlocks(text) {
      const codeBlockRegex = /\\\`\\\`\\\`(\\w*)\\n([\\s\\S]*?)\\\`\\\`\\\`/g;
      let result = escapeHtml(text);
      
      // 處理程式碼區塊
      result = result.replace(/\`\`\`(\\w*)\\n([\\s\\S]*?)\`\`\`/g, function(match, lang, code) {
        const codeId = 'code-' + Math.random().toString(36).slice(2, 8);
        const langLabel = lang || 'text';
        const isShell = lang === 'bash' || lang === 'sh' || lang === 'shell' || lang === 'zsh';
        
        return '<div class="code-block" data-code-id="' + codeId + '">' +
          '<div class="code-block-header">' +
            '<span class="code-block-lang">' + langLabel + '</span>' +
          '</div>' +
          '<pre><code data-code="' + codeId + '">' + code + '</code></pre>' +
        '</div>';
      });
      
      // 處理行內程式碼
      result = result.replace(/\`([^\`]+)\`/g, '<code>$1</code>');
      
      return result;
    }
    
    // 程式碼操作函數
    window.copyCode = function(codeId) {
      const codeEl = document.querySelector('[data-code="' + codeId + '"]');
      if (codeEl) {
        copyToClipboard(codeEl.textContent);
      }
    };
    
    window.insertCode = function(codeId) {
      const codeEl = document.querySelector('[data-code="' + codeId + '"]');
      if (codeEl) {
        vscode.postMessage({ type: 'insertCode', code: codeEl.textContent });
        showToast('Inserted at cursor');
      }
    };
    
    window.runInTerminal = function(codeId) {
      const codeEl = document.querySelector('[data-code="' + codeId + '"]');
      if (codeEl) {
        vscode.postMessage({ type: 'runInTerminal', command: codeEl.textContent.trim() });
        showToast('Running in terminal');
      }
    };
    
    // 開啟檔案
    window.openFile = function(filePath) {
      vscode.postMessage({ type: 'openFile', path: filePath });
    };
    
    // 儲存原始訊息文字的 Map
    const messageRawTexts = new Map();
    
    // 訊息操作函數
    window.copyMessage = function(msgId) {
      // 優先使用儲存的原始文字
      if (messageRawTexts.has(msgId)) {
        copyToClipboard(messageRawTexts.get(msgId));
        return;
      }
      // Fallback: 從 DOM 取得
      const msgEl = document.querySelector('[data-msg-id="' + msgId + '"]');
      if (msgEl) {
        // 嘗試取得更完整的文字內容
        let text = '';
        // 取得 message-content 中的文字
        const walker = document.createTreeWalker(msgEl, NodeFilter.SHOW_TEXT, null, false);
        let node;
        while (node = walker.nextNode()) {
          text += node.textContent;
        }
        // 處理 code-block 中的程式碼
        msgEl.querySelectorAll('.code-block pre code').forEach(codeEl => {
          text += '\\n' + codeEl.textContent + '\\n';
        });
        copyToClipboard(text.trim() || msgEl.textContent);
      }
    };

    function appendMessage(message) {
      if (message.role === 'user' && (message.kind === 'image' || message.kind === 'file')) {
        appendUserAttachment(message);
        return;
      }
      const item = document.createElement('div');
      item.className = 'message ' + message.role;
      const kind = message.kind || 'text';
      const msgId = 'msg-' + (message.id || Math.random().toString(36).slice(2, 8));
      
      // Header with avatar and role
      const header = document.createElement('div');
      header.className = 'message-header';
      
      const avatar = document.createElement('div');
      avatar.className = 'message-avatar';
      if (message.role === 'assistant') {
        const img = document.createElement('img');
        img.src = assistantAvatarUrl;
        img.alt = 'BlueMonster';
        avatar.appendChild(img);
      }
      header.appendChild(avatar);
      
      const role = document.createElement('span');
      role.className = 'message-role';
      role.textContent = message.role === 'user' ? 'You' : message.role === 'assistant' ? 'BlueMonster' : 'System';
      header.appendChild(role);
      
      // 時間戳
      if (message.ts) {
        const time = document.createElement('span');
        time.className = 'message-time';
        time.textContent = new Date(message.ts).toLocaleTimeString();
        header.appendChild(time);
      }
      
      item.appendChild(header);
      
      if (kind === 'image' && message.dataUrl) {
        const attachment = document.createElement('div');
        attachment.className = 'message-attachment';

        const img = document.createElement('img');
        img.className = 'message-image';
        img.src = message.dataUrl;
        img.alt = 'Uploaded image';

        const textWrap = document.createElement('div');
        textWrap.className = 'attachment-text';
        const nameEl = document.createElement('div');
        nameEl.className = 'attachment-name';
        nameEl.textContent = message.name || 'Image';
        const metaEl = document.createElement('div');
        metaEl.className = 'attachment-meta';
        metaEl.textContent = message.mimeType || '';
        textWrap.appendChild(nameEl);
        if (metaEl.textContent) {
          textWrap.appendChild(metaEl);
        }

        attachment.appendChild(img);
        attachment.appendChild(textWrap);
        attachment.title = 'Click to view full size';
        attachment.onclick = () => {
          vscode.postMessage({ type: 'viewImage', dataUrl: message.dataUrl });
        };
        item.appendChild(attachment);
      } else if (kind === 'thought') {
        const details = document.createElement('details');
        details.className = 'thought';
        const summary = document.createElement('summary');
        summary.innerHTML = '💭 <strong>Thinking Process</strong>';
        const body = document.createElement('div');
        body.className = 'thought-body';
        body.innerHTML = escapeHtml(message.text).replace(/\\n/g, '<br>');
        details.appendChild(summary);
        details.appendChild(body);
        item.appendChild(details);
      } else {
        const content = document.createElement('div');
        content.className = 'message-content';
        content.setAttribute('data-msg-id', msgId);
        // 儲存原始文字以供複製
        if (message.text) {
          messageRawTexts.set(msgId, message.text);
        }
        // 使用格式化函數處理程式碼區塊
        const formattedText = formatCodeBlocks(message.text || '');
        content.innerHTML = formattedText.replace(/\\n/g, '<br>');
        if (message.role === 'assistant' && message.activity) {
          const activityWrap = document.createElement('div');
          activityWrap.className = 'assistant-activity';

          // 步驟卡片 - 可折疊
          if (Array.isArray(message.activity.steps) && message.activity.steps.length > 0) {
            message.activity.steps.forEach((step) => {
              const card = document.createElement('details');
              card.className = 'activity-card';
              const summary = document.createElement('summary');
              summary.innerHTML = '<span class="card-icon done">✓</span><span class="card-title">' + escapeHtml(step) + '</span>';
              card.appendChild(summary);
              activityWrap.appendChild(card);
            });
          }

          // 檔案操作卡片 - 可折疊，顯示行號範圍
          if (Array.isArray(message.activity.files) && message.activity.files.length > 0) {
            message.activity.files.forEach((file) => {
              const card = document.createElement('details');
              card.className = 'activity-card';
              const summary = document.createElement('summary');
              
              let actionIcon = '✓';
              let actionLabel = '';
              if (file.action === 'created') {
                actionLabel = '建立';
              } else if (file.action === 'read') {
                actionLabel = '讀取';
              } else {
                actionLabel = '編輯';
              }
              
              let lineInfo = '';
              if (file.lineStart && file.lineEnd) {
                lineInfo = '<span class="line-range">，' + file.lineStart + ' 至 ' + file.lineEnd + ' 行</span>';
              }
              
              let badge = '';
              if (file.action !== 'read' && (file.added > 0 || file.removed > 0)) {
                badge = '<span class="card-badge"><span class="plus">+' + file.added + '</span> <span class="minus">-' + file.removed + '</span></span>';
              }
              
              summary.innerHTML = 
                '<span class="card-icon done">' + actionIcon + '</span>' +
                '<span class="card-title">' + actionLabel + ' <span class="file-link" onclick="event.stopPropagation(); openFile(\\'' + escapeHtml(file.name) + '\\')">' + escapeHtml(file.name) + '</span>' + lineInfo + '</span>' +
                badge;
              card.appendChild(summary);
              activityWrap.appendChild(card);
            });
          }

          // 命令卡片 - 可折疊
          if (Array.isArray(message.activity.commands) && message.activity.commands.length > 0) {
            message.activity.commands.forEach((cmd, idx) => {
              const card = document.createElement('details');
              card.className = 'activity-card';
              const summary = document.createElement('summary');
              const shortCmd = cmd.length > 50 ? cmd.substring(0, 50) + '...' : cmd;
              summary.innerHTML = '<span class="card-icon done">⚡</span><span class="card-title">執行終端機指令</span>';
              const body = document.createElement('div');
              body.className = 'card-body';
              body.innerHTML = '<pre>' + escapeHtml(cmd) + '</pre>';
              card.appendChild(summary);
              card.appendChild(body);
              activityWrap.appendChild(card);
            });
          }

          item.appendChild(activityWrap);
        }
        item.appendChild(content);
      }
      messagesEl.appendChild(item);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      markHasContent();
    }

    function appendUserAttachment(message) {
      if (!messagesEl) return;
      let lastUser = messagesEl.lastElementChild;
      while (lastUser && !(lastUser.classList && lastUser.classList.contains('message') && lastUser.classList.contains('user'))) {
        lastUser = lastUser.previousElementSibling;
      }
      if (!lastUser) {
        const placeholder = document.createElement('div');
        placeholder.className = 'message user';
        const content = document.createElement('div');
        content.className = 'message-content';
        content.textContent = '';
        placeholder.appendChild(content);
        messagesEl.appendChild(placeholder);
        lastUser = placeholder;
      }
      let container = lastUser.querySelector('.user-attachments');
      if (!container) {
        container = document.createElement('div');
        container.className = 'user-attachments';
        lastUser.appendChild(container);
      }
      const chip = document.createElement('div');
      chip.className = 'user-attachment-chip';
      const iconSvg = message.kind === 'image'
        ? '<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path d="M2 3h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm2 2.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm9 6.5H3l3.2-3.2 2 2 1.4-1.4L13 12z" fill="currentColor"/></svg>'
        : '<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path d="M3 2h7l3 3v9H3V2zm7 1v2h2" fill="currentColor"/></svg>';
      chip.innerHTML =
        iconSvg +
        '<span class="user-attachment-name">' + escapeHtml(message.name || 'attachment') + '</span>';
      container.appendChild(chip);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      markHasContent();
    }

    function setHistory(messages) {
      messagesEl.innerHTML = '';
      messages.forEach(appendMessage);
      hasContent = messages.length > 0;
      updateEmptyState();
    }

    function setBusy(busy) {
      isBusy = busy;
      sendEl.disabled = busy;
      sendEl.hidden = busy;
      stopEl.hidden = !busy;
      setThinkingVisible(Boolean(busy));
      if (busy) {
        resetThinking('Thinking...');
      }
    }

    function sendMessage() {
      const value = inputEl.value.trim();
      if (!value && pendingImages.length === 0 && pendingFiles.length === 0) return;
      markHasContent();
      const mode = currentModeValue || 'agent';
      const images = [...pendingImages];
      const files = [...pendingFiles];

      setBusy(true);
      
      inputEl.value = '';
      inputEl.dispatchEvent(new Event('input'));
      inputEl.focus();
      
      // 清除附件預覽
      pendingImages = [];
      pendingFiles = [];
      updateImagePreview();
      
      vscode.postMessage({ 
        type: 'userMessage', 
        text: value,
        mode: mode,
        images: images,
        files: files
      });
    }
    
    function stopGeneration() {
      vscode.postMessage({ type: 'stop' });
      showToast('⏹️ Generation stopped');
    }
    
    // 歷史記錄功能
    function requestHistory() {
      const query = historySearchEl ? historySearchEl.value : '';
      vscode.postMessage({ type: 'getHistory', query });
    }

    // 當前載入的歷史任務標題
    let currentHistoryTitle = '';
    let isViewingHistory = false;

    function toggleHistory() {
      historyPanelEl.hidden = !historyPanelEl.hidden;
      if (!historyPanelEl.hidden) {
        requestHistory();
        // Focus 在 search input 上
        if (historySearchEl) {
          setTimeout(function() {
            historySearchEl.focus();
          }, 50);
        }
      }
    }
    
    function closeHistoryPanel() {
      historyPanelEl.hidden = true;
    }
    
    function showBackButton(title) {
      if (headerBackEl) {
        headerBackEl.hidden = false;
      }
      if (headerTitleTextEl) {
        headerTitleTextEl.textContent = title || 'BlueMonster';
      }
      currentHistoryTitle = title;
      isViewingHistory = true;
    }
    
    function hideBackButton() {
      if (headerBackEl) {
        headerBackEl.hidden = true;
      }
      if (headerTitleTextEl) {
        headerTitleTextEl.textContent = 'BlueMonster';
      }
      currentHistoryTitle = '';
      isViewingHistory = false;
    }
    
    function goBackToHistory() {
      // 開啟新對話
      vscode.postMessage({ type: 'newChat' });
      hideBackButton();
      toggleHistory();
    }
    
    function renderHistory(histories) {
      if (!histories || histories.length === 0) {
        const hasQuery = historySearchEl && historySearchEl.value.trim().length > 0;
        historyListEl.innerHTML = hasQuery
          ? '<div class="history-empty">找不到符合的任務</div>'
          : '<div class="history-empty">尚無任務紀錄</div>';
        return;
      }

      var totalCount = histories.length;
      historyListEl.innerHTML = histories.map(function(h, index) {
        // 任務 ID 顯示，如果沒有則用索引
        var taskId = h.taskId || '#' + String(totalCount - index).padStart(4, '0');
        // 使用 data 屬性存儲 id、title 和 taskId
        return '<div class="history-item" data-id="' + escapeHtml(h.id) + '" data-title="' + escapeHtml(h.title) + '" data-taskid="' + escapeHtml(taskId) + '">' +
          '<img class="history-item-icon" src="' + assistantAvatarUrl + '" alt="" />' +
          '<div class="history-item-content">' +
            '<div class="history-item-header">' +
              '<span class="history-item-taskid">' + escapeHtml(taskId) + '</span>' +
              '<span class="history-item-title">' + escapeHtml(h.title) + '</span>' +
            '</div>' +
            '<div class="history-item-time">' + escapeHtml(h.date || '') + '</div>' +
          '</div>' +
        '</div>';
      }).join('');
      
      // 使用事件委派處理點擊
      var items = historyListEl.querySelectorAll('.history-item');
      items.forEach(function(item) {
        item.addEventListener('click', function() {
          var id = this.getAttribute('data-id');
          var title = this.getAttribute('data-title');
          if (id) {
            vscode.postMessage({ type: 'loadHistory', id: id });
            historyPanelEl.hidden = true;
            showBackButton(title || 'Task');
          }
        });
      });
    }
    
    window.loadHistoryItem = function(id, title) {
      vscode.postMessage({ type: 'loadHistory', id: id });
      historyPanelEl.hidden = true;
      showBackButton(title);
    };
    
    window.loadHistory = function(id) {
      vscode.postMessage({ type: 'loadHistory', id: id });
      historyPanelEl.hidden = true;
    };
    
    // 匯出對話
    function exportChat() {
      vscode.postMessage({ type: 'exportChat' });
      showToast('📤 Exporting chat...');
    }

    sendEl.addEventListener('click', sendMessage);
    stopEl.addEventListener('click', stopGeneration);

    inputEl.addEventListener('keydown', (event) => {
      if (event.isComposing) {
        return;
      }
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
      }
    });

    if (headerHistoryEl) {
      headerHistoryEl.addEventListener('click', toggleHistory);
    }
    if (headerSettingsEl) {
      headerSettingsEl.addEventListener('click', () => {
        vscode.postMessage({ type: 'openSettings' });
      });
    }
    if (headerNewChatEl) {
      headerNewChatEl.addEventListener('click', () => {
        vscode.postMessage({ type: 'newChat' });
        hideBackButton();
      });
    }
    if (headerBackEl) {
      headerBackEl.addEventListener('click', goBackToHistory);
    }
    if (closeHistoryEl) {
      closeHistoryEl.addEventListener('click', () => { historyPanelEl.hidden = true; });
    }
    if (closeHistoryPanelEl) {
      closeHistoryPanelEl.addEventListener('click', closeHistoryPanel);
    }
    if (historySearchEl) {
      historySearchEl.addEventListener('input', () => {
        requestHistory();
      });
    }
    if (addImageEl) {
      addImageEl.addEventListener('click', () => {
        if (imageInputEl) {
          imageInputEl.value = '';
          imageInputEl.click();
        }
      });
    }
    if (inputEl) {
      inputEl.addEventListener('input', updateLayoutPadding);
    }
    if (inputAreaEl && typeof ResizeObserver !== 'undefined') {
      const resizeObserver = new ResizeObserver(() => updateLayoutPadding());
      resizeObserver.observe(inputAreaEl);
    }
    window.addEventListener('resize', updateLayoutPadding);
    
    // 圖片上傳處理
    imageInputEl.addEventListener('change', (e) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;
      
      for (const file of files) {
        if (!file.type || !file.type.startsWith('image/')) {
          showToast('Only image files are supported right now');
          continue;
        }
        const reader = new FileReader();
        reader.onload = (ev) => {
          const dataUrl = ev.target && typeof ev.target.result === 'string' ? ev.target.result : '';
          if (!dataUrl) {
            showToast('Failed to read image: ' + file.name);
            return;
          }
          pendingImages.push({
            dataUrl,
            mimeType: file.type,
            name: file.name
          });
          updateImagePreview();
        };
        reader.onerror = () => showToast('Failed to read image: ' + file.name);
        reader.readAsDataURL(file);
      }
      
      imageInputEl.value = '';
    });

    // 更新圖片預覽 (附件 Chips)
    function updateImagePreview() {
      if (!attachmentAreaEl) return;
      
      if (pendingImages.length === 0 && pendingFiles.length === 0) {
        attachmentAreaEl.innerHTML = '';
        return;
      }
      
      const imageItems = pendingImages.map((img, idx) => {
        const thumb = img.dataUrl
          ? '<img class="chip-thumb" src="' + img.dataUrl + '" alt="preview" />'
          : '<svg viewBox="0 0 16 16" width="14" height="14" xmlns="http://www.w3.org/2000/svg" fill="currentColor"><path d="M13.85 4.5l-3.35-3.35.7-.7.71.71L14.56 3.8l.71.71-.71.71L12.5 7.28l-.7-.71 2.05-2.07zm-7.7 9.92l7.35-7.36-.7-.7-7.36 7.35a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l7.36-7.36-.7-.71-7.36 7.36a3 3 0 0 0 0 4.24 3 3 0 0 0 4.24 0zM13.2 5.9l-7.35 7.36a1 1 0 0 1-1.41 0 1 1 0 0 1 0-1.42l7.35-7.35.7.7z"/></svg>';
        return '<div class="attachment-chip">' +
          '<div class="chip-icon">' + thumb + '</div>' +
          '<span class="chip-name">' + escapeHtml(img.name) + '</span>' +
          '<button class="chip-remove" data-idx="' + idx + '" title="Remove">✕</button>' +
        '</div>';
      });

      const fileItems = pendingFiles.map((file, idx) => {
        return '<div class="attachment-chip">' +
          '<div class="chip-icon"><svg viewBox="0 0 16 16" width="14" height="14" xmlns="http://www.w3.org/2000/svg" fill="currentColor"><path d="M4 1h5l3 3v11H4V1zm5 1.5V4h1.5L9 2.5zM5 7h6v1H5V7zm0 2h6v1H5V9z" /></svg></div>' +
          '<span class="chip-name">' + escapeHtml(file.name) + '</span>' +
          '<button class="chip-remove" data-file-idx="' + idx + '" title="Remove">✕</button>' +
        '</div>';
      });

      attachmentAreaEl.innerHTML = imageItems.concat(fileItems).join('');
      
      attachmentAreaEl.querySelectorAll('.chip-remove').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const imgIdx = e.target.dataset.idx;
          const fileIdx = e.target.dataset.fileIdx;
          if (imgIdx !== undefined) {
            pendingImages.splice(parseInt(imgIdx, 10), 1);
          } else if (fileIdx !== undefined) {
            pendingFiles.splice(parseInt(fileIdx, 10), 1);
          }
          updateImagePreview();
        });
      });
    }
    
    // Removed clearImagesEl listener
    
    // 確認選項點擊事件
    confirmOptionsEl.forEach(option => {
      option.addEventListener('click', () => {
        const value = option.dataset.value;
        if (value === '1') {
          sendConfirmResponse('run');
        } else if (value === '2') {
          sendConfirmResponse('sessionAllow');
        } else if (value === '3') {
          sendConfirmResponse('cancel');
        } else if (value === '4') {
          // 聚焦輸入框讓用戶輸入想法
          if (confirmInputEl) {
            confirmInputEl.focus();
            confirmInputEl.placeholder = '請輸入您的想法...';
          }
        }
      });
      // hover 效果
      option.addEventListener('mouseenter', () => {
        option.style.background = '#3c3c3c';
      });
      option.addEventListener('mouseleave', () => {
        option.style.background = '#2d2d2d';
      });
    });

    // 確認輸入框事件
    if (confirmInputEl) {
      confirmInputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleConfirmInput();
        }
      });
    }
    if (confirmSubmitEl) {
      confirmSubmitEl.addEventListener('click', () => handleConfirmInput());
    }

    // 多選項面板事件
    if (choiceInputEl) {
      choiceInputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleChoiceInput();
        }
      });
    }
    if (choiceSubmitEl) {
      choiceSubmitEl.addEventListener('click', () => handleChoiceInput());
    }

    if (modelApplyEl) {
      modelApplyEl.addEventListener('click', applyModel);
    }
    if (modelCancelEl) {
      modelCancelEl.addEventListener('click', clearModelPanel);
    }

    window.addEventListener('message', (event) => {
      const message = event.data;
      if (!message) return;
      if (message.type === 'history') {
        setHistory(message.messages || []);
      } else if (message.type === 'append') {
        appendMessage(message.message);
      } else if (message.type === 'busy') {
        setBusy(Boolean(message.value));
      } else if (message.type === 'thinking') {
        if (message.reset) {
          resetThinking(String(message.text || ''));
          setThinkingVisible(true);
        } else if (message.text) {
          appendThinking(String(message.text || ''));
          setThinkingVisible(true);
        }
        if (message.done) {
          setThinkingVisible(false);
        }
      } else if (message.type === 'model') {
        setModelLabel(String(message.label || ''));
      } else if (message.type === 'confirm') {
        showConfirm(message);
      } else if (message.type === 'confirmClear') {
        clearConfirm();
      } else if (message.type === 'choice') {
        showChoicePanel(message);
      } else if (message.type === 'choiceClear') {
        clearChoicePanel();
      } else if (message.type === 'modelOptions') {
        showModelPanel(message);
      } else if (message.type === 'chatHistories') {
        renderHistory(message.histories || []);
      } else if (message.type === 'toast') {
        showToast(message.text);
      } else if (message.type === 'filesSelected') {
        const incoming = message.files || [];
        pendingFiles = pendingFiles.concat(incoming);
        updateImagePreview();
      }
    });

    setBusy(false);
    vscode.postMessage({ type: 'ready' });
    vscode.postMessage({ type: 'requestModelOptions' });
    updateLayoutPadding();
  </script>
</body>
</html>`;
}

class BlueMonsterSession {
  private readonly context: vscode.ExtensionContext;
  private readonly views = new Set<vscode.Webview>();
  private readonly messages: UiMessage[] = [];
  private currentModelLabel = 'Model: (auto)';
  private busy = false;
  private thinkingLog: string[] = [];
  private pendingConfirmations = new Map<string, (result: ConfirmationResult) => void>();
  private pendingChoices = new Map<string, (result: ChoiceResult) => void>();
  private currentChatId = this.createChatId();
  private currentChatCreatedAt = Date.now();
  private hasUnsavedChanges = false;
  private currentCancellation?: vscode.CancellationTokenSource;
  private cliProcess?: ChildProcess;
  private stopRequested = false;
  private activitySteps: string[] = [];
  private activityFiles: ActivityFileEntry[] = [];
  private activityCommands: string[] = [];
  private referenceCount = 0;
  // 當前操作模式: 'chat' | 'agent' | 'agent-full'
  private currentMode: 'chat' | 'agent' | 'agent-full' = 'agent';
  // Session 記憶：這次對話中允許的危險類型
  private sessionAllowedCategories = new Set<string>();

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  private createChatId(): string {
    return `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private resetCurrentChat(): void {
    this.currentChatId = this.createChatId();
    this.currentChatCreatedAt = Date.now();
    this.hasUnsavedChanges = false;
    // 清空 session 記憶
    this.sessionAllowedCategories.clear();
  }

  private resetActivity(): void {
    this.activitySteps = [];
    this.activityFiles = [];
    this.activityCommands = [];
    this.referenceCount = 0;
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
    if (this.thinkingLog.length > 0) {
      webview.postMessage({ type: 'thinking', reset: true, text: this.thinkingLog.join('\n') });
    }
  }

  removeView(webview: vscode.Webview) {
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
      void this.saveCurrentChatToHistory({ reason: 'close' });
    }
  }

  clearHistory() {
    this.messages.length = 0;
    this.resetCurrentChat();
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
  }

  private setModelLabel(label: string) {
    if (!label || label === this.currentModelLabel) {
      return;
    }
    this.currentModelLabel = label;
    this.broadcast({ type: 'model', label });
  }

  private async refreshModelLabel(): Promise<void> {
    const backend = getBackend();
    if (backend === 'cli') {
      this.setModelLabel('Model: CLI');
      return;
    }
    const model = await this.resolveModel();
    if (model) {
      this.setModelLabel(`Model: ${model.name}`);
    } else {
      this.setModelLabel('Model: unavailable');
    }
  }

  private startThinking(text = 'Thinking...') {
    this.thinkingLog = [];
    this.thinkingLog.push(text);
    this.broadcast({ type: 'thinking', reset: true, text });
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
    this.thinkingLog.push(text);
    this.broadcast({ type: 'thinking', text });
  }

  private stopThinking() {
    this.thinkingLog = [];
    this.broadcast({ type: 'thinking', done: true });
  }

  private requestStop(): void {
    this.stopRequested = true;
    if (this.currentCancellation) {
      this.currentCancellation.cancel();
      this.currentCancellation.dispose();
      this.currentCancellation = undefined;
    }
    if (this.cliProcess) {
      this.cliProcess.kill();
      this.cliProcess = undefined;
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
      if (category && this.sessionAllowedCategories.has(category)) {
        return true;
      }
      
      // 需要確認
      this.appendThinking(`${label} - 等待用戶確認...`);
      return this.confirmTerminalCommandInline(command, cwd, label, category);
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
      return this.confirmTerminalCommandModal(command, cwd);
    }
    this.appendThinking('Awaiting approval to run a terminal command...');
    return this.confirmTerminalCommandInline(command, cwd);
  }

  private async confirmTerminalCommandModal(command: string, cwd?: string): Promise<boolean> {
    const detail = cwd ? `\nWorking dir: ${cwd}` : '';
    const choice = await vscode.window.showWarningMessage(
      `Run terminal command?\n\n${command}${detail}`,
      { modal: true },
      'Run'
    );
    return choice === 'Run';
  }

  private async confirmTerminalCommandInline(command: string, cwd?: string, dangerType?: string, category?: string): Promise<boolean> {
    if (this.views.size === 0) {
      return this.confirmTerminalCommandModal(command, cwd);
    }
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const result = await new Promise<ConfirmationResult>((resolve) => {
      this.pendingConfirmations.set(id, resolve);
      this.broadcast({ type: 'confirm', id, command, cwd, dangerType, category });
    });
    this.broadcast({ type: 'confirmClear', id });
    if (result.remember) {
      await setTerminalConfirmationMode('off');
      this.addMessage('system', 'Terminal confirmations disabled in settings.');
    }
    return result.approved;
  }

  private async runTerminalCommand(command: string, cwd?: string) {
    await this.runTerminalCommandWithResult(command, cwd);
  }

  /**
   * 執行終端機命令並捕獲輸出
   * 優先使用 exec 直接執行以捕獲輸出，同時也在終端機顯示
   */
  private async runTerminalCommandWithResult(command: string, cwd?: string): Promise<string> {
    const confirmed = await this.confirmTerminalCommand(command, cwd);
    if (!confirmed) {
      this.addMessage('system', 'Terminal command cancelled.');
      return 'Terminal command cancelled.';
    }
    
    this.appendThinking('Running terminal command...');
    this.recordActivityCommand(command);
    
    const terminal = getTerminal(cwd);
    const workingDir = cwd || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    
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

  async runVsCodeCommandWithResult(command: string, args?: unknown[]): Promise<string> {
    if (!getDangerModeEnabled()) {
      return 'Danger mode is disabled. Enable blueMonster.dangerMode to use this tool.';
    }
    try {
      const result = await vscode.commands.executeCommand(command, ...(args || []));
      if (result === undefined) {
        return `VS Code command executed: ${command}`;
      }
      if (typeof result === 'string') {
        return `VS Code command result: ${result}`;
      }
      return `VS Code command result: ${JSON.stringify(result)}`;
    } catch (error) {
      return `VS Code command failed: ${String(error)}`;
    }
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

  private async runCli(prompt: string, memoryContext?: string): Promise<ChatResult> {
    const template = getCliCommand();
    if (!template) {
      const text = 'CLI backend is selected but blueMonster.cliCommand is empty.';
      return { text, parts: [{ kind: 'text', text }] };
    }
    const contextPrefix = memoryContext
      ? `Long-term memory (previous chats, may be relevant):\n${memoryContext}\n\n`
      : '';
    const combinedPrompt = `${contextPrefix}${prompt}`.trim();
    const command = buildCliCommand(template, combinedPrompt, getCliModel());
    const cwd = getCliCwd();
    this.appendThinking('Running CLI command...');
    return await new Promise<ChatResult>((resolve, reject) => {
      const child = execCallback(
        command,
        {
          cwd: cwd || undefined,
          maxBuffer: 1024 * 1024
        },
        (error, stdout, stderr) => {
          if (this.cliProcess === child) {
            this.cliProcess = undefined;
          }
          if (this.stopRequested) {
            reject(new Error('Cancelled'));
            return;
          }
          if (error) {
            const text = `CLI error: ${String(error)}`;
            resolve({ text, parts: [{ kind: 'text', text }] });
            return;
          }
          const output = `${stdout || ''}${stderr || ''}`.trim();
          const text = output || 'CLI finished with no output.';
          resolve({ text, parts: [{ kind: 'text', text }] });
        }
      );
      this.cliProcess = child;
    });
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

  private async resolveModel(): Promise<vscode.LanguageModelChat | undefined> {
    if (!vscode.lm?.selectChatModels) {
      return undefined;
    }

    const preferredModelId = getPreferredModelId();
    if (preferredModelId) {
      const matches = await vscode.lm.selectChatModels({ vendor: 'copilot', id: preferredModelId });
      if (matches.length > 0) {
        return matches[0];
      }
    }

    const models = await vscode.lm.selectChatModels({ vendor: 'copilot' });
    return models[0];
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
      
      // 「計畫」模式下不提供工具，只能聊天
      let tools: vscode.LanguageModelChatTool[] = [];
      if (this.currentMode !== 'chat') {
        tools = [terminalToolDefinition(), searchTasksToolDefinition()];
        if (getDangerModeEnabled()) {
          tools.push(
            vsCodeCommandToolDefinition(),
            readFileToolDefinition(),
            writeFileToolDefinition(),
            openFileToolDefinition(),
            switchWindowToolDefinition()
          );
        }
      }
      
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
        
        if (
          call.name !== TOOL_NAME &&
          call.name !== VS_COMMAND_TOOL_NAME &&
          call.name !== READ_FILE_TOOL_NAME &&
          call.name !== WRITE_FILE_TOOL_NAME &&
          call.name !== OPEN_FILE_TOOL_NAME &&
          call.name !== SWITCH_WINDOW_TOOL_NAME &&
          call.name !== SEARCH_TASKS_TOOL_NAME
        ) {
          appendText(`\n\nUnsupported tool call: ${call.name}`);
          continue;
        }
        let result: vscode.LanguageModelToolResult;
        try {
          if (call.name === TOOL_NAME) {
            const normalized = normalizeToolInput(call.input);
            if (!normalized) {
              appendText('\n\nTool input missing required command.');
              continue;
            }
            this.appendThinking('Tool requested: run terminal command.');
            const text = await this.runTerminalCommandWithResult(normalized.command, normalized.cwd);
            result = new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(text)]);
          } else if (call.name === VS_COMMAND_TOOL_NAME) {
            const normalized = normalizeVsCodeCommandInput(call.input);
            if (!normalized) {
              appendText('\n\nTool input missing required command.');
              continue;
            }
            this.appendThinking('Tool requested: execute VS Code command.');
            const text = await this.runVsCodeCommandWithResult(normalized.command, normalized.args);
            result = new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(text)]);
          } else if (call.name === READ_FILE_TOOL_NAME) {
            const normalized = normalizeReadFileInput(call.input);
            if (!normalized) {
              appendText('\n\nTool input missing required path.');
              continue;
            }
            this.appendThinking('Tool requested: read file.');
            const text = await this.readFileWithResult(normalized.path);
            result = new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(text)]);
          } else if (call.name === WRITE_FILE_TOOL_NAME) {
            const normalized = normalizeWriteFileInput(call.input);
            if (!normalized) {
              appendText('\n\nTool input missing required path/content.');
              continue;
            }
            this.appendThinking('Tool requested: write file.');
            const text = await this.writeFileWithResult(normalized.path, normalized.content);
            result = new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(text)]);
          } else if (call.name === OPEN_FILE_TOOL_NAME) {
            const normalized = normalizeOpenFileInput(call.input);
            if (!normalized) {
              appendText('\n\nTool input missing required path.');
              continue;
            }
            this.appendThinking('Tool requested: open file.');
            const text = await this.openFileWithResult(normalized.path, normalized.preview);
            result = new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(text)]);
          } else if (call.name === SEARCH_TASKS_TOOL_NAME) {
            const normalized = normalizeSearchTasksInput(call.input);
            if (!normalized) {
              appendText('\n\nTool input missing required query.');
              continue;
            }
            this.appendThinking('Tool requested: search tasks.');
            const text = await this.searchTasksWithResult(normalized.query);
            result = new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(text)]);
          } else {
            this.appendThinking('Tool requested: switch window.');
            const text = await this.switchWindowWithResult();
            result = new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(text)]);
          }
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
    const model = await this.resolveModel();
    if (!model) {
      const text = 'No Copilot model available. Check Copilot login and plan.';
      return { text, parts: [{ kind: 'text', text }] };
    }

    this.setModelLabel(`Model: ${model.name}`);
    this.appendThinking(`Using model: ${model.name}`);
    const access = this.context.languageModelAccessInformation;
    if (access?.canSendRequest && access.canSendRequest(model) === false) {
      const text = 'Copilot access not granted. Please run a chat request from the UI first.';
      return { text, parts: [{ kind: 'text', text }] };
    }

    // 檢查模型是否支援圖片輸入 (fallback 為 true)
    const supportsImages = (model as any).capabilities?.imageInput !== false;

    // === Anthropic Prompt Engineering Best Practices Applied ===
    // Based on: https://github.com/anthropics/prompt-eng-interactive-tutorial
    // Using 10-element structure: Task Context, Tone, Rules, Examples, Immediate Task, Precognition, Output Format
    
    const systemPromptParts = [
      // === Element 1 & 2: Task Context & Role ===
      '<task_context>',
      'You are BlueMonster, an expert VS Code assistant specializing in file operations, terminal commands, and development tasks.',
      'Your goal is to help users complete their coding tasks accurately and reliably.',
      'You have access to powerful tools: terminal execution, file read/write, and VS Code commands.',
      '</task_context>',
      '',
      // === Element 3: Tone Context ===
      '<tone>',
      'Be concise, precise, and action-oriented. Explain what you are doing briefly.',
      'When errors occur, stay calm and methodically try alternatives.',
      '</tone>',
      '',
      // === Element 4: Detailed Task Rules ===
      '<rules>',
      '【CRITICAL RULES - MUST FOLLOW】',
      '',
      '1. THINK BEFORE ACTION:',
      '   Before executing ANY command, think step by step:',
      '   - What am I trying to achieve?',
      '   - What could go wrong?',
      '   - How will I verify success?',
      '',
      '2. VERIFY EVERY FILE OPERATION:',
      '   NEVER assume a file write succeeded. Always verify with a SEPARATE command:',
      '   <verification_methods>',
      '   - test -s <file> && echo "VERIFIED" || echo "FAILED"',
      '   - cat <file> | head -c 200',
      '   - wc -c <file>',
      '   - ls -la <file>',
      '   </verification_methods>',
      '',
      '3. AVOID HEREDOC (<<EOF):',
      '   Heredoc commands often fail silently in this environment.',
      '   <preferred_methods>',
      '   - printf \'%s\\n\' "line1" "line2" > file',
      '   - echo "content" | tee file > /dev/null',
      '   - python3 -c "open(\'file\',\'w\').write(\'content\')"',
      '   </preferred_methods>',
      '',
      '4. ESCALATION STRATEGY:',
      '   If a method fails, try alternatives in order:',
      '   <escalation>',
      '   Step 1: Use printf with explicit content',
      '   Step 2: Use python3 for file write',
      '   Step 3: Use blueMonster_writeFile tool (if Danger Mode enabled)',
      '   Step 4: After 3 failures, STOP and ask user for guidance',
      '   </escalation>',
      '',
      '5. OUTPUT HONESTY:',
      '   - Report ACTUAL command output, never fabricate expected results',
      '   - If output is empty, say "Command produced no output"',
      '   - Distinguish between "no output" and "command failed"',
      '',
      '6. UNICODE/CHINESE CONTENT:',
      '   For non-ASCII content, always verify with:',
      '   python3 -c "print(repr(open(\'file\').read()[:100]))"',
      '',
      '7. TERMINAL COMMAND FORMAT:',
      '   NEVER use shell comments (#) in terminal commands - they cause "command not found" errors in zsh.',
      '   NEVER send multi-line scripts - combine commands with && on a single line.',
      '   <bad_examples>',
      '   # This is a comment   ← WRONG: causes "zsh: command not found: #"',
      '   echo "line 1"',
      '   echo "line 2"        ← WRONG: multi-line causes parsing issues',
      '   </bad_examples>',
      '   <good_examples>',
      '   echo "line 1" && echo "line 2"   ← CORRECT: single line with &&',
      '   printf "%s\\n" "line 1" "line 2" ← CORRECT: use printf for multi-line output',
      '   </good_examples>',
      '',
      '8. STOP WHEN DONE:',
      '   Once a task is verified successful, STOP. Do not repeat the same verification multiple times.',
      '   If you see "VERIFIED" once, the task is complete.',
      '</rules>',
      '',
      // === Element 5: Examples (Few-shot) ===
      '<examples>',
      '<example name="correct_file_write">',
      'User: Create a file hello.txt with "Hello World"',
      'Assistant thinking: I need to (1) write the file (2) verify it exists with content',
      'Action 1: printf \'%s\' "Hello World" > hello.txt',
      'Action 2: test -s hello.txt && cat hello.txt',
      'Result: VERIFIED - file contains "Hello World"',
      '</example>',
      '',
      '<example name="handling_failure">',
      'User: Write to /some/path/file.txt',
      'Action 1: printf \'%s\' "content" > /some/path/file.txt',
      'Result: No error but verification shows file is empty',
      'Analysis: Directory may not exist or no permission',
      'Action 2: mkdir -p /some/path && printf \'%s\' "content" > /some/path/file.txt',
      'Action 3: Verify again with test -s',
      '</example>',
      '</examples>',
      '',
      // === Element 6: Tools Available ===
      '<tools_available>',
      `- ${TOOL_NAME}: Execute shell commands in terminal`,
      '</tools_available>',
      '',
      // === Element 7: Immediate Task Reminder ===
      '<immediate_task>',
      'For each user request:',
      '1. First, understand what the user wants',
      '2. Plan your approach (which commands/tools to use)',
      '3. Execute with verification',
      '4. Report actual results honestly',
      '</immediate_task>',
      '',
      // === Element 8: Precognition (Think Step by Step) ===
      '<precognition>',
      'Before executing commands, think through your approach.',
      'After each action, evaluate: Did it work? How do I know?',
      'If uncertain, verify before proceeding.',
      '</precognition>',
      ''
    ];
    if (getDangerModeEnabled()) {
      systemPromptParts.push(
        '<danger_mode_tools>',
        'Danger Mode is ENABLED. You have access to additional powerful tools:',
        `- ${VS_COMMAND_TOOL_NAME}: Execute VS Code commands directly`,
        `- ${READ_FILE_TOOL_NAME}: Read file contents`,
        `- ${WRITE_FILE_TOOL_NAME}: Write content to files (MOST RELIABLE for file writes)`,
        `- ${OPEN_FILE_TOOL_NAME}: Open files in editor`,
        `- ${SWITCH_WINDOW_TOOL_NAME}: Switch between windows`,
        '',
        'RECOMMENDATION: For file write operations, prefer blueMonster_writeFile over terminal commands.',
        'It bypasses shell escaping issues and is more reliable.',
        '</danger_mode_tools>'
      );
    }
    if (memoryContext) {
      systemPromptParts.push(`System: Long-term memory (previous chats, may be relevant):\n${memoryContext}`);
    }
    const systemPrompt = systemPromptParts.join('\n');

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
    if (!vscode.lm?.selectChatModels) {
      return 'Language Model API is not available in this VS Code version.';
    }
    const models = await vscode.lm.selectChatModels({ vendor: 'copilot' });
    if (models.length === 0) {
      return 'No Copilot models available. Check Copilot login and plan.';
    }
    const lines = models.map((model) => `- ${model.name} (${model.id})`);
    return `Available Copilot models:\n${lines.join('\n')}`;
  }

  private async getModelOptions(): Promise<{ backend: string; current?: string; options?: any[]; hint?: string }> {
    const backend = getBackend();
    if (backend === 'cli') {
      const current = getCliModel();
      return {
        backend: 'cli',
        current,
        hint: 'CLI backend: enter a model name.'
      };
    }
    if (!vscode.lm?.selectChatModels) {
      return {
        backend: 'copilot',
        hint: 'Language Model API is not available in this VS Code version.'
      };
    }
    const models = await vscode.lm.selectChatModels({ vendor: 'copilot' });
    if (models.length === 0) {
      return {
        backend: 'copilot',
        hint: 'No Copilot models available. Check Copilot login and plan.'
      };
    }
    const options = models.map((model) => ({ id: model.id, label: model.name }));
    return {
      backend: 'copilot',
      current: getPreferredModelId(),
      options,
      hint: 'Copilot backend: select a model.'
    };
  }

  private async setCopilotModelByName(name: string): Promise<string> {
    if (!vscode.lm?.selectChatModels) {
      return 'Language Model API is not available in this VS Code version.';
    }
    const models = await vscode.lm.selectChatModels({ vendor: 'copilot' });
    if (models.length === 0) {
      return 'No Copilot models available. Check Copilot login and plan.';
    }
    const needle = name.toLowerCase();
    let match = models.find((model) => model.id.toLowerCase() === needle || model.name.toLowerCase() === needle);
    if (!match) {
      match = models.find(
        (model) => model.id.toLowerCase().includes(needle) || model.name.toLowerCase().includes(needle)
      );
    }
    if (!match) {
      return `No matching Copilot model for "${name}". Use "/model list" to see options.`;
    }
    await vscode.workspace
      .getConfiguration(CONFIG_SECTION)
      .update('model', match.id, vscode.ConfigurationTarget.Global);
    this.setModelLabel(`Model: ${match.name}`);
    return `BlueMonster model set to: ${match.name} (${match.id})`;
  }

  private async setCliModelByName(name: string): Promise<string> {
    await vscode.workspace
      .getConfiguration(CONFIG_SECTION)
      .update('cliModel', name, vscode.ConfigurationTarget.Global);
    return `CLI model set to: ${name}`;
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
    } else if (action === 'sessionAllow') {
      // 選項 2：這次 session 允許此類操作
      if (category) {
        this.sessionAllowedCategories.add(category);
        this.addMessage('system', `✅ 已在本次對話中允許「${category}」類操作`);
      }
      pending({ approved: true, sessionAllow: category });
    } else if (action === 'run') {
      // 選項 1：同意執行
      pending({ approved: true });
    } else if (action === 'custom') {
      // 選項 4：自定義回應
      this.addMessage('system', `💭 您的回饋：${customText}`);
      pending({ approved: false, customResponse: customText });
    } else {
      // 選項 3：拒絕
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
    if (!value) {
      return;
    }
    const backend = getBackend();
    if (backend === 'cli') {
      const result = await this.setCliModelByName(value);
      this.addMessage('system', result);
    } else {
      const result = await this.setCopilotModelByName(value);
      this.addMessage('system', result);
    }
  }

  async handleUserMessage(
    text: string,
    mode?: string,
    images?: Array<{dataUrl: string, mimeType: string, name: string}>,
    files?: Array<{name: string, path: string}>
  ) {
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
      const backend = getBackend();
      if (!arg) {
        if (backend === 'cli') {
          const current = getCliModel();
          this.addMessage('system', current ? `CLI model: ${current}` : 'CLI model is not set.');
        } else {
          const current = getPreferredModelId();
          this.addMessage(
            'system',
            current ? `Copilot model id: ${current}` : 'Copilot model is not set. Use "/model list".'
          );
        }
        return;
      }
      if (arg === 'list') {
        if (backend === 'cli') {
          this.addMessage('system', 'CLI backend does not provide a model list. Set it with /model <name>.');
        } else {
          const list = await this.listCopilotModels();
          this.addMessage('system', list);
        }
        return;
      }
      if (backend === 'cli') {
        const result = await this.setCliModelByName(arg);
        this.addMessage('system', result);
      } else {
        const result = await this.setCopilotModelByName(arg);
        this.addMessage('system', result);
      }
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
    
    this.setBusy(true);
    this.startThinking();

    try {
      const backend = getBackend();
      if (backend === 'cli' && images && images.length > 0) {
        this.addMessage('system', 'CLI backend does not support image input. Images were ignored.');
      }

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
      
      const response = backend === 'cli'
        ? await this.runCli(fullPrompt, memoryContext)
        : await this.runLm(fullPrompt, images, memoryContext);
      if (this.stopRequested) {
        return;
      }
      this.addAssistantResult(response);
    } catch (error) {
      if (this.stopRequested) {
        return;
      }
      this.addMessage('system', `Error: ${String(error)}`);
    } finally {
      this.stopThinking();
      this.setBusy(false);
    }
  }

  async handleMessage(message: any) {
    switch (message?.type) {
      case 'ready':
        this.broadcast({ type: 'history', messages: this.messages });
        void this.refreshModelLabel();
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
      case 'newChat':
        // 保存當前對話到歷史記錄
        if (this.messages.length > 0) {
          await this.saveCurrentChatToHistory();
        }
        this.clearHistory();
        break;
      case 'getHistory':
        const query = typeof message?.query === 'string' ? message.query : '';
        const histories = await this.getChatHistories(query);
        this.broadcast({ type: 'chatHistories', histories });
        break;
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
    
    // 生成任務 ID：找到現有最大的編號 +1
    let taskId: string;
    if (existingIndex >= 0 && history[existingIndex].taskId) {
      taskId = history[existingIndex].taskId;
    } else {
      const existingIds = history
        .map(h => h.taskId)
        .filter(id => id && id.startsWith('#'))
        .map(id => parseInt(id.slice(1), 10))
        .filter(n => !isNaN(n));
      const maxId = existingIds.length > 0 ? Math.max(...existingIds) : 0;
      taskId = '#' + String(maxId + 1).padStart(4, '0');
    }
    
    const entry: ChatHistoryEntry = {
      id: this.currentChatId,
      taskId,
      title,
      date: new Date(now).toLocaleDateString(),
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
    const totalCount = history.length;
    if (!trimmedQuery) {
      return history.map((entry, index) => ({
        id: entry.id,
        taskId: entry.taskId || '#' + String(totalCount - index).padStart(4, '0'),
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
      title: entry.title,
      date: entry.date,
      messageCount: entry.messageCount,
      preview: entry.preview || '',
      matchCount
    }));
  }

  // 新增：載入歷史對話
  private async loadChatHistory(id: string): Promise<void> {
    const history = await this.ensureHistoryIndex(
      this.context.globalState.get<ChatHistoryEntry[]>('chatHistories') || []
    );
    const chat = history.find((entry) => entry.id === id);
    
    if (chat && chat.messages) {
      // 先保存當前對話
      if (this.messages.length > 0) {
        await this.saveCurrentChatToHistory();
      }
      
      this.messages.length = 0;
      this.messages.push(...chat.messages);
      this.currentChatId = chat.id;
      this.currentChatCreatedAt = chat.createdAt;
      this.hasUnsavedChanges = false;
      this.broadcast({ type: 'history', messages: this.messages });
      this.broadcast({ type: 'toast', text: `📋 Loaded: ${chat.title}` });
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
        vscode.Uri.joinPath(this.context.extensionUri, '..', 'vscode-extension', 'resources', 'bluemonster'),
        this.context.extensionUri
      ]
    };

    view.webview.html = getWebviewHtml(view.webview, this.context.extensionUri);
    this.session.addView(view.webview);

    view.webview.onDidReceiveMessage((message) => this.session.handleMessage(message));
    view.onDidDispose(() => this.session.removeView(view.webview));
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
        vscode.Uri.joinPath(this.context.extensionUri, '..', 'vscode-extension', 'resources', 'bluemonster'),
        this.context.extensionUri
      ]
    };

    panel.webview.html = getWebviewHtml(panel.webview, this.context.extensionUri);
    session.addView(panel.webview);

    panel.webview.onDidReceiveMessage((message) => session.handleMessage(message));
    panel.onDidDispose(() => {
      session.removeView(panel.webview);
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

export function deactivate() {
  sharedTerminal?.dispose();
}
