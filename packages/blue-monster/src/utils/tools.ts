/**
 * 工具定義與輸入正規化
 */
import * as vscode from 'vscode';
import { normalizeInput } from './helpers';

// 工具名稱常量
export const TOOL_NAME = 'blueMonster_runInTerminal';
export const VS_COMMAND_TOOL_NAME = 'blueMonster_executeVsCodeCommand';
export const READ_FILE_TOOL_NAME = 'blueMonster_readFile';
export const WRITE_FILE_TOOL_NAME = 'blueMonster_writeFile';
export const OPEN_FILE_TOOL_NAME = 'blueMonster_openFile';
export const SWITCH_WINDOW_TOOL_NAME = 'blueMonster_switchWindow';
export const SEARCH_TASKS_TOOL_NAME = 'blueMonster_searchTasks';

// 輸入類型定義
export interface RunInTerminalInput {
  command: string;
  cwd?: string;
}

export interface VsCodeCommandInput {
  command: string;
  args?: unknown[];
}

export interface ReadFileInput {
  path: string;
}

export interface WriteFileInput {
  path: string;
  content: string;
}

export interface OpenFileInput {
  path: string;
  preview?: boolean;
}

export interface SearchTasksInput {
  query: string;
}

// 工具定義工廠
interface ToolConfig {
  name: string;
  description: string;
  properties: Record<string, { type: string; description: string; items?: object }>;
  required: string[];
}

const createToolDefinition = (config: ToolConfig): vscode.LanguageModelChatTool => ({
  name: config.name,
  description: config.description,
  inputSchema: { type: 'object', properties: config.properties, required: config.required }
});

// 工具定義配置
const TOOL_CONFIGS: Record<string, ToolConfig> = {
  terminal: {
    name: TOOL_NAME,
    description: 'Run a shell command in the VS Code integrated terminal',
    properties: {
      command: { type: 'string', description: 'Shell command to run' },
      cwd: { type: 'string', description: 'Optional working directory (absolute path)' }
    },
    required: ['command']
  },
  vsCommand: {
    name: VS_COMMAND_TOOL_NAME,
    description: 'Execute a VS Code command via the command registry',
    properties: {
      command: { type: 'string', description: 'VS Code command id' },
      args: { type: 'array', description: 'Optional arguments for the command', items: {} }
    },
    required: ['command']
  },
  readFile: {
    name: READ_FILE_TOOL_NAME,
    description: 'Read a file from disk',
    properties: { path: { type: 'string', description: 'Absolute file path' } },
    required: ['path']
  },
  writeFile: {
    name: WRITE_FILE_TOOL_NAME,
    description: 'Write a file to disk',
    properties: {
      path: { type: 'string', description: 'Absolute file path' },
      content: { type: 'string', description: 'File content' }
    },
    required: ['path', 'content']
  },
  openFile: {
    name: OPEN_FILE_TOOL_NAME,
    description: 'Open a file in VS Code',
    properties: {
      path: { type: 'string', description: 'Absolute file path' },
      preview: { type: 'boolean', description: 'Open in preview mode (optional)' }
    },
    required: ['path']
  },
  switchWindow: {
    name: SWITCH_WINDOW_TOOL_NAME,
    description: 'Switch VS Code window (opens the window switcher)',
    properties: {},
    required: []
  },
  searchTasks: {
    name: SEARCH_TASKS_TOOL_NAME,
    description: 'Search previous task history by keyword. Returns a list of matching tasks with taskId (e.g. #0001), title, date, and preview.',
    properties: { query: { type: 'string', description: 'Search keyword or phrase to find matching tasks' } },
    required: ['query']
  }
};

// 工具定義函數
export const terminalToolDefinition = () => createToolDefinition(TOOL_CONFIGS.terminal);
export const vsCodeCommandToolDefinition = () => createToolDefinition(TOOL_CONFIGS.vsCommand);
export const readFileToolDefinition = () => createToolDefinition(TOOL_CONFIGS.readFile);
export const writeFileToolDefinition = () => createToolDefinition(TOOL_CONFIGS.writeFile);
export const openFileToolDefinition = () => createToolDefinition(TOOL_CONFIGS.openFile);
export const switchWindowToolDefinition = () => createToolDefinition(TOOL_CONFIGS.switchWindow);
export const searchTasksToolDefinition = () => createToolDefinition(TOOL_CONFIGS.searchTasks);

// 輸入正規化函數
export const normalizeToolInput = (input: object): RunInTerminalInput | undefined =>
  normalizeInput(input, (c) => {
    const command = typeof c.command === 'string' ? c.command.trim() : '';
    if (!command) return undefined;
    const cwd = typeof c.cwd === 'string' && c.cwd.trim() ? c.cwd.trim() : undefined;
    return { command, cwd };
  });

export const normalizeVsCodeCommandInput = (input: object): VsCodeCommandInput | undefined =>
  normalizeInput(input, (c) => {
    const command = typeof c.command === 'string' ? c.command.trim() : '';
    if (!command) return undefined;
    const args = Array.isArray(c.args) ? c.args : undefined;
    return { command, args };
  });

export const normalizeReadFileInput = (input: object): ReadFileInput | undefined =>
  normalizeInput(input, (c) => {
    const path = typeof c.path === 'string' ? c.path.trim() : '';
    return path ? { path } : undefined;
  });

export const normalizeWriteFileInput = (input: object): WriteFileInput | undefined =>
  normalizeInput(input, (c) => {
    const path = typeof c.path === 'string' ? c.path.trim() : '';
    const content = typeof c.content === 'string' ? c.content : '';
    return path ? { path, content } : undefined;
  });

export const normalizeOpenFileInput = (input: object): OpenFileInput | undefined =>
  normalizeInput(input, (c) => {
    const path = typeof c.path === 'string' ? c.path.trim() : '';
    if (!path) return undefined;
    const preview = typeof c.preview === 'boolean' ? c.preview : undefined;
    return { path, preview };
  });

export const normalizeSearchTasksInput = (input: object): SearchTasksInput | undefined =>
  normalizeInput(input, (c) => {
    const query = typeof c.query === 'string' ? c.query.trim() : '';
    return query ? { query } : undefined;
  });
