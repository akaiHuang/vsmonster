'use client';

import { Header } from '@/components/layout/Header';
import { useState, useEffect, useCallback } from 'react';

const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL || 'http://localhost:3000';

/* ─── types (mirrors gateway service) ─── */
interface TaskModels {
  [task: string]: string;
}

interface BlueMonsterSettings {
  agentMode: 'chat' | 'agent' | 'agent-full';
  defaultModel: string;
  reasoningEffort: 'low' | 'medium' | 'high' | 'extra-high';
  taskModels: TaskModels;
  systemPrompt: string;
}

interface UfoSettings {
  chatModel: string;
  specModel: string;
  opusModel: string;
  systemPrompt: string;
}

interface AISettings {
  blueMonster: BlueMonsterSettings;
  ufo: UfoSettings;
}

interface ModelInfo {
  id: string;
  label: string;
  provider: string;
  multiplier?: string;
}

interface TaskType {
  id: string;
  label: string;
  desc: string;
}

type TabId = 'bluemonster' | 'ufo';

const tabs: { id: TabId; label: string; emoji: string }[] = [
  { id: 'bluemonster', label: 'BlueMonster', emoji: '🔵' },
  { id: 'ufo', label: 'UFO', emoji: '👾' },
];

/* ─── helpers ─── */
function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  const colorMap: Record<string, string> = {
    green: 'bg-green-500/20 text-green-400',
    amber: 'bg-amber-500/20 text-amber-400',
    purple: 'bg-monster-500/20 text-monster-400',
    cyan: 'bg-cyan-500/20 text-cyan-400',
    gray: 'bg-gray-500/20 text-gray-400',
    red: 'bg-red-500/20 text-red-400',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colorMap[color] ?? colorMap.gray}`}>
      {children}
    </span>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  description,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  description?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-gray-300">{label}</label>
      {description && <p className="text-xs text-gray-500">{description}</p>}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-monster-500 transition-colors"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}

function ModelSelect({
  label,
  value,
  onChange,
  models,
  description,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  models: ModelInfo[];
  description?: string;
}) {
  const grouped = models.reduce<Record<string, ModelInfo[]>>((acc, m) => {
    (acc[m.provider] ??= []).push(m);
    return acc;
  }, {});

  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-gray-300">{label}</label>
      {description && <p className="text-xs text-gray-500">{description}</p>}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-monster-500 transition-colors"
      >
        {Object.entries(grouped).map(([provider, providerModels]) => (
          <optgroup key={provider} label={provider}>
            {providerModels.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}{m.multiplier ? ` (${m.multiplier})` : ''}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  );
}

/* ─── BlueMonster Panel ─── */
function BlueMonsterPanel({
  settings,
  models,
  taskTypes,
  onChange,
}: {
  settings: BlueMonsterSettings;
  models: ModelInfo[];
  taskTypes: TaskType[];
  onChange: (s: BlueMonsterSettings) => void;
}) {
  const update = (patch: Partial<BlueMonsterSettings>) => onChange({ ...settings, ...patch });
  const updateTaskModel = (taskId: string, modelId: string) => {
    onChange({ ...settings, taskModels: { ...settings.taskModels, [taskId]: modelId } });
  };

  return (
    <div className="space-y-6">
      {/* General Settings */}
      <div className="bg-dark-card border border-dark-border rounded-xl p-6">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-4">General Settings</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <SelectField
            label="Agent Mode"
            value={settings.agentMode}
            onChange={(v) => update({ agentMode: v as BlueMonsterSettings['agentMode'] })}
            options={[
              { value: 'chat', label: 'Chat (Plan only)' },
              { value: 'agent', label: 'Agent (Safe)' },
              { value: 'agent-full', label: 'Agent-Full (Dangerous)' },
            ]}
            description="Controls terminal execution permissions"
          />
          <ModelSelect
            label="Default Model"
            value={settings.defaultModel}
            onChange={(v) => update({ defaultModel: v })}
            models={models}
            description="Fallback model for unspecified tasks"
          />
          <SelectField
            label="Reasoning Effort"
            value={settings.reasoningEffort}
            onChange={(v) => update({ reasoningEffort: v as BlueMonsterSettings['reasoningEffort'] })}
            options={[
              { value: 'low', label: 'Low' },
              { value: 'medium', label: 'Medium' },
              { value: 'high', label: 'High' },
              { value: 'extra-high', label: 'Extra High' },
            ]}
            description="Depth of analysis per request"
          />
        </div>
      </div>

      {/* Task-Specific Models */}
      <div className="bg-dark-card border border-dark-border rounded-xl p-6">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-4">Task-Specific Models</h3>
        <p className="text-xs text-gray-500 mb-4">Assign different models to different task types for optimal cost/performance balance.</p>
        <div className="space-y-3">
          {taskTypes.map((task) => (
            <div key={task.id} className="flex items-center gap-4 bg-dark-bg rounded-lg px-4 py-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-300">{task.label}</div>
                <div className="text-xs text-gray-500">{task.desc}</div>
              </div>
              <div className="w-48">
                <select
                  value={settings.taskModels[task.id] || settings.defaultModel}
                  onChange={(e) => updateTaskModel(task.id, e.target.value)}
                  className="w-full bg-dark-card border border-dark-border rounded-lg px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-monster-500 transition-colors"
                >
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </select>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* System Prompt */}
      <div className="bg-dark-card border border-dark-border rounded-xl p-6">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-4">System Prompt</h3>
        <p className="text-xs text-gray-500 mb-3">Additional instructions appended to BlueMonster's base prompt.</p>
        <textarea
          value={settings.systemPrompt}
          onChange={(e) => update({ systemPrompt: e.target.value })}
          rows={6}
          placeholder="Enter custom system prompt..."
          className="w-full bg-dark-bg border border-dark-border rounded-lg px-4 py-3 text-sm text-gray-200 font-mono resize-y focus:outline-none focus:border-monster-500 transition-colors placeholder-gray-600"
        />
      </div>
    </div>
  );
}

/* ─── UFO Panel ─── */
function UfoPanel({
  settings,
  models,
  onChange,
}: {
  settings: UfoSettings;
  models: ModelInfo[];
  onChange: (s: UfoSettings) => void;
}) {
  const update = (patch: Partial<UfoSettings>) => onChange({ ...settings, ...patch });

  return (
    <div className="space-y-6">
      {/* Model Configuration */}
      <div className="bg-dark-card border border-dark-border rounded-xl p-6">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-4">Model Configuration</h3>
        <p className="text-xs text-gray-500 mb-4">UFO uses a three-tier model strategy for different stages of processing.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <ModelSelect
            label="Chat Model"
            value={settings.chatModel}
            onChange={(v) => update({ chatModel: v })}
            models={models}
            description="General conversation and quick responses"
          />
          <ModelSelect
            label="Spec Model"
            value={settings.specModel}
            onChange={(v) => update({ specModel: v })}
            models={models}
            description="Task analysis and spec generation"
          />
          <ModelSelect
            label="Opus Model"
            value={settings.opusModel}
            onChange={(v) => update({ opusModel: v })}
            models={models}
            description="Deep refinement and complex reasoning"
          />
        </div>
      </div>

      {/* System Prompt */}
      <div className="bg-dark-card border border-dark-border rounded-xl p-6">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-4">System Prompt</h3>
        <p className="text-xs text-gray-500 mb-3">Additional instructions appended to UFO's base prompt.</p>
        <textarea
          value={settings.systemPrompt}
          onChange={(e) => update({ systemPrompt: e.target.value })}
          rows={6}
          placeholder="Enter custom system prompt..."
          className="w-full bg-dark-bg border border-dark-border rounded-lg px-4 py-3 text-sm text-gray-200 font-mono resize-y focus:outline-none focus:border-monster-500 transition-colors placeholder-gray-600"
        />
      </div>
    </div>
  );
}

/* ─── main page ─── */
export default function AISettingsPage() {
  const [activeTab, setActiveTab] = useState<TabId>('bluemonster');
  const [settings, setSettings] = useState<AISettings | null>(null);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [taskTypes, setTaskTypes] = useState<TaskType[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  // Load settings + models
  useEffect(() => {
    Promise.all([
      fetch(`${GATEWAY_URL}/api/ai-settings`).then((r) => r.json()),
      fetch(`${GATEWAY_URL}/api/ai-settings/models`).then((r) => r.json()),
    ])
      .then(([settingsData, modelsData]) => {
        setSettings(settingsData);
        setModels(modelsData.models || []);
        setTaskTypes(modelsData.taskTypes || []);
        setLoading(false);
      })
      .catch((err) => {
        setError(`Failed to load settings: ${err.message}`);
        setLoading(false);
      });
  }, []);

  // Save handler
  const save = useCallback(async () => {
    if (!settings) return;
    setSaving(true);
    setSaveStatus('idle');
    try {
      const res = await fetch(`${GATEWAY_URL}/api/ai-settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (data.success) {
        setSettings(data.settings);
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
      } else {
        setSaveStatus('error');
      }
    } catch {
      setSaveStatus('error');
    } finally {
      setSaving(false);
    }
  }, [settings]);

  if (loading) {
    return (
      <div className="min-h-screen bg-dark-bg">
        <Header />
        <main className="container mx-auto px-4 py-6 max-w-5xl">
          <div className="flex items-center justify-center py-20">
            <div className="text-gray-400 text-sm">Loading AI settings...</div>
          </div>
        </main>
      </div>
    );
  }

  if (error || !settings) {
    return (
      <div className="min-h-screen bg-dark-bg">
        <Header />
        <main className="container mx-auto px-4 py-6 max-w-5xl">
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6 text-center">
            <p className="text-red-400 text-sm">{error || 'Failed to load settings'}</p>
            <p className="text-gray-500 text-xs mt-2">Make sure Gateway is running on {GATEWAY_URL}</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dark-bg">
      <Header />

      <main className="container mx-auto px-4 py-6 max-w-5xl">
        {/* Title + Save */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold mb-1">AI Settings</h1>
            <p className="text-sm text-gray-400">Manage BlueMonster and UFO model configurations and prompts</p>
          </div>
          <div className="flex items-center gap-3">
            {saveStatus === 'saved' && <Badge color="green">Saved</Badge>}
            {saveStatus === 'error' && <Badge color="red">Save failed</Badge>}
            <button
              onClick={save}
              disabled={saving}
              className="px-5 py-2 bg-monster-500 hover:bg-monster-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-dark-card border border-dark-border rounded-lg p-1 w-fit">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${
                activeTab === tab.id
                  ? 'bg-monster-500 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-dark-hover'
              }`}
            >
              <span>{tab.emoji}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === 'bluemonster' && (
          <BlueMonsterPanel
            settings={settings.blueMonster}
            models={models}
            taskTypes={taskTypes}
            onChange={(bm) => setSettings({ ...settings, blueMonster: bm })}
          />
        )}
        {activeTab === 'ufo' && (
          <UfoPanel
            settings={settings.ufo}
            models={models}
            onChange={(ufo) => setSettings({ ...settings, ufo })}
          />
        )}
      </main>
    </div>
  );
}
