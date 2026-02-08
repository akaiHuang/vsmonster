import * as vscode from "vscode";

interface DashboardState {
  connected: boolean;
  connectionState: "connected" | "reconnecting" | "disconnected";
  gatewayUrl: string;
  gatewayHttpUrl: string;
  publicUrl: string;
  envAutoSync: boolean;
  tasksRoot: string;
  tasks: {
    pending: number;
    approved: number;
    inProgress: number;
    done: number;
    total: number;
  };
  blueMonsterTasks: {
    count: number;
    recent: Array<{ taskId: string; updatedAt: number }>;
  };
  taskItems: Array<{
    taskId: string;
    title: string;
    status: "pending" | "approved" | "in-progress" | "done";
    taskDir: string;
    agentName?: string;
    agentEmoji?: string;
    createdAt: number;
    updatedAt: number;
  }>;
  models: {
    chat: string;
    spec: string;
    opus: string;
  };
  channels: {
    line: boolean;
    telegram: boolean;
    discord: boolean;
  };
  lastUpdated: string;
}

export function getDashboardHtml(
  webview: vscode.Webview,
  state: DashboardState,
  extensionUri: vscode.Uri
): string {
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "media", "dashboard.js")
  );

  return `<!doctype html>
<html lang="zh-Hant">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>UFO Dashboard</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #0f0f0f;
        --card: #1a1a1a;
        --border: #2a2a2a;
        --hover: #252525;
        --monster: #8b5cf6;
        --monster-dim: #7c3aed;
        --monster-light: #a78bfa;
        --cyan: #06b6d4;
        --green: #22c55e;
        --amber: #f59e0b;
        --red: #ef4444;
        --gray: #6b7280;
        --text: #ffffff;
        --text-2: #d1d5db;
        --text-3: #9ca3af;
        --text-4: #6b7280;
      }

      * { box-sizing: border-box; margin: 0; padding: 0; }

      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        background: var(--bg);
        color: var(--text);
        padding: 12px;
        font-size: 13px;
        -webkit-font-smoothing: antialiased;
      }

      /* Header */
      .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 12px;
        padding-bottom: 12px;
        border-bottom: 1px solid var(--border);
      }
      .header-title {
        font-size: 15px;
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .status-pill {
        padding: 3px 10px;
        font-size: 11px;
        font-weight: 600;
        border-radius: 12px;
        letter-spacing: 0.3px;
      }
      .status-pill.connected { color: var(--green); background: rgba(34,197,94,0.15); }
      .status-pill.reconnecting { color: var(--amber); background: rgba(245,158,11,0.15); }
      .status-pill.disconnected { color: var(--red); background: rgba(239,68,68,0.15); }

      /* Tab Bar */
      .tab-bar {
        display: flex;
        gap: 2px;
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: 8px;
        padding: 3px;
        margin-bottom: 12px;
      }
      .tab {
        flex: 1;
        padding: 6px 4px;
        font-size: 11px;
        font-weight: 500;
        background: none;
        border: none;
        border-radius: 6px;
        color: var(--text-3);
        cursor: pointer;
        transition: all 0.15s;
        font-family: inherit;
      }
      .tab:hover { color: var(--text); background: var(--hover); }
      .tab.active { color: var(--text); background: var(--monster); }

      /* Tab Content */
      .tab-content { display: none; }
      .tab-content.active { display: block; }

      /* Cards */
      .card {
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 16px;
        margin-bottom: 10px;
      }
      .card-header {
        font-size: 11px;
        font-weight: 600;
        color: var(--text-2);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        margin-bottom: 12px;
      }

      /* Stats Grid */
      .stats-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
        margin-bottom: 10px;
      }
      .stat-box {
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: 8px;
        padding: 10px 12px;
        text-align: center;
      }
      .stat-value {
        font-size: 20px;
        font-weight: 700;
        color: var(--text);
      }
      .stat-label {
        font-size: 10px;
        color: var(--text-4);
        margin-top: 2px;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      /* Action Buttons */
      .actions-grid {
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        gap: 6px;
      }
      .action-btn {
        padding: 8px 4px;
        font-size: 11px;
        font-weight: 500;
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: 8px;
        color: var(--text-2);
        cursor: pointer;
        transition: all 0.15s;
        font-family: inherit;
        text-align: center;
      }
      .action-btn:hover { border-color: var(--monster); color: var(--text); background: var(--hover); }

      /* List rows */
      .list-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 0;
        border-bottom: 1px solid var(--border);
      }
      .list-row:last-child { border-bottom: none; }
      .list-label {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 13px;
        color: var(--text-2);
      }
      .status-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        flex-shrink: 0;
      }

      /* Badges */
      .badge {
        padding: 2px 8px;
        font-size: 10px;
        font-weight: 600;
        border-radius: 4px;
        letter-spacing: 0.3px;
      }
      .badge-green { color: #4ade80; background: rgba(34,197,94,0.2); }
      .badge-red { color: #f87171; background: rgba(239,68,68,0.2); }
      .badge-amber { color: #fbbf24; background: rgba(245,158,11,0.2); }
      .badge-gray { color: #9ca3af; background: rgba(107,114,128,0.2); }
      .badge-purple { color: var(--monster-light); background: rgba(139,92,246,0.2); }
      .badge-cyan { color: #22d3ee; background: rgba(6,182,212,0.2); }

      .count-badge {
        font-size: 14px;
        font-weight: 700;
        color: var(--text);
      }

      .muted { font-size: 11px; color: var(--text-4); }
      .url-text {
        font-size: 11px;
        color: var(--text-4);
        word-break: break-all;
        margin-top: 2px;
      }

      /* Form elements (Settings tab) */
      .field { margin-bottom: 14px; }
      .field-label {
        display: block;
        font-size: 12px;
        font-weight: 500;
        color: var(--text-2);
        margin-bottom: 4px;
      }
      .field-desc {
        font-size: 11px;
        color: var(--text-4);
        margin-bottom: 6px;
      }
      .select, .textarea {
        width: 100%;
        padding: 8px 10px;
        font-size: 12px;
        background: var(--bg);
        border: 1px solid var(--border);
        border-radius: 8px;
        color: var(--text);
        font-family: inherit;
        outline: none;
        transition: border-color 0.15s;
      }
      .select:focus, .textarea:focus { border-color: var(--monster); }
      .textarea {
        min-height: 80px;
        resize: vertical;
        font-family: 'SF Mono', Monaco, 'Courier New', monospace;
        font-size: 12px;
      }
      option, optgroup { background: var(--card); color: var(--text); }

      .btn-primary {
        width: 100%;
        padding: 10px;
        font-size: 13px;
        font-weight: 600;
        background: var(--monster);
        border: none;
        border-radius: 8px;
        color: var(--text);
        cursor: pointer;
        transition: all 0.15s;
        font-family: inherit;
      }
      .btn-primary:hover { background: var(--monster-dim); }
      .btn-primary:disabled { opacity: 0.5; cursor: default; }

      .save-status {
        display: inline-block;
        margin-left: 8px;
        font-size: 12px;
        font-weight: 500;
      }
      .save-status.saved { color: var(--green); }
      .save-status.error { color: var(--red); }

      /* Footer */
      .footer {
        margin-top: 12px;
        padding-top: 8px;
        border-top: 1px solid var(--border);
        font-size: 10px;
        color: var(--text-4);
        text-align: center;
      }

      /* Sub-tabs (Settings BlueMonster/UFO) */
      .sub-tab-bar {
        display: flex;
        gap: 2px;
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: 8px;
        padding: 3px;
        margin-bottom: 12px;
      }
      .sub-tab {
        flex: 1;
        padding: 7px 8px;
        font-size: 12px;
        font-weight: 500;
        background: none;
        border: none;
        border-radius: 6px;
        color: var(--text-3);
        cursor: pointer;
        transition: all 0.15s;
        font-family: inherit;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
      }
      .sub-tab:hover { color: var(--text); background: var(--hover); }
      .sub-tab.active { color: var(--text); background: var(--monster); }
      .sub-panel { display: none; }
      .sub-panel.active { display: block; }

      /* Task model row */
      .task-model-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 8px 0;
        border-bottom: 1px solid var(--border);
      }
      .task-model-row:last-child { border-bottom: none; }
      .task-model-info { flex: 1; min-width: 0; }
      .task-model-name { font-size: 12px; font-weight: 500; color: var(--text-2); }
      .task-model-desc { font-size: 10px; color: var(--text-4); }
      .task-model-row .select { width: 130px; flex-shrink: 0; font-size: 11px; padding: 6px 8px; }

      /* Loading / Error */
      .loading { text-align: center; padding: 24px 0; color: var(--text-3); }
      .error-msg { text-align: center; padding: 16px; color: var(--red); font-size: 12px; }

      /* Console tab */
      .console-toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 8px;
      }
      .console-toolbar-title {
        font-size: 11px;
        font-weight: 600;
        color: var(--text-2);
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }
      .console-toolbar-btn {
        padding: 4px 10px;
        font-size: 10px;
        font-weight: 500;
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: 6px;
        color: var(--text-3);
        cursor: pointer;
        font-family: inherit;
        transition: all 0.15s;
      }
      .console-toolbar-btn:hover { color: var(--text); border-color: var(--monster); }
      .console-log {
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: 8px;
        height: calc(100vh - 140px);
        overflow-y: auto;
        padding: 8px;
        font-family: 'SF Mono', Monaco, 'Courier New', monospace;
        font-size: 11px;
        line-height: 1.6;
      }
      .console-log::-webkit-scrollbar { width: 6px; }
      .console-log::-webkit-scrollbar-track { background: transparent; }
      .console-log::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
      .log-entry {
        padding: 2px 4px;
        border-radius: 3px;
        white-space: pre-wrap;
        word-break: break-all;
      }
      .log-entry:hover { background: var(--hover); }
      .log-time { color: var(--text-4); margin-right: 6px; }
      .log-tag { font-weight: 600; margin-right: 6px; }
      .log-tag.thinking { color: var(--monster-light); }
      .log-tag.tool { color: var(--cyan); }
      .log-tag.response { color: var(--green); }
      .log-tag.error { color: var(--red); }
      .log-tag.info { color: var(--amber); }
      .log-tag.intent { color: var(--monster); }
      .log-msg { color: var(--text-2); }
      .console-empty {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100%;
        color: var(--text-4);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 12px;
      }

      /* Task Interview Modal */
      .modal {
        position: fixed;
        inset: 0;
        z-index: 50;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .modal[hidden] { display: none; }
      .modal-backdrop {
        position: absolute;
        inset: 0;
        background: rgba(0,0,0,0.55);
      }
      .modal-card {
        position: relative;
        width: min(720px, calc(100vw - 24px));
        height: min(560px, calc(100vh - 24px));
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: 10px;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        box-shadow: 0 18px 60px rgba(0,0,0,0.55);
      }
      .modal-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 12px;
        border-bottom: 1px solid var(--border);
      }
      .modal-title {
        font-size: 12px;
        font-weight: 600;
        color: var(--text-2);
      }
      .modal-close {
        background: none;
        border: 1px solid var(--border);
        color: var(--text-3);
        border-radius: 8px;
        padding: 4px 8px;
        cursor: pointer;
        font-size: 11px;
      }
      .modal-close:hover { border-color: var(--monster); color: var(--text); }
      .modal-body {
        flex: 1;
        overflow: auto;
        padding: 12px;
      }
      .chat-msg {
        display: flex;
        gap: 8px;
        margin-bottom: 10px;
      }
      .chat-msg.user { justify-content: flex-end; }
      .chat-bubble {
        max-width: 85%;
        padding: 10px 10px;
        border-radius: 10px;
        border: 1px solid var(--border);
        background: #141414;
        color: var(--text-2);
        font-size: 12px;
        line-height: 1.4;
        white-space: pre-wrap;
        word-break: break-word;
      }
      .chat-msg.user .chat-bubble {
        background: rgba(139,92,246,0.12);
        border-color: rgba(139,92,246,0.35);
        color: var(--text);
      }
      .modal-footer {
        border-top: 1px solid var(--border);
        padding: 10px 12px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        align-items: stretch;
      }
      .modal-steps {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        align-items: center;
        color: var(--text-3);
        font-size: 11px;
      }
      .modal-step {
        display: inline-flex;
        gap: 6px;
        align-items: center;
        padding: 4px 8px;
        border: 1px solid var(--border);
        border-radius: 999px;
        background: rgba(255,255,255,0.03);
      }
      .modal-step-num {
        width: 16px;
        height: 16px;
        border-radius: 999px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 10px;
        font-weight: 700;
        color: var(--text);
        background: rgba(139,92,246,0.22);
        border: 1px solid rgba(139,92,246,0.35);
        position: relative;
        overflow: hidden;
      }
      .modal-step-num .num { display: inline-block; }
      .modal-step-num svg {
        position: absolute;
        inset: 0;
        width: 16px;
        height: 16px;
        padding: 2px;
        opacity: 0;
      }
      .modal-step.done .modal-step-num .num { opacity: 0; }
      .modal-step.done .modal-step-num svg { opacity: 1; }
      .modal-step.done .modal-step-num path {
        stroke-dasharray: 30;
        stroke-dashoffset: 30;
        animation: dash 0.45s ease-out forwards;
      }
      @keyframes dash { to { stroke-dashoffset: 0; } }
      }
      .modal-input-row {
        display: flex;
        gap: 8px;
        align-items: center;
      }
      .modal-input {
        flex: 1;
        display: flex;
        gap: 8px;
        align-items: center;
      }
      .modal-input input {
        width: 100%;
        padding: 8px 10px;
        border-radius: 8px;
        border: 1px solid var(--border);
        background: #101010;
        color: var(--text);
        outline: none;
        font-size: 12px;
      }
      .modal-input input:focus { border-color: var(--monster); }
      .btn {
        padding: 8px 10px;
        border-radius: 8px;
        border: 1px solid var(--border);
        background: transparent;
        color: var(--text-2);
        cursor: pointer;
        font-size: 11px;
        white-space: nowrap;
      }
      .btn:hover { border-color: var(--monster); color: var(--text); background: var(--hover); }
      .btn.primary { background: rgba(139,92,246,0.18); border-color: rgba(139,92,246,0.35); color: var(--text); }
      .btn.primary:hover { background: rgba(139,92,246,0.26); }
      .btn[disabled] { opacity: 0.5; cursor: not-allowed; }

      .modal-actions {
        display: flex;
        gap: 8px;
        align-items: center;
        justify-content: flex-start;
      }
      .modal-working {
        display: inline-flex;
        gap: 8px;
        align-items: center;
        color: var(--text-3);
        font-size: 11px;
      }
      /* 'hidden' attribute can be overridden by class styles, so restate it. */
      .modal-working[hidden] { display: none; }
      .spinner {
        width: 12px;
        height: 12px;
        border-radius: 50%;
        border: 2px solid rgba(255,255,255,0.15);
        border-top-color: var(--monster);
        animation: spin 0.9s linear infinite;
      }
      @keyframes spin { to { transform: rotate(360deg); } }

      /* Tasks tab - cards */
      .task-sections { margin-top: 10px; }
      .task-section {
        margin-top: 10px;
        border: 1px solid var(--border);
        border-radius: 10px;
        overflow: hidden;
        background: var(--card);
      }
      .task-section-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 12px;
        cursor: pointer;
        user-select: none;
        border-bottom: 1px solid var(--border);
        background: rgba(255,255,255,0.02);
      }
      .task-section-header:hover { background: var(--hover); }
      .task-section-title {
        display: inline-flex;
        gap: 8px;
        align-items: center;
        font-size: 12px;
        font-weight: 600;
        color: var(--text-2);
      }
      .chev {
        width: 10px;
        height: 10px;
        border-right: 2px solid var(--text-4);
        border-bottom: 2px solid var(--text-4);
        transform: rotate(-45deg);
        transition: transform 0.15s;
      }
      .task-section[data-open="true"] .chev { transform: rotate(45deg); }
      .task-cards { padding: 10px 12px; display: none; }
      .task-section[data-open="true"] .task-cards { display: block; }
      .task-card {
        position: relative;
        border: 1px solid var(--border);
        border-radius: 10px;
        padding: 10px 10px;
        background: #141414;
        margin-bottom: 10px;
        cursor: pointer;
      }
      .task-card:last-child { margin-bottom: 0; }
      .task-card-title { font-size: 12px; font-weight: 600; color: var(--text); margin-bottom: 4px; padding-right: 22px; }
      .task-card-sub { font-size: 10px; color: var(--text-4); padding-right: 22px; }
      .task-card-meta { font-size: 10px; color: var(--text-4); word-break: break-all; display: none; }
      .task-card-actions { margin-top: 8px; display: none; gap: 8px; flex-wrap: wrap; }
      .task-card[data-open="true"] .task-card-meta { display: block; }
      .task-card[data-open="true"] .task-card-actions { display: flex; }
      .task-card:hover { border-color: rgba(139,92,246,0.35); }
      .task-status-light {
        position: absolute;
        top: 10px;
        right: 10px;
        width: 10px;
        height: 10px;
        border-radius: 50%;
        box-shadow: 0 0 10px rgba(34,197,94,0.55);
        background: var(--green);
      }
      .task-status-light.pending { background: var(--gray); box-shadow: 0 0 10px rgba(107,114,128,0.45); }
      .task-status-light.approved { background: var(--monster); box-shadow: 0 0 10px rgba(139,92,246,0.55); }
      .task-status-light.running { background: var(--cyan); box-shadow: 0 0 10px rgba(6,182,212,0.55); }
      .task-status-light.done { background: var(--green); box-shadow: 0 0 10px rgba(34,197,94,0.55); }
    </style>
  </head>
  <body>
    <!-- Header -->
    <div class="header">
      <div class="header-title">
        <span>👾</span> UFO
      </div>
      <div class="status-pill ${state.connectionState}" id="gatewayStatus">
        ${state.connectionState === "connected" ? "Online" : state.connectionState === "reconnecting" ? "Syncing..." : "Offline"}
      </div>
    </div>

    <!-- Tab Bar -->
    <div class="tab-bar">
      <button class="tab active" data-tab="overview">Overview</button>
      <button class="tab" data-tab="tasks">Tasks</button>
      <button class="tab" data-tab="console">Console</button>
      <button class="tab" data-tab="settings">Settings</button>
      <button class="tab" data-tab="channels">Channels</button>
    </div>

    <!-- Overview Tab -->
    <div id="tab-overview" class="tab-content active">
      <div class="card">
        <div class="card-header">Connection</div>
        <div class="list-row">
          <span class="list-label">Gateway</span>
          <span class="badge ${state.connectionState === "connected" ? "badge-green" : "badge-red"}" id="gatewayBadge">
            ${state.connectionState === "connected" ? "OK" : state.connectionState === "reconnecting" ? "WAIT" : "DOWN"}
          </span>
        </div>
        <div class="url-text" id="gatewayUrlText">${state.gatewayUrl}</div>
        <div class="list-row" style="margin-top: 4px">
          <span class="list-label">Public URL</span>
          <span class="badge ${state.publicUrl ? "badge-green" : "badge-gray"}" id="publicUrlBadge">${state.publicUrl ? "SET" : "NONE"}</span>
        </div>
        <div class="url-text" id="publicUrlText">${state.publicUrl || "\u2014"}</div>
      </div>

      <div class="stats-grid">
        <div class="stat-box">
          <div class="stat-value" id="statPending">${state.tasks.pending}</div>
          <div class="stat-label">Pending</div>
        </div>
        <div class="stat-box">
          <div class="stat-value" id="statRunning" style="color: var(--cyan)">${state.tasks.inProgress}</div>
          <div class="stat-label">Running</div>
        </div>
        <div class="stat-box">
          <div class="stat-value" id="statDone" style="color: var(--green)">${state.tasks.done}</div>
          <div class="stat-label">Done</div>
        </div>
        <div class="stat-box">
          <div class="stat-value" id="statTotal">${state.tasks.total}</div>
          <div class="stat-label">Total</div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">Quick Actions</div>
        <div class="actions-grid">
          <button class="action-btn" data-command="ufo.createTaskSpec">+ Task</button>
          <button class="action-btn" data-command="ufo.refreshQueue">Refresh</button>
          <button class="action-btn" data-command="ufo.openTools">Tools</button>
          <button class="action-btn" data-command="ufo.openTasksRoot">Folder</button>
          <button class="action-btn" data-command="ufo.openSettings">Config</button>
          <button class="action-btn" data-command="ufo.syncEnv">Sync</button>
        </div>
      </div>
    </div>

    <!-- Tasks Tab -->
    <div id="tab-tasks" class="tab-content">
      <div class="card">
        <div class="card-header">Task Summary</div>
        <div class="list-row">
          <span class="list-label"><span class="status-dot" style="background:var(--gray)"></span> Pending</span>
          <span class="count-badge" id="countPending">${state.tasks.pending}</span>
        </div>
        <div class="list-row">
          <span class="list-label"><span class="status-dot" style="background:var(--monster)"></span> Approved</span>
          <span class="count-badge" id="countApproved">${state.tasks.approved}</span>
        </div>
        <div class="list-row">
          <span class="list-label"><span class="status-dot" style="background:var(--cyan)"></span> Running</span>
          <span class="count-badge" id="countProgress">${state.tasks.inProgress}</span>
        </div>
        <div class="list-row" style="border-bottom: none; padding-bottom: 10px">
          <span class="list-label"><span class="status-dot" style="background:var(--green)"></span> Done</span>
          <span class="count-badge" id="countDone">${state.tasks.done}</span>
        </div>
        <div class="list-row" style="border-top: 1px solid var(--border); margin-top: 4px; padding-top: 10px">
          <span class="list-label" style="font-weight: 600">Total</span>
          <span class="count-badge" id="countTotal">${state.tasks.total}</span>
        </div>
      </div>
      <div class="muted" id="tasksRoot" style="margin-top: 4px">${state.tasksRoot}</div>
      <div class="card" style="margin-top: 10px">
        <div class="card-header">BlueMonster Tasks</div>
        <div class="list-row">
          <span class="list-label">Total</span>
          <span class="count-badge" id="bmCount">${state.blueMonsterTasks.count}</span>
        </div>
        <div class="muted" id="bmRecent" style="margin-top: 6px; white-space: pre-wrap"></div>
      </div>
      <div class="task-sections" id="taskSections"></div>
    </div>

    <!-- Console Tab -->
    <div id="tab-console" class="tab-content">
      <div class="console-toolbar">
        <span class="console-toolbar-title">UFO Output</span>
        <button class="console-toolbar-btn" id="consoleClearBtn">Clear</button>
      </div>
      <div class="console-log" id="consoleLog">
        <div class="console-empty" id="consoleEmpty">Waiting for UFO activity...</div>
      </div>
    </div>

    <!-- Settings Tab -->
    <div id="tab-settings" class="tab-content">
      <div id="settingsContent">
        <div class="loading" id="settingsLoading">Loading settings...</div>
      </div>
    </div>

    <!-- Channels Tab -->
    <div id="tab-channels" class="tab-content">
      <div class="card">
        <div class="card-header">Channel Status</div>
        <div class="list-row">
          <span class="list-label">LINE</span>
          <span class="badge ${state.channels.line ? "badge-green" : "badge-gray"}" id="channelLine">${state.channels.line ? "READY" : "NONE"}</span>
        </div>
        <div class="list-row">
          <span class="list-label">Telegram</span>
          <span class="badge ${state.channels.telegram ? "badge-green" : "badge-gray"}" id="channelTelegram">${state.channels.telegram ? "READY" : "NONE"}</span>
        </div>
        <div class="list-row">
          <span class="list-label">Discord</span>
          <span class="badge ${state.channels.discord ? "badge-green" : "badge-gray"}" id="channelDiscord">${state.channels.discord ? "READY" : "NONE"}</span>
        </div>
      </div>

      <div class="card">
        <div class="card-header">Details</div>
        <div class="list-row">
          <span class="list-label">Auto-Sync</span>
          <span class="badge ${state.envAutoSync ? "badge-green" : "badge-gray"}" id="envSyncBadge">${state.envAutoSync ? "ON" : "OFF"}</span>
        </div>
        <div class="list-row">
          <span class="list-label">Models</span>
          <span class="muted" id="modelSummary">${state.models.chat}</span>
        </div>
      </div>
    </div>

    <!-- Footer -->
    <div class="footer" id="lastUpdated">${state.lastUpdated}</div>

    <!-- Task Interview Modal -->
    <div class="modal" id="taskInterviewModal" hidden>
      <div class="modal-backdrop" id="taskModalBackdrop"></div>
      <div class="modal-card">
        <div class="modal-header">
          <div class="modal-title">👾 UFO 任務訪談</div>
          <button class="modal-close" id="taskModalClose">Close</button>
        </div>
        <div class="modal-body" id="taskModalMessages"></div>
        <div class="modal-footer">
          <div class="modal-steps" aria-label="steps">
            <div class="modal-step" id="step1">
              <span class="modal-step-num">
                <span class="num">1</span>
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M20 7L10 17l-5-5" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </span>
              <span>輸入任務</span>
            </div>
            <div class="modal-step" id="step2">
              <span class="modal-step-num">
                <span class="num">2</span>
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M20 7L10 17l-5-5" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </span>
              <span>建立任務</span>
            </div>
            <div class="modal-step" id="step3">
              <span class="modal-step-num">
                <span class="num">3</span>
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M20 7L10 17l-5-5" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </span>
              <span>發送給 BlueMonster</span>
            </div>
          </div>
          <div class="modal-input-row">
            <div class="modal-input">
            <input id="taskModalInput" placeholder="輸入回答..." />
            <button class="btn" id="taskModalSendMsgBtn">送出</button>
          </div>
          </div>
          <div class="modal-actions">
            <button class="btn primary" id="taskModalCreateBtn" disabled>建立任務</button>
            <button class="btn primary" id="taskModalSendBtn" hidden disabled>發送 👾</button>
            <div class="modal-working" id="taskModalWorking" hidden>
              <span class="spinner" aria-hidden="true"></span>
              <span>Working...</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Config for external script -->
    <div id="ufo-config" data-gateway-url="${state.gatewayHttpUrl}" style="display:none"></div>

    <script src="${scriptUri}"></script>
  </body>
</html>`;
}

export type { DashboardState };
