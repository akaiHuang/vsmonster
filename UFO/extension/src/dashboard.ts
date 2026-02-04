import * as vscode from "vscode";

interface DashboardState {
  connected: boolean;
  connectionState: "connected" | "reconnecting" | "disconnected";
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
        /* 8-bit 像素風格配色 */
        --bg: #1a1c23;
        --panel: #252834;
        --panel-highlight: #2f3546;
        --border-dark: #1a1c23;
        --border-light: #3d4153;
        --text: #f0f0f0;
        --text-bright: #ffffff;
        --muted: #8b92a8;
        --accent: #ff6b9d;
        --accent-2: #4ecdc4;
        --success: #95e1d3;
        --warning: #ffd93d;
        --danger: #ff6b6b;
        --shadow: rgba(0, 0, 0, 0.4);
      }
      
      @keyframes pixel-pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.7; }
      }
      
      body {
        font-family: 'Courier New', monospace;
        background: var(--bg);
        color: var(--text);
        margin: 0;
        padding: 16px;
        font-size: 13px;
      }
      
      .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 20px;
        padding: 12px;
        background: var(--panel);
        border: 3px solid var(--border-dark);
        box-shadow: 4px 4px 0 var(--border-dark);
      }
      
      .title {
        font-size: 16px;
        font-weight: 700;
        letter-spacing: 2px;
        text-transform: uppercase;
        color: var(--text-bright);
        text-shadow: 2px 2px 0 var(--border-dark);
      }
      
      .status-pill {
        padding: 6px 12px;
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        background: var(--panel-highlight);
        border: 2px solid var(--border-dark);
        box-shadow: 2px 2px 0 var(--border-dark);
        letter-spacing: 1px;
      }
      
      .status-pill.connected {
        color: var(--success);
        background: rgba(149, 225, 211, 0.15);
        border-color: var(--success);
        animation: pixel-pulse 2s ease-in-out infinite;
      }
      
      .status-pill.reconnecting {
        color: var(--warning);
        background: rgba(255, 217, 61, 0.15);
        border-color: var(--warning);
      }
      
      .status-pill.disconnected {
        color: var(--danger);
        background: rgba(255, 107, 107, 0.15);
        border-color: var(--danger);
      }
      
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        gap: 16px;
        margin-bottom: 16px;
      }
      
      .card {
        background: var(--panel);
        border: 3px solid var(--border-dark);
        box-shadow: 4px 4px 0 var(--border-dark);
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        position: relative;
      }
      
      .card::before {
        content: '';
        position: absolute;
        top: -3px;
        left: -3px;
        right: -3px;
        height: 3px;
        background: linear-gradient(90deg, var(--accent) 0%, var(--accent-2) 100%);
      }
      
      .card h3 {
        margin: 0;
        font-size: 11px;
        color: var(--accent);
        text-transform: uppercase;
        letter-spacing: 2px;
        font-weight: 700;
        padding-bottom: 8px;
        border-bottom: 2px solid var(--border-light);
      }
      
      .card .value {
        font-size: 20px;
        font-weight: 700;
        color: var(--text-bright);
      }
      
      .muted {
        color: var(--muted);
        font-size: 10px;
        font-family: monospace;
      }
      
      .actions {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 10px;
        padding: 16px;
        background: var(--panel);
        border: 3px solid var(--border-dark);
        box-shadow: 4px 4px 0 var(--border-dark);
        margin-bottom: 16px;
      }
      
      .actions::before {
        content: '⚡ QUICK ACTIONS';
        position: absolute;
        top: -12px;
        left: 12px;
        background: var(--panel);
        padding: 0 8px;
        font-size: 10px;
        font-weight: 700;
        color: var(--warning);
        letter-spacing: 1px;
      }
      
      button.action {
        background: var(--panel-highlight);
        color: var(--text-bright);
        border: 3px solid var(--border-light);
        padding: 10px 14px;
        font-size: 11px;
        font-weight: 700;
        font-family: 'Courier New', monospace;
        text-transform: uppercase;
        letter-spacing: 1px;
        cursor: pointer;
        transition: all 0.1s ease;
        box-shadow: 2px 2px 0 var(--border-dark);
        position: relative;
      }
      
      button.action:hover {
        background: var(--accent);
        border-color: var(--accent);
        color: var(--bg);
        transform: translate(-2px, -2px);
        box-shadow: 4px 4px 0 var(--border-dark);
      }
      
      button.action:active {
        transform: translate(0, 0);
        box-shadow: 1px 1px 0 var(--border-dark);
      }
      
      .task-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 13px;
        padding: 6px 0;
      }
      
      .task-row span:last-child {
        font-weight: 700;
        font-size: 16px;
        color: var(--text-bright);
      }
      
      .tag {
        padding: 4px 10px;
        font-size: 10px;
        font-weight: 700;
        border: 2px solid;
        letter-spacing: 1px;
        text-transform: uppercase;
      }
      
      .tag.pending {
        color: var(--warning);
        background: rgba(255, 217, 61, 0.15);
        border-color: var(--warning);
      }
      
      .tag.approved {
        color: var(--accent-2);
        background: rgba(78, 205, 196, 0.15);
        border-color: var(--accent-2);
      }
      
      .tag.in-progress {
        color: var(--accent);
        background: rgba(255, 107, 157, 0.15);
        border-color: var(--accent);
        animation: pixel-pulse 2s ease-in-out infinite;
      }
      
      .tag.done {
        color: var(--success);
        background: rgba(149, 225, 211, 0.15);
        border-color: var(--success);
      }
      
      .divider {
        height: 2px;
        background: var(--border-light);
        margin: 8px 0;
      }
      
      .list {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      
      .list > div {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 12px;
      }
      
      .badge {
        font-size: 9px;
        padding: 4px 8px;
        border: 2px solid;
        font-weight: 700;
        letter-spacing: 1px;
        text-transform: uppercase;
        margin-left: auto;
      }
      
      .badge.ok {
        color: var(--success);
        background: rgba(149, 225, 211, 0.15);
        border-color: var(--success);
      }
      
      .badge.missing {
        color: var(--danger);
        background: rgba(255, 107, 107, 0.15);
        border-color: var(--danger);
      }
      
      .footer {
        margin-top: 16px;
        padding: 8px;
        font-size: 10px;
        color: var(--muted);
        text-align: center;
        border-top: 2px solid var(--border-light);
        font-family: monospace;
      }
    </style>
  </head>
  <body>
    <div class="header">
      <div class="title">👾 UFO CONTROL</div>
      <div class="status-pill ${state.connectionState}" id="gatewayStatus">
        ${state.connectionState === "connected" ? "● ONLINE" : state.connectionState === "reconnecting" ? "◐ SYNC..." : "○ OFFLINE"}
      </div>
    </div>

    <div class="actions" style="position: relative;">
      <button class="action" data-command="ufo.createTaskSpec">+ Task</button>
      <button class="action" data-command="ufo.refreshQueue">↻ Refresh</button>
      <button class="action" data-command="ufo.openTools">⚙ Tools</button>
      <button class="action" data-command="ufo.openTasksRoot">📁 Folder</button>
      <button class="action" data-command="ufo.openSettings">⚡ Config</button>
      <button class="action" data-command="ufo.syncEnv">🔄 Sync</button>
    </div>

    <div class="grid">
      <div class="card">
        <h3>📦 Tasks</h3>
        <div class="task-row"><span class="tag pending">Pending</span><span id="countPending">${state.tasks.pending}</span></div>
        <div class="task-row"><span class="tag approved">Approved</span><span id="countApproved">${state.tasks.approved}</span></div>
        <div class="task-row"><span class="tag in-progress">Running</span><span id="countProgress">${state.tasks.inProgress}</span></div>
        <div class="task-row"><span class="tag done">Done</span><span id="countDone">${state.tasks.done}</span></div>
        <div class="divider"></div>
        <div class="task-row"><span style="text-transform: uppercase; letter-spacing: 1px; font-weight: 700;">Total</span><span id="countTotal">${state.tasks.total}</span></div>
        <div class="muted" id="tasksRoot">${state.tasksRoot}</div>
      </div>

      <div class="card">
        <h3>🔌 Connection</h3>
        <div class="list">
          <div>Gateway <span class="badge ${state.connectionState === "connected" ? "ok" : "missing"}" id="gatewayBadge">${state.connectionState === "connected" ? "OK" : state.connectionState === "reconnecting" ? "WAIT" : "DOWN"}</span></div>
          <div class="muted" id="gatewayUrl" style="padding-left: 0; margin-top: -4px;">${state.gatewayUrl}</div>
          <div>Public <span class="badge ${state.publicUrl ? "ok" : "missing"}" id="publicUrlBadge">${state.publicUrl ? "SET" : "NONE"}</span></div>
          <div class="muted" id="publicUrl" style="padding-left: 0; margin-top: -4px;">${state.publicUrl || "—"}</div>
          <div>Auto-Sync <span class="badge ${state.envAutoSync ? "ok" : "missing"}" id="envSyncBadge">${state.envAutoSync ? "ON" : "OFF"}</span></div>
        </div>
      </div>

      <div class="card">
        <h3>🤖 Models</h3>
        <div class="list">
          <div>Chat <span class="badge ok" id="modelChat">${state.models.chat}</span></div>
          <div>Spec <span class="badge ok" id="modelSpec">${state.models.spec}</span></div>
          <div>Opus <span class="badge ${state.models.opus ? "ok" : "missing"}" id="modelOpus">${state.models.opus || "—"}</span></div>
        </div>
      </div>

      <div class="card">
        <h3>📡 Channels</h3>
        <div class="list">
          <div>LINE <span class="badge ${state.channels.line ? "ok" : "missing"}" id="channelLine">${state.channels.line ? "READY" : "NONE"}</span></div>
          <div>Telegram <span class="badge ${state.channels.telegram ? "ok" : "missing"}" id="channelTelegram">${state.channels.telegram ? "READY" : "NONE"}</span></div>
          <div>Discord <span class="badge ${state.channels.discord ? "ok" : "missing"}" id="channelDiscord">${state.channels.discord ? "READY" : "NONE"}</span></div>
        </div>
      </div>
    </div>

    <div class="footer" id="lastUpdated">⏱ ${state.lastUpdated}</div>

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
        setText('lastUpdated', '⏱ ' + state.lastUpdated);
        setBadge('gatewayBadge', state.connectionState === 'connected', 'OK', state.connectionState === 'reconnecting' ? 'WAIT' : 'DOWN');
        setBadge('publicUrlBadge', !!state.publicUrl, 'SET', 'NONE');
        setBadge('envSyncBadge', state.envAutoSync, 'ON', 'OFF');
        setBadge('channelLine', state.channels.line, 'READY', 'NONE');
        setBadge('channelTelegram', state.channels.telegram, 'READY', 'NONE');
        setBadge('channelDiscord', state.channels.discord, 'READY', 'NONE');
        const status = byId('gatewayStatus');
        if (status) {
          status.textContent = state.connectionState === 'connected'
            ? '● ONLINE'
            : state.connectionState === 'reconnecting'
              ? '◐ SYNC...'
              : '○ OFFLINE';
          status.classList.toggle('connected', state.connectionState === 'connected');
          status.classList.toggle('reconnecting', state.connectionState === 'reconnecting');
          status.classList.toggle('disconnected', state.connectionState === 'disconnected');
        }
      });
    </script>
  </body>
</html>`;
}

export type { DashboardState };
