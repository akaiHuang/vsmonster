import * as vscode from 'vscode';
import { exec as execCallback, spawn, ChildProcess } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import { WEBVIEW_CSS, WEBVIEW_JS, WEBVIEW_HTML_TEMPLATE } from './webview';
import {
  // Constants
  STOP_WORDS, CONFIG_SECTION,
  TOOL_NAME, VS_COMMAND_TOOL_NAME, READ_FILE_TOOL_NAME,
  WRITE_FILE_TOOL_NAME, OPEN_FILE_TOOL_NAME, SWITCH_WINDOW_TOOL_NAME, SEARCH_TASKS_TOOL_NAME,
  // Helpers
  countLineDiff, extractHeredocWrite, extractRedirectTarget, escapeShellArg,
  buildCliCommand, normalizeText, tokenize,
  // Terminal
  setupTerminalCloseHandler, getTerminal, disposeTerminal,
  // Config
  getConfig, getCliCommand, getCliModel, getCliCwd,
  getTerminalConfirmationMode, setTerminalConfirmationMode, getDangerModeEnabled, getBackend,
  getPreferredModelId, getMcpAutoStart, getMcpServers,
  getSafeModeSettings, shouldConfirmCommand,
  // Tools
  terminalToolDefinition, vsCodeCommandToolDefinition, readFileToolDefinition,
  writeFileToolDefinition, openFileToolDefinition, switchWindowToolDefinition, searchTasksToolDefinition,
  normalizeToolInput, normalizeVsCodeCommandInput, normalizeReadFileInput,
  normalizeWriteFileInput, normalizeOpenFileInput, normalizeSearchTasksInput
} from './utils';
import type {
  TerminalConfirmationMode, SafeModeSettings, McpServerConfig,
  RunInTerminalInput, VsCodeCommandInput, ReadFileInput, WriteFileInput, OpenFileInput
} from './utils';

const exec = promisify(execCallback);

const VIEW_ID = 'blueMonster.chatView';
const MAX_TOOL_TURNS = 8;
const MAX_HISTORY_ITEMS = 100;
const MAX_HISTORY_TEXT_CHARS = 20000;
const MAX_MEMORY_MATCHES = 3;
const MAX_MEMORY_CONTEXT_CHARS = 1200;

// System Prompt 模板 (Anthropic Prompt Engineering Best Practices)
const SYSTEM_PROMPT_TEMPLATE = `<task_context>
You are BlueMonster, an expert VS Code assistant specializing in file operations, terminal commands, and development tasks.
Your goal is to help users complete their coding tasks accurately and reliably.
You have access to powerful tools: terminal execution, file read/write, and VS Code commands.
</task_context>

<tone>
Be concise, precise, and action-oriented. Explain what you are doing briefly.
When errors occur, stay calm and methodically try alternatives.
</tone>

<rules>
【CRITICAL RULES - MUST FOLLOW】

1. THINK BEFORE ACTION:
   Before executing ANY command, think step by step:
   - What am I trying to achieve?
   - What could go wrong?
   - How will I verify success?

2. VERIFY EVERY FILE OPERATION:
   NEVER assume a file write succeeded. Always verify with a SEPARATE command:
   <verification_methods>
   - test -s <file> && echo "VERIFIED" || echo "FAILED"
   - cat <file> | head -c 200
   - wc -c <file>
   - ls -la <file>
   </verification_methods>

3. AVOID HEREDOC (<<EOF):
   Heredoc commands often fail silently in this environment.
   <preferred_methods>
   - printf '%s\\n' "line1" "line2" > file
   - echo "content" | tee file > /dev/null
   - python3 -c "open('file','w').write('content')"
   </preferred_methods>

4. ESCALATION STRATEGY:
   If a method fails, try alternatives in order:
   <escalation>
   Step 1: Use printf with explicit content
   Step 2: Use python3 for file write
   Step 3: Use blueMonster_writeFile tool (if Danger Mode enabled)
   Step 4: After 3 failures, STOP and ask user for guidance
   </escalation>

5. OUTPUT HONESTY:
   - Report ACTUAL command output, never fabricate expected results
   - If output is empty, say "Command produced no output"
   - Distinguish between "no output" and "command failed"

6. UNICODE/CHINESE CONTENT:
   For non-ASCII content, always verify with:
   python3 -c "print(repr(open('file').read()[:100]))"

7. TERMINAL COMMAND FORMAT:
   NEVER use shell comments (#) in terminal commands - they cause "command not found" errors in zsh.
   NEVER send multi-line scripts - combine commands with && on a single line.
   <bad_examples>
   # This is a comment   ← WRONG: causes "zsh: command not found: #"
   echo "line 1"
   echo "line 2"        ← WRONG: multi-line causes parsing issues
   </bad_examples>
   <good_examples>
   echo "line 1" && echo "line 2"   ← CORRECT: single line with &&
   printf "%s\\n" "line 1" "line 2" ← CORRECT: use printf for multi-line output
   </good_examples>

8. STOP WHEN DONE:
   Once a task is verified successful, STOP. Do not repeat the same verification multiple times.
   If you see "VERIFIED" once, the task is complete.
</rules>

<examples>
<example name="correct_file_write">
User: Create a file hello.txt with "Hello World"
Assistant thinking: I need to (1) write the file (2) verify it exists with content
Action 1: printf '%s' "Hello World" > hello.txt
Action 2: test -s hello.txt && cat hello.txt
Result: VERIFIED - file contains "Hello World"
</example>

<example name="handling_failure">
User: Write to /some/path/file.txt
Action 1: printf '%s' "content" > /some/path/file.txt
Result: No error but verification shows file is empty
Analysis: Directory may not exist or no permission
Action 2: mkdir -p /some/path && printf '%s' "content" > /some/path/file.txt
Action 3: Verify again with test -s
</example>
</examples>

<tools_available>
- ${TOOL_NAME}: Execute shell commands in terminal
</tools_available>

<immediate_task>
For each user request:
1. First, understand what the user wants
2. Plan your approach (which commands/tools to use)
3. Execute with verification
4. Report actual results honestly
</immediate_task>

<precognition>
Before executing commands, think through your approach.
After each action, evaluate: Did it work? How do I know?
If uncertain, verify before proceeding.
</precognition>`;

const DANGER_MODE_PROMPT = `<danger_mode_tools>
Danger Mode is ENABLED. You have access to additional powerful tools:
- ${VS_COMMAND_TOOL_NAME}: Execute VS Code commands directly
- ${READ_FILE_TOOL_NAME}: Read file contents
- ${WRITE_FILE_TOOL_NAME}: Write content to files (MOST RELIABLE for file writes)
- ${OPEN_FILE_TOOL_NAME}: Open files in editor
- ${SWITCH_WINDOW_TOOL_NAME}: Switch between windows

RECOMMENDATION: For file write operations, prefer blueMonster_writeFile over terminal commands.
It bypasses shell escaping issues and is more reliable.
</danger_mode_tools>`;

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const stat = await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
    return stat.size > 0;
  } catch {
    return false;
  }
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
  const blueMonsterWhSvgUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, '..', 'vscode-extension', 'resources', 'bluemonster', 'blueMonster_wh.svg')
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

    // 組建 System Prompt
    const systemPromptParts = [SYSTEM_PROMPT_TEMPLATE];
    if (getDangerModeEnabled()) {
      systemPromptParts.push(DANGER_MODE_PROMPT);
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
  disposeTerminal();
}
