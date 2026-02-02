// Webview CSS 樣式 - 自動生成，請勿手動編輯此檔案
// 原始檔案：src/webview/styles.css

export const WEBVIEW_CSS = `/* VS Code Native Style - Copilot Chat 風格 */
:root {
  color-scheme: light dark;
}
* {
  box-sizing: border-box;
}
body {
  margin: 0;
  padding: 0;
  font-family: var(--vscode-font-family);
  font-size: var(--vscode-font-size);
  color: var(--vscode-foreground);
  background: var(--vscode-sideBar-background);
  height: 100vh;
  display: flex;
  flex-direction: column;
}

/* Header - Copilot Chat 風格 */
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  border-bottom: 1px solid var(--vscode-panel-border);
  background: var(--vscode-sideBar-background);
  flex-shrink: 0;
}
.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}
.header-title {
  font-weight: 600;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 4px;
}
.header-title .icon {
  font-size: 16px;
}
.header-right {
  display: flex;
  align-items: center;
  gap: 4px;
}

/* 自定義選擇器 */
.custom-select {
  position: relative;
  display: inline-block;
}
.custom-select-trigger {
  background: #3c3c3c;
  color: #cccccc;
  border: none;
  border-radius: 6px;
  padding: 5px 28px 5px 10px;
  font-size: 12px;
  cursor: pointer;
  min-width: 80px;
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
  user-select: none;
}
.custom-select-trigger:hover {
  background: #4a4a4a;
}
.custom-select-trigger::after {
  content: '';
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  border: 4px solid transparent;
  border-top-color: #888;
}
.custom-select-trigger.open::after {
  border-top-color: transparent;
  border-bottom-color: #888;
  transform: translateY(-80%);
}
.custom-select-options {
  position: absolute;
  bottom: calc(100% + 4px);
  left: 0;
  min-width: 100%;
  background: #2d2d2d;
  border: 1px solid #454545;
  border-radius: 8px;
  box-shadow: 0 -4px 16px rgba(0,0,0,0.3);
  z-index: 1000;
  display: none;
  overflow: hidden;
}
.custom-select-options.show {
  display: block;
}
.custom-select-option {
  padding: 8px 12px;
  cursor: pointer;
  font-size: 12px;
  color: #cccccc;
  display: flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}
.custom-select-option:hover {
  background: #3c3c3c;
}
.custom-select-option.selected {
  color: #ffffff;
}
.custom-select-option.selected:hover {
  background: #3c3c3c;
}
.custom-select-option .check-mark {
  width: 16px;
  opacity: 0;
  color: #4fc3f7;
}
.custom-select-option.selected .check-mark {
  opacity: 1;
}
.select-pill {
  display: none;
}
.toolbar {
  display: flex;
  gap: 1px;
}
.toolbar button {
  background: transparent;
  color: var(--vscode-icon-foreground);
  border: none;
  padding: 4px 6px;
  cursor: pointer;
  border-radius: 4px;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 26px;
  height: 26px;
}
.toolbar button:hover {
  background: var(--vscode-toolbar-hoverBackground);
}
.toolbar button.active {
  background: var(--vscode-toolbar-activeBackground);
}
.toolbar button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.toolbar .divider {
  width: 1px;
  height: 16px;
  background: var(--vscode-panel-border);
  margin: 0 4px;
  align-self: center;
}

/* Messages */
.messages {
  flex: 1;
  overflow-y: auto;
  padding: 8px 12px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
}
.messages-wrap {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  z-index: 1;
}
.empty-state {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 10px;
  opacity: 0.3;
  pointer-events: none;
  text-align: center;
}
.empty-state img {
  width: 48px;
  height: auto;
}
.message {
  display: flex;
  flex-direction: column;
  gap: 6px;
  position: relative;
}
.message-header {
  display: flex;
  align-items: center;
  gap: 8px;
}
.message-avatar {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  flex-shrink: 0;
}
.message-avatar img {
  width: 100%;
  height: 100%;
  display: block;
}
.message.user .message-avatar {
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
}
.message.assistant .message-avatar {
  background: none;
  color: inherit;
}
.message.system .message-avatar {
  display: none;
}
.message-role {
  font-size: 12px;
  font-weight: 600;
}
.message-time {
  font-size: 10px;
  opacity: 0.5;
  margin-left: auto;
}
.message-content {
  padding-left: 32px;
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}
.message.user {
  align-items: flex-end;
}
.message.user .message-header {
  display: none;
}
.message.user .message-avatar {
  display: none;
}
.message.user .message-role {
  display: none;
}
.message.user .message-content {
  padding: 10px 12px;
  text-align: left;
  max-width: 100%;
  background: #2b3442;
  border-radius: 12px;
  align-self: flex-end;
}
.message.user .message-content:empty {
  display: none;
}
.message.system .message-header {
  display: none;
}
.message.system .message-role {
  display: none;
}
.message.system .message-content {
  padding-left: 0;
  font-size: 11px;
  opacity: 0.7;
}
.message.assistant .message-content {
  max-width: 90%;
}
.user-attachments {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 6px;
  justify-content: flex-end;
}
.user-attachment-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-radius: 8px;
  background: #2a2a2a;
  border: 1px solid #3a3a3a;
  font-size: 11px;
  color: #d7d7d7;
  max-width: 220px;
}
.user-attachment-chip svg {
  width: 14px;
  height: 14px;
  fill: currentColor;
}
.user-attachment-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 可折疊步驟卡片 - Copilot 風格 */
.activity-card {
  margin-left: 32px;
  margin-bottom: 8px;
  border-radius: 6px;
  border: 1px solid var(--vscode-panel-border);
  background: var(--vscode-editor-background);
  overflow: hidden;
}
.activity-card summary {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  cursor: pointer;
  user-select: none;
  font-size: 12px;
  color: var(--vscode-foreground);
  list-style: none;
}
.activity-card summary::-webkit-details-marker {
  display: none;
}
.activity-card summary::before {
  content: '▶';
  font-size: 8px;
  transition: transform 0.2s;
  color: var(--vscode-icon-foreground);
}
.activity-card[open] summary::before {
  transform: rotate(90deg);
}
.activity-card .card-icon {
  font-size: 14px;
}
.activity-card .card-icon.done {
  color: #89d185;
}
.activity-card .card-icon.working {
  color: var(--vscode-progressBar-background);
}
.activity-card .card-title {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.activity-card .card-badge {
  display: inline-flex;
  gap: 4px;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--vscode-badge-background);
  font-size: 10px;
  font-family: var(--vscode-editor-font-family);
}
.activity-card .card-badge .plus {
  color: #89d185;
}
.activity-card .card-badge .minus {
  color: #f48771;
}
.activity-card .card-body {
  padding: 8px 12px;
  border-top: 1px solid var(--vscode-panel-border);
  font-size: 11px;
  background: var(--vscode-textCodeBlock-background);
  max-height: 200px;
  overflow-y: auto;
}
.activity-card .card-body pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
  font-family: var(--vscode-editor-font-family);
}
.activity-card .file-link {
  color: var(--vscode-textLink-foreground);
  cursor: pointer;
  text-decoration: underline;
}
.activity-card .file-link:hover {
  color: var(--vscode-textLink-activeForeground);
}
.activity-card .line-range {
  opacity: 0.7;
  font-size: 10px;
}

/* 舊的 activity 樣式保留相容性 */
.assistant-activity {
  margin-left: 32px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.assistant-activity + .message-content {
  margin-top: 10px;
}
.activity-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
}
.activity-item {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #c9c9c9;
}
.activity-check {
  color: #8dd39c;
  font-size: 12px;
}
.activity-file {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #c9c9c9;
  font-size: 12px;
}
.file-badge {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  padding: 2px 6px;
  border-radius: 6px;
  background: #1f1f1f;
  border: 1px solid #303030;
  font-family: var(--vscode-editor-font-family);
  font-size: 11px;
}
.file-badge .plus {
  color: #7bd88f;
}
.file-badge .minus {
  color: #f06c6c;
}
.command-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 8px;
  border-radius: 8px;
  border: 1px solid #2f2f2f;
  background: #1b1b1b;
  font-family: var(--vscode-editor-font-family);
  font-size: 12px;
  color: #d8d8d8;
}
.command-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #64b5ff;
}

/* 訊息操作按鈕 - Copilot 風格 */
.message-actions {
  display: none;
  gap: 2px;
  margin-left: 32px;
  margin-top: 4px;
}
.message.user .message-actions {
  margin-left: 0;
  margin-right: 6px;
  align-self: flex-end;
}
.message:hover .message-actions {
  display: flex;
}
.message-actions button {
  background: var(--vscode-button-secondaryBackground);
  color: var(--vscode-button-secondaryForeground);
  border: none;
  padding: 3px 8px;
  border-radius: 3px;
  font-size: 11px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
}
.message-actions button:hover {
  background: var(--vscode-button-secondaryHoverBackground);
}

/* Code blocks - Copilot 風格 */
.message-content code {
  background: var(--vscode-textCodeBlock-background);
  padding: 2px 5px;
  border-radius: 4px;
  font-family: var(--vscode-editor-font-family);
  font-size: 12px;
}
.code-block {
  position: relative;
  margin: 8px 0;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid var(--vscode-panel-border);
}
.code-block-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 10px;
  background: var(--vscode-editor-background);
  border-bottom: 1px solid var(--vscode-panel-border);
}
.code-block-actions {
  display: flex;
  gap: 4px;
}
.code-block-actions button {
  background: transparent;
  color: var(--vscode-icon-foreground);
  border: none;
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 11px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 3px;
}
.code-block-actions button:hover {
  background: var(--vscode-toolbar-hoverBackground);
}
.code-block pre {
  margin: 0;
  padding: 10px 12px;
  background: var(--vscode-textCodeBlock-background);
  overflow-x: auto;
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-wrap: break-word;
  word-break: break-all;
}
.code-block pre code {
  background: none;
  padding: 0;
  font-family: var(--vscode-editor-font-family);
  white-space: pre-wrap;
  word-wrap: break-word;
}
.code-block-lang {
  font-size: 10px;
  color: #888;
  opacity: 0.6;
  font-family: var(--vscode-editor-font-family);
  text-transform: lowercase;
}

/* Image in message - Copilot style attachment */
.message-attachment {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-left: 32px;
  padding: 6px 8px;
  border-radius: 6px;
  border: 1px solid var(--vscode-panel-border);
  background: var(--vscode-input-background);
  cursor: pointer;
  max-width: 240px;
  transition: background 0.2s, box-shadow 0.2s;
}
.message.user .message-attachment {
  margin-left: 0;
  margin-right: 6px;
  align-self: flex-end;
}
.message-attachment:hover {
  background: var(--vscode-list-hoverBackground);
  box-shadow: 0 2px 8px rgba(0,0,0,0.2);
}
.message-image {
  width: 56px;
  height: 56px;
  border-radius: 4px;
  object-fit: cover;
  border: 1px solid var(--vscode-panel-border);
  flex-shrink: 0;
}
.attachment-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.attachment-name {
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.attachment-meta {
  font-size: 10px;
  opacity: 0.6;
}

/* Thought details */
.message details.thought {
  margin-left: 32px;
  background: var(--vscode-textBlockQuote-background);
  border-left: 3px solid var(--vscode-charts-blue);
  border-radius: 0 4px 4px 0;
  padding: 8px 12px;
  margin-top: 6px;
}
.message details.thought summary {
  cursor: pointer;
  font-size: 12px;
  opacity: 0.8;
  user-select: none;
  display: flex;
  align-items: center;
  gap: 6px;
}
.message details.thought .thought-body {
  margin-top: 8px;
  font-size: 12px;
  opacity: 0.9;
  line-height: 1.5;
}

/* Panels */
.panel {
  margin: 8px 12px;
  padding: 12px;
  background: var(--vscode-notifications-background);
  border: 1px solid var(--vscode-notifications-border);
  border-radius: 6px;
}
.panel-title {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 10px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.panel-body {
  font-family: var(--vscode-editor-font-family);
  font-size: 12px;
  white-space: pre-wrap;
  background: var(--vscode-textCodeBlock-background);
  padding: 8px 10px;
  border-radius: 4px;
  margin-bottom: 10px;
}
.panel-meta {
  font-size: 11px;
  opacity: 0.7;
  margin-bottom: 10px;
}
.panel-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.panel-actions button {
  padding: 5px 12px;
  font-size: 12px;
  border-radius: 4px;
  cursor: pointer;
  border: none;
  font-weight: 500;
}
.btn-primary {
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
}
.btn-primary:hover {
  background: var(--vscode-button-hoverBackground);
}
.btn-secondary {
  background: var(--vscode-button-secondaryBackground);
  color: var(--vscode-button-secondaryForeground);
}
.btn-secondary:hover {
  background: var(--vscode-button-secondaryHoverBackground);
}
.btn-danger {
  background: var(--vscode-inputValidation-errorBackground);
  color: var(--vscode-inputValidation-errorForeground);
  border: 1px solid var(--vscode-inputValidation-errorBorder);
}

/* 確認選項樣式 - 程式碼區塊風格 */
.confirm-panel-inline {
  margin: 10px 5%; /* 左右寬度縮 5% */
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid var(--vscode-panel-border);
  background: var(--vscode-textCodeBlock-background);
}
.confirm-panel-inline .confirm-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 9px 12px; /* 高度變寬 1.5 倍 (6px -> 9px) */
  background: var(--vscode-editor-background);
  border-bottom: 1px solid var(--vscode-panel-border);
}
.confirm-panel-inline .confirm-title {
  font-size: 12px;
  font-weight: 500;
  color: #f48771;
}
.confirm-panel-inline .confirm-danger-type {
  font-size: 10px;
  color: #888;
  opacity: 0.8;
}
.confirm-panel-inline .confirm-command {
  padding: 10px 12px;
  font-family: var(--vscode-editor-font-family);
  font-size: 10px; /* 文字縮小兩級 (12px -> 10px) */
  line-height: 1.2; /* 行高縮小 20% (1.5 -> 1.2) */
  white-space: pre-wrap;
  word-wrap: break-word;
  border-bottom: 1px solid var(--vscode-panel-border);
}
.confirm-panel-inline .confirm-cwd {
  padding: 4px 12px;
  font-size: 9px; /* 文字縮小兩級 (11px -> 9px) */
  color: #888;
  border-bottom: 1px solid var(--vscode-panel-border);
}
.confirm-options {
  padding: 8px;
}
.confirm-option {
  padding: 8px 12px;
  margin: 4px 0;
  background: #2d2d2d;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  transition: background 0.15s ease;
  font-size: 11px; /* 文字縮小兩級 (13px -> 11px) */
}
.confirm-option:hover {
  background: #3c3c3c !important;
}
.confirm-option .option-num {
  color: #4fc3f7;
  margin-right: 8px;
  font-weight: 500;
}
.confirm-input-wrap {
  display: flex;
  gap: 8px;
  padding: 8px 12px;
  border-top: 1px solid var(--vscode-panel-border);
}
.confirm-input-wrap input {
  flex: 1;
  padding: 8px 12px;
  background: #1e1e1e;
  border: 1px solid #3c3c3c;
  border-radius: 8px;
  color: #fff;
  font-size: 13px;
  outline: none;
}
.confirm-input-wrap input:focus {
  border-color: var(--vscode-focusBorder) !important;
}
.confirm-input-wrap button {
  padding: 8px 16px;
  border-radius: 8px;
  background: #0078d4;
  color: #fff;
  border: none;
  cursor: pointer;
  font-weight: 500;
}
.confirm-input-wrap button:hover {
  background: #106ebe;
}
.confirm-hint {
  padding: 6px 12px;
  font-size: 11px;
  opacity: 0.6;
}

/* Thinking panel - 改進動畫 */
.thinking-panel {
  margin: 8px 12px;
  padding: 10px 12px;
  background: var(--vscode-textBlockQuote-background);
  border-left: 3px solid var(--vscode-progressBar-background);
  border-radius: 0 4px 4px 0;
  font-size: 12px;
}
.thinking-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 500;
}
.thinking-body {
  margin-top: 6px;
  font-size: 11px;
  opacity: 0.8;
  white-space: pre-wrap;
  max-height: 120px;
  overflow-y: auto;
}
.spinner {
  width: 14px;
  height: 14px;
  border: 2px solid var(--vscode-progressBar-background);
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}

/* 任務清單面板 - 全寬樣式 */
.history-panel {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  width: 100%;
  height: 100%;
  background: var(--vscode-sideBar-background);
  z-index: 100;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.history-panel[hidden] {
  display: none !important;
}
.history-search {
  padding: 12px 12px 8px 12px;
  flex-shrink: 0;
}
.history-search input {
  width: 100%;
  padding: 8px 12px;
  font-size: 13px;
  background: transparent;
  color: var(--vscode-input-foreground);
  border: none;
  outline: none;
}
.history-search input::placeholder {
  color: var(--vscode-input-placeholderForeground);
  opacity: 0.6;
}
.history-search input:focus {
  border: none;
  outline: none;
  box-shadow: none;
}
.history-header {
  padding: 4px 12px 8px 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
}
.history-header span {
  font-size: 11px;
  color: var(--vscode-descriptionForeground);
  opacity: 0.7;
  font-weight: 400;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.history-header button {
  display: none;
}
.history-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 4px;
}
.history-item {
  padding: 10px 12px;
  cursor: pointer;
  border-radius: 6px;
  margin: 2px 0;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  width: 100%;
}
.history-item:hover {
  background: var(--vscode-list-hoverBackground);
}
.history-item-icon {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  flex-shrink: 0;
  object-fit: cover;
}
.history-item-avatar {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  background: var(--vscode-button-secondaryBackground);
}
.history-item-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.history-item-header {
  display: flex;
  align-items: center;
  gap: 6px;
}
.history-item-taskid {
  font-size: 11px;
  color: var(--vscode-textLink-foreground);
  font-family: monospace;
  flex-shrink: 0;
  background: var(--vscode-badge-background);
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 500;
}
.history-item-agent {
  font-size: 13px;
  font-weight: 600;
  color: var(--vscode-foreground);
  flex-shrink: 0;
}
.history-item-status {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  margin-left: auto;
  flex-shrink: 0;
  font-weight: 500;
}
.history-item-status.active {
  color: #4caf50;
  background: rgba(76, 175, 80, 0.15);
}
.history-item-status.busy {
  color: #2196f3;
  background: rgba(33, 150, 243, 0.15);
  animation: pulse 1.5s ease-in-out infinite;
}
.history-item-status.waiting {
  color: #ff9800;
  background: rgba(255, 152, 0, 0.15);
  animation: pulse 2s ease-in-out infinite;
}
.history-item-status.archived {
  color: var(--vscode-descriptionForeground);
  background: rgba(128, 128, 128, 0.1);
  opacity: 0.7;
}
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
.history-item.active {
  border-left: 2px solid #4caf50;
  background: rgba(76, 175, 80, 0.05);
}
.history-item.busy {
  border-left: 2px solid #2196f3;
  background: rgba(33, 150, 243, 0.05);
}
.history-item.waiting {
  border-left: 2px solid #ff9800;
  background: rgba(255, 152, 0, 0.05);
}
.history-item-title {
  font-size: 12px;
  font-weight: 400;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  opacity: 0.8;
}
.history-item-meta {
  display: none;
}
.history-item-time {
  font-size: 11px;
  color: var(--vscode-descriptionForeground);
  opacity: 0.6;
  white-space: nowrap;
  flex-shrink: 0;
}
.history-item-preview {
  display: none;
}
.history-empty {
  padding: 20px;
  text-align: center;
  font-size: 12px;
  opacity: 0.5;
}
.history-panel-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 8px 0 8px;
  flex-shrink: 0;
}
.history-panel-header .icon-btn {
  padding: 6px;
}
.history-panel-title {
  font-size: 14px;
  font-weight: 500;
}
.back-btn {
  padding: 4px;
}
.back-btn[hidden] {
  display: none !important;
}
.header-title {
  display: flex;
  align-items: center;
  gap: 6px;
}

/* Input area - Refined Copilot Style */
.input-area {
  padding: 10px 12px;
  background: var(--vscode-sideBar-background);
  border-top: 1px solid var(--vscode-panel-border);
  flex-shrink: 0;
  position: sticky;
  bottom: 0;
  z-index: 2;
}

.input-container {
  background: var(--vscode-input-background);
  border: 1px solid var(--vscode-input-border);
  border-radius: 8px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
@media (max-width: 300px) {
  .input-footer-toolbar .select-pill {
    display: none;
  }
}

.input-container:focus-within {
  border-color: var(--vscode-focusBorder);
  outline: 1px solid var(--vscode-focusBorder);
}

.attachment-area {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.attachment-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: #3c3c3c;
  color: #cccccc;
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 11px;
  user-select: none;
  border: 1px solid #454545;
}

.attachment-chip .chip-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.8;
}
.attachment-chip .chip-thumb {
  width: 16px;
  height: 16px;
  border-radius: 3px;
  object-fit: cover;
  border: 1px solid #555555;
}

.attachment-chip .chip-name {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.attachment-chip .chip-remove {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  margin-left: 2px;
  border-radius: 50%;
  background: #cccccc;
  color: #333333;
  cursor: pointer;
  font-size: 12px;
  font-weight: bold;
  border: none;
  padding: 0;
  line-height: 1;
}
.attachment-chip .chip-remove:hover {
  background: #ffffff;
}

.input-wrapper {
  position: relative;
}

.input-textarea {
  width: 100%;
  min-height: 24px;
  max-height: 200px;
  padding: 4px 0;
  font-family: var(--vscode-font-family);
  font-size: 13px;
  background: transparent;
  color: var(--vscode-input-foreground);
  border: none;
  resize: none;
  outline: none;
  line-height: 1.5;
}
.input-textarea::placeholder {
  color: var(--vscode-input-placeholderForeground);
  opacity: 0.6;
}

.input-footer-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 4px;
  padding-top: 4px;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 6px;
}

.icon-btn {
  background: transparent;
  border: none;
  color: var(--vscode-icon-foreground);
  padding: 4px;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.8;
  transition: all 0.2s;
}
.icon-btn:hover {
  background: var(--vscode-toolbar-hoverBackground);
  opacity: 1;
}
.icon-btn svg {
  width: 16px;
  height: 16px;
  fill: currentColor;
}
.icon-btn[data-tooltip] {
  position: relative;
}
.icon-btn[data-tooltip]:hover::after {
  content: attr(data-tooltip);
  position: absolute;
  bottom: 32px;
  right: 0;
  background: var(--vscode-editorWidget-background);
  color: var(--vscode-editorWidget-foreground);
  border: 1px solid var(--vscode-editorWidget-border);
  border-radius: 8px;
  padding: 4px 8px;
  font-size: 11px;
  white-space: nowrap;
  box-shadow: 0 4px 12px rgba(0,0,0,0.35);
  z-index: 500;
}
.icon-btn[data-tooltip-align="left"]:hover::after {
  left: 0;
  right: auto;
}
.icon-btn[data-tooltip-align="center"]:hover::after {
  left: 50%;
  right: auto;
  transform: translateX(-50%);
}
.icon-btn[data-tooltip-position="bottom"]:hover::after {
  top: 32px;
  bottom: auto;
  left: 50%;
  right: auto;
  transform: translateX(-50%);
}
.icon-btn[hidden],
.send-icon-btn[hidden],
.stop-icon-btn[hidden],
.empty-state[hidden] {
  display: none !important;
}
.send-icon-btn {
  background: #ffffff;
  color: #1e1e1e;
  border: none;
  border-radius: 50%;
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.2s;
}
.send-icon-btn:hover {
  background: #f2f2f2;
}
.send-icon-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  background: var(--vscode-disabledForeground);
}
.send-icon-btn svg {
  width: 14px;
  height: 14px;
  fill: currentColor;
}

.stop-icon-btn {
  background: transparent;
  border: 1px solid var(--vscode-charts-red);
  color: var(--vscode-charts-red);
  border-radius: 50%;
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.stop-icon-btn:hover {
  background: rgba(255, 0, 0, 0.1);
}

/* Toast 通知 */
.toast {
  position: fixed;
  bottom: 80px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--vscode-notifications-background);
  border: 1px solid var(--vscode-notifications-border);
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 12px;
  z-index: 1000;
  animation: fadeInOut 2s ease-in-out;
}
@keyframes fadeInOut {
  0% { opacity: 0; transform: translateX(-50%) translateY(10px); }
  15% { opacity: 1; transform: translateX(-50%) translateY(0); }
  85% { opacity: 1; transform: translateX(-50%) translateY(0); }
  100% { opacity: 0; transform: translateX(-50%) translateY(-10px); }
}

/* Follow-up 建議 */
.followup-suggestions {
  margin-left: 32px;
  margin-top: 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.followup-btn {
  background: var(--vscode-button-secondaryBackground);
  color: var(--vscode-button-secondaryForeground);
  border: 1px solid var(--vscode-button-border);
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 11px;
  cursor: pointer;
}
.followup-btn:hover {
  background: var(--vscode-button-secondaryHoverBackground);
}`;
