import * as vscode from "vscode";

interface DashboardState {
  connected: boolean;
  gatewayUrl: string;
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

function getNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let value = "";
  for (let i = 0; i < 32; i += 1) {
    value += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return value;
}

export function getDashboardHtml(
  webview: vscode.Webview,
  state: DashboardState
): string {
  const nonce = getNonce();
  const csp = [
    "default-src 'none'",
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `script-src 'nonce-${nonce}'`
  ].join("; ");

  return `<!doctype html>
<html lang="zh-Hant">
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>UFO Control Center</title>
    <style>
      :root {
        color-scheme: light dark;
        --bg: #0f1115;
        --panel: #181b21;
        --panel-2: #1f232b;
        --border: #2c313c;
        --text: #e6e9ef;
        --muted: #98a2b3;
        --accent: #7f5af0;
        --accent-2: #2dd4bf;
        --danger: #f87171;
        --warning: #facc15;
      }
      body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: var(--bg);
        color: var(--text);
        margin: 0;
        padding: 20px;
      }
      .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 16px;
      }
      .title {
        font-size: 20px;
        font-weight: 700;
        letter-spacing: 0.3px;
      }
      .status-pill {
        padding: 4px 10px;
        border-radius: 999px;
        font-size: 12px;
        font-weight: 600;
        background: var(--panel-2);
        border: 1px solid var(--border);
      }
      .status-pill.connected {
        color: var(--accent-2);
        border-color: rgba(45, 212, 191, 0.4);
      }
      .status-pill.disconnected {
        color: var(--danger);
        border-color: rgba(248, 113, 113, 0.4);
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 12px;
      }
      .card {
        background: var(--panel);
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 14px;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .card h3 {
        margin: 0;
        font-size: 14px;
        color: var(--muted);
        text-transform: uppercase;
        letter-spacing: 0.1em;
      }
      .card .value {
        font-size: 18px;
        font-weight: 600;
      }
      .muted {
        color: var(--muted);
        font-size: 12px;
      }
      .actions {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
        gap: 8px;
      }
      button.action {
        background: var(--panel-2);
        color: var(--text);
        border: 1px solid var(--border);
        border-radius: 10px;
        padding: 8px 10px;
        font-size: 13px;
        cursor: pointer;
        transition: all 0.15s ease;
      }
      button.action:hover {
        border-color: var(--accent);
        color: white;
      }
      .task-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 13px;
      }
      .tag {
        padding: 2px 8px;
        border-radius: 999px;
        font-size: 11px;
        border: 1px solid var(--border);
        background: var(--panel-2);
      }
      .tag.pending { color: var(--warning); border-color: rgba(250, 204, 21, 0.4); }
      .tag.approved { color: var(--accent-2); border-color: rgba(45, 212, 191, 0.4); }
      .tag.in-progress { color: var(--accent); border-color: rgba(127, 90, 240, 0.4); }
      .tag.done { color: #a3e635; border-color: rgba(163, 230, 53, 0.4); }
      .divider {
        height: 1px;
        background: var(--border);
        margin: 6px 0;
      }
      .list {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .badge {
        font-size: 11px;
        padding: 2px 6px;
        border-radius: 6px;
        border: 1px solid var(--border);
        background: var(--panel-2);
      }
      .badge.ok { color: var(--accent-2); }
      .badge.missing { color: var(--danger); }
      .footer {
        margin-top: 12px;
        font-size: 11px;
        color: var(--muted);
        text-align: right;
      }
    </style>
  </head>
  <body>
    <div class="header">
      <div class="title">UFO Control Center</div>
      <div class="status-pill ${state.connected ? "connected" : "disconnected"}" id="gatewayStatus">
        ${state.connected ? "Gateway Connected" : "Gateway Disconnected"}
      </div>
    </div>

    <div class="card">
      <h3>Quick Actions</h3>
      <div class="actions">
        <button class="action" data-command="ufo.createTaskSpec">Create Task Spec</button>
        <button class="action" data-command="ufo.refreshQueue">Refresh Queue</button>
        <button class="action" data-command="ufo.openTools">Open Tools</button>
        <button class="action" data-command="ufo.openTasksRoot">Open Tasks Folder</button>
        <button class="action" data-command="ufo.openSettings">UFO Settings</button>
        <button class="action" data-command="ufo.syncEnv">Sync .env</button>
      </div>
    </div>

    <div class="grid">
      <div class="card">
        <h3>Tasks Overview</h3>
        <div class="task-row"><span class="tag pending">Pending</span><span id="countPending">${state.tasks.pending}</span></div>
        <div class="task-row"><span class="tag approved">Approved</span><span id="countApproved">${state.tasks.approved}</span></div>
        <div class="task-row"><span class="tag in-progress">In Progress</span><span id="countProgress">${state.tasks.inProgress}</span></div>
        <div class="task-row"><span class="tag done">Done</span><span id="countDone">${state.tasks.done}</span></div>
        <div class="divider"></div>
        <div class="task-row"><span>Total</span><span id="countTotal">${state.tasks.total}</span></div>
        <div class="muted" id="tasksRoot">${state.tasksRoot}</div>
      </div>

      <div class="card">
        <h3>Connection</h3>
        <div class="list">
          <div>Gateway: <span class="badge ${state.connected ? "ok" : "missing"}" id="gatewayBadge">${state.connected ? "Connected" : "Disconnected"}</span></div>
          <div class="muted" id="gatewayUrl">${state.gatewayUrl}</div>
          <div>Public URL: <span class="badge ${state.publicUrl ? "ok" : "missing"}" id="publicUrlBadge">${state.publicUrl ? "Set" : "Missing"}</span></div>
          <div class="muted" id="publicUrl">${state.publicUrl || "—"}</div>
          <div>Env Auto-Sync: <span class="badge ${state.envAutoSync ? "ok" : "missing"}" id="envSyncBadge">${state.envAutoSync ? "On" : "Off"}</span></div>
        </div>
      </div>

      <div class="card">
        <h3>Models</h3>
        <div class="list">
          <div>Chat: <span class="badge ok" id="modelChat">${state.models.chat}</span></div>
          <div>Spec: <span class="badge ok" id="modelSpec">${state.models.spec}</span></div>
          <div>Opus: <span class="badge ${state.models.opus ? "ok" : "missing"}" id="modelOpus">${state.models.opus || "—"}</span></div>
        </div>
      </div>

      <div class="card">
        <h3>Channels</h3>
        <div class="list">
          <div>LINE <span class="badge ${state.channels.line ? "ok" : "missing"}" id="channelLine">${state.channels.line ? "Configured" : "Missing"}</span></div>
          <div>Telegram <span class="badge ${state.channels.telegram ? "ok" : "missing"}" id="channelTelegram">${state.channels.telegram ? "Configured" : "Missing"}</span></div>
          <div>Discord <span class="badge ${state.channels.discord ? "ok" : "missing"}" id="channelDiscord">${state.channels.discord ? "Configured" : "Missing"}</span></div>
        </div>
      </div>
    </div>

    <div class="footer" id="lastUpdated">Updated: ${state.lastUpdated}</div>

    <script nonce="${nonce}">
      const vscode = acquireVsCodeApi();
      const byId = (id) => document.getElementById(id);
      const setText = (id, value) => { const el = byId(id); if (el) el.textContent = value; };
      const setBadge = (id, ok, okText, badText) => {
        const el = byId(id);
        if (!el) return;
        el.textContent = ok ? okText : badText;
        el.classList.toggle('ok', ok);
        el.classList.toggle('missing', !ok);
      };

      document.querySelectorAll('button.action').forEach(btn => {
        btn.addEventListener('click', () => {
          vscode.postMessage({ type: 'command', command: btn.dataset.command });
        });
      });

      window.addEventListener('message', (event) => {
        const message = event.data;
        if (!message || message.type !== 'state') return;
        const state = message.state;
        setText('countPending', String(state.tasks.pending));
        setText('countApproved', String(state.tasks.approved));
        setText('countProgress', String(state.tasks.inProgress));
        setText('countDone', String(state.tasks.done));
        setText('countTotal', String(state.tasks.total));
        setText('tasksRoot', state.tasksRoot);
        setText('gatewayUrl', state.gatewayUrl);
        setText('publicUrl', state.publicUrl || "—");
        setText('modelChat', state.models.chat);
        setText('modelSpec', state.models.spec);
        setText('modelOpus', state.models.opus || "—");
        setText('lastUpdated', 'Updated: ' + state.lastUpdated);
        setBadge('gatewayBadge', state.connected, 'Connected', 'Disconnected');
        setBadge('publicUrlBadge', !!state.publicUrl, 'Set', 'Missing');
        setBadge('envSyncBadge', state.envAutoSync, 'On', 'Off');
        setBadge('channelLine', state.channels.line, 'Configured', 'Missing');
        setBadge('channelTelegram', state.channels.telegram, 'Configured', 'Missing');
        setBadge('channelDiscord', state.channels.discord, 'Configured', 'Missing');
        const status = byId('gatewayStatus');
        if (status) {
          status.textContent = state.connected ? 'Gateway Connected' : 'Gateway Disconnected';
          status.classList.toggle('connected', state.connected);
          status.classList.toggle('disconnected', !state.connected);
        }
      });
    </script>
  </body>
</html>`;
}

export type { DashboardState };
