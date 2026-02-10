/**
 * AI Settings Service
 * 讀寫 AI 設定檔（configs/ai-settings.json）
 */

import fs from 'fs';
import path from 'path';

export interface TaskModels {
  [task: string]: string;
}

export interface BlueMonsterSettings {
  agentMode: 'chat' | 'agent' | 'agent-full';
  defaultModel: string;
  reasoningEffort: 'low' | 'medium' | 'high' | 'extra-high';
  taskModels: TaskModels;
  systemPrompt: string;
}

export interface UfoSettings {
  chatModel: string;
  specModel: string;
  opusModel: string;
  systemPrompt: string;
}

export interface AISettings {
  blueMonster: BlueMonsterSettings;
  ufo: UfoSettings;
}

const DEFAULT_SETTINGS: AISettings = {
  blueMonster: {
    agentMode: 'agent-full',
    defaultModel: 'gemini-3-pro-preview',
    reasoningEffort: 'medium',
    taskModels: {
      coding: 'gemini-3-pro-preview',
      planning: 'gemini-3-pro-preview',
      review: 'gemini-3-pro-preview',
      documentation: 'gemini-3-pro-preview',
      debugging: 'gemini-3-pro-preview',
      refactoring: 'gemini-3-pro-preview',
      testing: 'gemini-3-pro-preview',
    },
    systemPrompt: '',
  },
  ufo: {
    chatModel: 'gemini-3-pro-preview',
    specModel: 'gemini-3-pro-preview',
    opusModel: 'gemini-3-pro-preview',
    systemPrompt: '',
  },
};

function findConfigPath(): string {
  const candidates = [
    path.join(process.cwd(), 'configs', 'ai-settings.json'),
    path.join(process.cwd(), '..', '..', 'configs', 'ai-settings.json'),
    path.join(__dirname, '..', '..', 'configs', 'ai-settings.json'),
    path.join(__dirname, '..', '..', '..', '..', 'configs', 'ai-settings.json'),
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }

  // 如果都找不到，用第一個候選路徑建立
  const defaultPath = candidates[0];
  fs.mkdirSync(path.dirname(defaultPath), { recursive: true });
  fs.writeFileSync(defaultPath, JSON.stringify(DEFAULT_SETTINGS, null, 2));
  return defaultPath;
}

export function loadAISettings(): AISettings {
  try {
    const configPath = findConfigPath();
    const raw = fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw);
    return {
      blueMonster: { ...DEFAULT_SETTINGS.blueMonster, ...parsed.blueMonster },
      ufo: { ...DEFAULT_SETTINGS.ufo, ...parsed.ufo },
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveAISettings(settings: AISettings): void {
  const configPath = findConfigPath();
  fs.writeFileSync(configPath, JSON.stringify(settings, null, 2));
}

export const AVAILABLE_MODELS = [
  // Display-focused list used by Control Center / Mission Control.
  // The "multiplier" is a relative request consumption indicator (e.g. 0x, 1x, 3x).
  { id: 'gpt-4.1', label: 'GPT-4.1', provider: 'OpenAI', multiplier: '0x' },
  { id: 'gpt-5-mini', label: 'GPT-5 mini', provider: 'OpenAI', multiplier: '0x' },
  { id: 'claude-haiku-4.5', label: 'Claude Haiku 4.5', provider: 'Anthropic', multiplier: '0.33x' },
  { id: 'claude-opus-4.5', label: 'Claude Opus 4.5', provider: 'Anthropic', multiplier: '3x' },
  { id: 'claude-opus-4.6', label: 'Claude Opus 4.6', provider: 'Anthropic', multiplier: '3x' },
  { id: 'claude-sonnet-4.5', label: 'Claude Sonnet 4.5', provider: 'Anthropic', multiplier: '1x' },
  { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash (Preview)', provider: 'Google', multiplier: '0.33x' },
  { id: 'gemini-3-pro-preview', label: 'Gemini 3 Pro (Preview)', provider: 'Google', multiplier: '1x' },
  { id: 'gpt-5.2', label: 'GPT-5.2', provider: 'OpenAI', multiplier: '1x' },
  { id: 'gpt-5.2-codex', label: 'GPT-5.2-Codex', provider: 'OpenAI', multiplier: '1x' },
];

export const TASK_TYPES = [
  { id: 'coding', label: 'Coding', desc: '撰寫程式碼' },
  { id: 'planning', label: 'Planning', desc: '架構規劃' },
  { id: 'review', label: 'Code Review', desc: '程式碼審查' },
  { id: 'documentation', label: 'Documentation', desc: '撰寫文件' },
  { id: 'debugging', label: 'Debugging', desc: '除錯修復' },
  { id: 'refactoring', label: 'Refactoring', desc: '重構優化' },
  { id: 'testing', label: 'Testing', desc: '測試驗證' },
];
