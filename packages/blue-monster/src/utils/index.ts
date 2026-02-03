/**
 * Utils 模組統一導出
 */

// 從 helpers.ts 導出
export {
  STOP_WORDS,
  countLineDiff,
  extractHeredocWrite,
  extractRedirectTarget,
  normalizeText,
  tokenize,
  normalizeInput,
  setupTaskFolder
} from './helpers';

// 從 terminal.ts 導出
export {
  setupTerminalCloseHandler,
  getTerminal,
  disposeTerminal
} from './terminal';

// 從 config.ts 導出
export {
  CONFIG_SECTION,
  getConfig,
  getReasoningEffort,
  getTerminalConfirmationMode,
  setTerminalConfirmationMode,
  getDangerModeEnabled,
  getPreferredModelId,
  getMcpAutoStart,
  getMcpServers,
  getSafeModeSettings,
  setSafeModeCategoryConfirmation,
  detectDangerousCommand,
  shouldConfirmCommand
} from './config';
export type {
  TerminalConfirmationMode,
  SafeModeSettings,
  DangerCategory,
  DangerInfo,
  McpServerConfig
} from './config';

// 從 tools.ts 導出
export {
  TOOL_NAME,
  VS_COMMAND_TOOL_NAME,
  READ_FILE_TOOL_NAME,
  WRITE_FILE_TOOL_NAME,
  OPEN_FILE_TOOL_NAME,
  SWITCH_WINDOW_TOOL_NAME,
  SEARCH_TASKS_TOOL_NAME,
  terminalToolDefinition,
  vsCodeCommandToolDefinition,
  readFileToolDefinition,
  writeFileToolDefinition,
  openFileToolDefinition,
  switchWindowToolDefinition,
  searchTasksToolDefinition,
  normalizeToolInput,
  normalizeVsCodeCommandInput,
  normalizeReadFileInput,
  normalizeWriteFileInput,
  normalizeOpenFileInput,
  normalizeSearchTasksInput
} from './tools';
export type {
  RunInTerminalInput,
  VsCodeCommandInput,
  ReadFileInput,
  WriteFileInput,
  OpenFileInput,
  SearchTasksInput
} from './tools';

// 從 cache.ts 導出
export {
  LRUCache,
  getCachedTokenCount,
  setCachedTokenCount,
  getCachedSearchResults,
  setCachedSearchResults,
  invalidateSearchCache,
  invalidateTokenCache
} from './cache';
