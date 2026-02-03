/**
 * 配置相關工具
 */
import * as vscode from 'vscode';

export const CONFIG_SECTION = 'blueMonster';

export type TerminalConfirmationMode = 'modal' | 'chat' | 'off';

export interface SafeModeSettings {
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

// 危險命令類型定義
export type DangerCategory = 'delete' | 'move' | 'sudo' | 'network' | 'download' | 'package' | 'git' | 'docker' | 'permission' | 'kill' | 'system';

export interface DangerInfo {
  category: DangerCategory;
  label: string;
  settingKey: keyof SafeModeSettings;
}

// 危險命令模式配置（資料驅動）
const DANGER_PATTERNS: Array<{ patterns: string[]; info: DangerInfo }> = [
  { patterns: ['rm ', 'rm\t', 'rmdir', 'unlink', 'shred'], info: { category: 'delete', label: '🗑️ 刪除檔案', settingKey: 'confirmDelete' } },
  { patterns: ['mv ', 'mv\t'], info: { category: 'move', label: '📁 移動檔案', settingKey: 'confirmMove' } },
  { patterns: ['sudo', 'su ', 'su\t'], info: { category: 'sudo', label: '🔐 管理員權限', settingKey: 'confirmSudo' } },
  { patterns: ['ssh', 'scp', 'rsync'], info: { category: 'network', label: '🌐 遠端連線', settingKey: 'confirmNetwork' } },
  { patterns: ['curl', 'wget'], info: { category: 'download', label: '⬇️ 網路下載', settingKey: 'confirmDownload' } },
  { patterns: ['npm ', 'npm\t', 'npx ', 'yarn ', 'pnpm ', 'pip ', 'pip3', 'brew ', 'apt ', 'apt-get', 'yum ', 'dnf ', 'pacman'], info: { category: 'package', label: '📦 套件安裝', settingKey: 'confirmPackage' } },
  { patterns: ['git push', 'git reset --hard', 'git clean', 'git checkout -f'], info: { category: 'git', label: '📤 Git 操作', settingKey: 'confirmGit' } },
  { patterns: ['docker rm', 'docker rmi', 'docker stop', 'docker kill'], info: { category: 'docker', label: '🐳 Docker 操作', settingKey: 'confirmDocker' } },
  { patterns: ['chmod', 'chown', 'chgrp'], info: { category: 'permission', label: '🔒 權限變更', settingKey: 'confirmPermission' } },
  { patterns: ['kill ', 'killall', 'pkill'], info: { category: 'kill', label: '💀 終止進程', settingKey: 'confirmKill' } },
  { patterns: ['reboot', 'shutdown', 'halt', 'poweroff', 'mkfs', 'fdisk', 'dd ', 'eval ', 'exec ', '> /', '>> /'], info: { category: 'system', label: '⚡ 系統操作', settingKey: 'confirmSystem' } },
];

const DANGER_CATEGORY_TO_SETTING: Record<DangerCategory, keyof SafeModeSettings> = {
  delete: 'confirmDelete',
  move: 'confirmMove',
  sudo: 'confirmSudo',
  network: 'confirmNetwork',
  download: 'confirmDownload',
  package: 'confirmPackage',
  git: 'confirmGit',
  docker: 'confirmDocker',
  permission: 'confirmPermission',
  kill: 'confirmKill',
  system: 'confirmSystem'
};

/**
 * 取得配置物件
 */
export function getConfig(): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration(CONFIG_SECTION);
}

/**
 * 取得 Reasoning Effort
 * 優先使用新設定 `blueMonster.reasoningEffort`，若不存在則相容舊設定 `cliReasoningEffort`
 */
export function getReasoningEffort(): string {
  const config = getConfig();
  const current = config.get<string>('reasoningEffort');
  if (current) return current;
  const legacy = config.get<string>('cliReasoningEffort');
  return legacy || 'medium';
}

/**
 * 取得終端機確認模式
 */
export function getTerminalConfirmationMode(): TerminalConfirmationMode {
  return getConfig().get<TerminalConfirmationMode>('terminalConfirmation') ?? 'chat';
}

/**
 * 設定終端機確認模式
 */
export async function setTerminalConfirmationMode(mode: TerminalConfirmationMode): Promise<void> {
  await getConfig().update('terminalConfirmation', mode, vscode.ConfigurationTarget.Global);
}

/**
 * 取得是否啟用 Danger Mode
 */
export function getDangerModeEnabled(): boolean {
  return getConfig().get<boolean>('dangerMode') ?? false;
}

/**
 * 取得後端類型
 */

/**
 * 取得偏好的模型 ID
 */
export function getPreferredModelId(): string {
  return (getConfig().get<string>('model') || '').trim();
}

/**
 * 取得 MCP 是否自動啟動
 */
export function getMcpAutoStart(): boolean {
  return Boolean(getConfig().get<boolean>('mcpAutoStart'));
}

/**
 * MCP 伺服器配置
 */
export interface McpServerConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  enabled?: boolean;
  autostart?: boolean;
}

/**
 * 取得 MCP 伺服器配置
 */
export function getMcpServers(): McpServerConfig[] {
  const value = getConfig().get<McpServerConfig[]>('mcpServers');
  return Array.isArray(value) ? value : [];
}

/**
 * 取得安全模式設定
 */
export function getSafeModeSettings(): SafeModeSettings {
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

/**
 * 偵測危險命令
 */
export function detectDangerousCommand(command: string): DangerInfo | null {
  const lowerCmd = command.toLowerCase();
  for (const { patterns, info } of DANGER_PATTERNS) {
    if (patterns.some(p => lowerCmd.includes(p))) return info;
  }
  return null;
}

/**
 * 檢查命令是否需要確認
 */
export function shouldConfirmCommand(command: string, settings: SafeModeSettings): { confirm: boolean; label: string; category: string } {
  const danger = detectDangerousCommand(command);
  if (!danger) return { confirm: false, label: '', category: '' };
  return { confirm: settings[danger.settingKey], label: danger.label, category: danger.category };
}

export function getSafeModeSettingKeyByCategory(category: string): keyof SafeModeSettings | undefined {
  if (!category) return undefined;
  return (DANGER_CATEGORY_TO_SETTING as Record<string, keyof SafeModeSettings | undefined>)[category];
}

export async function setSafeModeCategoryConfirmation(
  category: string,
  enabled: boolean,
  target: vscode.ConfigurationTarget = vscode.ConfigurationTarget.Workspace
): Promise<boolean> {
  const key = getSafeModeSettingKeyByCategory(category);
  if (!key) {
    return false;
  }
  await getConfig().update(`safeMode.${key}`, enabled, target);
  return true;
}
