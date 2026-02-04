import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

export interface PromptStudioState {
  systemPrompt: string;
  updatedAt: string;
}

const DEFAULT_STATE: PromptStudioState = {
  systemPrompt: "",
  updatedAt: new Date().toISOString()
};

function getPromptStudioPath(context: vscode.ExtensionContext): string {
  const root = path.resolve(context.extensionPath, "..");
  return path.join(root, "prompt-studio.json");
}

export function loadPromptStudioState(context: vscode.ExtensionContext): PromptStudioState {
  const filePath = getPromptStudioPath(context);
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(DEFAULT_STATE, null, 2), "utf8");
    return { ...DEFAULT_STATE };
  }
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as PromptStudioState;
    return {
      ...DEFAULT_STATE,
      ...parsed
    };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export function savePromptStudioState(context: vscode.ExtensionContext, state: PromptStudioState): void {
  const filePath = getPromptStudioPath(context);
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2), "utf8");
}

function getNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let value = "";
  for (let i = 0; i < 32; i += 1) {
    value += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return value;
}

export function getPromptStudioHtml(
  webview: vscode.Webview,
  state: PromptStudioState
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
    <title>UFO Prompt Studio</title>
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
      }
      body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: var(--bg);
        color: var(--text);
        margin: 0;
        padding: 20px;
      }
      h1 {
        margin: 0 0 12px 0;
        font-size: 20px;
      }
      .card {
        background: var(--panel);
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 14px;
        margin-bottom: 12px;
      }
      label {
        display: block;
        font-size: 12px;
        color: var(--muted);
        margin-bottom: 6px;
      }
      textarea {
        width: 100%;
        min-height: 140px;
        background: var(--panel-2);
        color: var(--text);
        border: 1px solid var(--border);
        border-radius: 8px;
        padding: 10px;
        font-size: 13px;
        resize: vertical;
      }
      .actions {
        display: flex;
        gap: 8px;
        justify-content: flex-end;
      }
      button {
        background: var(--accent);
        color: white;
        border: none;
        border-radius: 8px;
        padding: 8px 14px;
        cursor: pointer;
        font-size: 13px;
      }
      button.secondary {
        background: transparent;
        border: 1px solid var(--border);
        color: var(--text);
      }
      .muted {
        color: var(--muted);
        font-size: 12px;
      }
    </style>
  </head>
  <body>
    <h1>UFO Prompt Studio</h1>
    <div class="muted">最後更新：${state.updatedAt}</div>

    <div class="card">
      <label>System Prompt（一般對話）</label>
      <textarea id="systemPrompt">${state.systemPrompt.replace(/</g, "&lt;")}</textarea>
    </div>

    <div class="actions">
      <button class="secondary" id="reload">重新載入</button>
      <button id="save">儲存</button>
    </div>

    <script nonce="${nonce}">
      const vscode = acquireVsCodeApi();
      const systemPromptEl = document.getElementById('systemPrompt');
      document.getElementById('save').addEventListener('click', () => {
        vscode.postMessage({
          type: 'save',
          payload: {
            systemPrompt: systemPromptEl.value || ''
          }
        });
      });
      document.getElementById('reload').addEventListener('click', () => {
        vscode.postMessage({ type: 'reload' });
      });
      window.addEventListener('message', (event) => {
        const message = event.data;
        if (message?.type === 'state') {
          systemPromptEl.value = message.state.systemPrompt || '';
        }
      });
    </script>
  </body>
</html>`;
}
