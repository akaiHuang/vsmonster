// Webview CSS 樣式 - 自動生成，請勿手動編輯此檔案
// 原始檔案：src/webview/styles.css

export const WEBVIEW_CSS = `/* BlueMonster — UFO Dashboard 風格 */
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
  --text: #ffffff;
  --text-2: #d1d5db;
  --text-3: #9ca3af;
  --text-4: #6b7280;
}
* {
  box-sizing: border-box;
}
body {
  margin: 0;
  padding: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 13px;
  color: var(--text);
  background: var(--bg);
  height: 100vh;
  display: flex;
  flex-direction: column;
  -webkit-font-smoothing: antialiased;
}

/* Header */
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  background: var(--bg);
  flex-shrink: 0;
}
.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}
.header-title {
  font-weight: 600;
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text);
}
.header-title .icon {
  font-size: 16px;
}
.header-request-count {
  font-size: 10px;
  font-weight: 600;
  color: var(--monster-light);
  background: rgba(139, 92, 246, 0.15);
  padding: 2px 8px;
  border-radius: 8px;
  margin-left: 4px;
}
.header-right {
  display: flex;
  align-items: center;
  gap: 4px;
}

/* 佇列/預算狀態列 */
.queue-status-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 4px 10px;
  background: var(--card);
  border-bottom: 1px solid var(--border);
  font-size: 11px;
  flex-wrap: wrap;
}
.queue-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 10px;
  font-weight: 500;
}
.queue-badge.running {
  background: rgba(34, 197, 94, 0.15);
  color: var(--green);
}
.queue-badge.waiting {
  background: rgba(245, 158, 11, 0.15);
  color: var(--amber);
}
.queue-badge.budget {
  background: rgba(139, 92, 246, 0.15);
  color: var(--monster-light);
}
.queue-badge.budget-exceeded {
  background: rgba(239, 68, 68, 0.2);
  color: var(--red);
  animation: pulse 1.5s ease-in-out infinite;
}
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

/* 自定義選擇器 */
.custom-select {
  position: relative;
  display: inline-block;
}
.custom-select-trigger {
  background: var(--card);
  color: var(--text-2);
  border: 1px solid var(--border);
  border-radius: 8px;
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
  background: var(--hover);
  border-color: var(--monster);
}
.custom-select-trigger::after {
  content: '';
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  border: 4px solid transparent;
  border-top-color: var(--text-4);
}
.custom-select-trigger.open::after {
  border-top-color: transparent;
  border-bottom-color: var(--text-4);
  transform: translateY(-80%);
}
.custom-select-options {
  position: absolute;
  bottom: calc(100% + 4px);
  left: 0;
  min-width: 100%;
  max-height: 400px;
  overflow-y: auto;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: 0 -4px 20px rgba(0,0,0,0.5);
  z-index: 1000;
  display: none;
}
.custom-select-options.show {
  display: block;
}
.custom-select-option {
  padding: 8px 12px;
  cursor: pointer;
  font-size: 12px;
  color: var(--text-2);
  display: flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}
.custom-select-option:hover {
  background: var(--hover);
}
.custom-select-option.selected {
  color: var(--text);
}
.custom-select-option.selected:hover {
  background: var(--hover);
}
.custom-select-option .check-mark {
  width: 16px;
  height: 16px;
  opacity: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.custom-select-option.selected .check-mark {
  opacity: 1;
}
.custom-select-option .check-mark svg {
  width: 14px;
  height: 14px;
}
.custom-select-option .check-mark svg circle {
  stroke: var(--monster-light);
  fill: none;
  stroke-width: 2;
  stroke-dasharray: 50;
  stroke-dashoffset: 50;
  transform-origin: center;
}
.custom-select-option.selected .check-mark svg circle {
  animation: checkCircle 0.4s ease forwards;
}
.custom-select-option .check-mark svg polyline {
  stroke: var(--monster-light);
  fill: none;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-dasharray: 20;
  stroke-dashoffset: 20;
}
.custom-select-option.selected .check-mark svg polyline {
  animation: checkMark 0.3s ease 0.2s forwards;
}
@keyframes checkCircle {
  to { stroke-dashoffset: 0; }
}
@keyframes checkMark {
  to { stroke-dashoffset: 0; }
}
.custom-select-option .multiplier-badge {
  margin-left: auto;
  font-size: 10px;
  color: var(--text-4);
  background: rgba(107, 114, 128, 0.15);
  padding: 2px 6px;
  border-radius: 6px;
}
.custom-select-option .multiplier-badge.free {
  color: var(--green);
  background: rgba(34, 197, 94, 0.15);
  font-weight: 600;
}
.custom-select-option .reasoning-badge {
  font-size: 10px;
  color: var(--amber);
  background: rgba(245, 158, 11, 0.15);
  padding: 2px 6px;
  border-radius: 6px;
  margin-left: 6px;
}
.custom-select-divider {
  height: 1px;
  background: var(--border);
  margin: 4px 8px;
}
/* Model 折疊選擇器 */
.model-group {
  border-bottom: 1px solid var(--border);
}
.model-group:last-child {
  border-bottom: none;
}
.model-group-header {
  padding: 8px 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  transition: background 0.15s;
}
.model-group-header:hover {
  background: var(--hover);
}
.model-group-header .expand-icon {
  margin-right: 8px;
  font-size: 10px;
  transition: transform 0.2s;
  color: var(--text-4);
}
.model-group.expanded .expand-icon {
  transform: rotate(90deg);
}
.model-group-header .model-name {
  flex: 1;
}
.model-group-header .multiplier-badge {
  margin-left: auto;
  font-size: 10px;
  color: var(--text-4);
  background: rgba(107, 114, 128, 0.15);
  padding: 2px 6px;
  border-radius: 6px;
}
.model-group-header .multiplier-badge.free {
  color: var(--green);
  background: rgba(34, 197, 94, 0.15);
}
.model-group-options {
  display: none;
  background: rgba(0, 0, 0, 0.2);
  padding-left: 20px;
}
.model-group.expanded .model-group-options {
  display: block;
}
.reasoning-option {
  padding: 6px 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  font-size: 13px;
  transition: background 0.15s;
}
.reasoning-option:hover {
  background: var(--hover);
}
.reasoning-option.selected {
  background: rgba(139, 92, 246, 0.1);
}
.reasoning-option .check-mark {
  width: 16px;
  height: 16px;
  margin-right: 8px;
  opacity: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.reasoning-option.selected .check-mark {
  opacity: 1;
}
.reasoning-option .check-mark svg {
  width: 14px;
  height: 14px;
}
.reasoning-option .check-mark svg circle {
  stroke: var(--monster-light);
  fill: none;
  stroke-width: 2;
  stroke-dasharray: 50;
  stroke-dashoffset: 50;
}
.reasoning-option.selected .check-mark svg circle {
  animation: checkCircle 0.4s ease forwards;
}
.reasoning-option .check-mark svg polyline {
  stroke: var(--monster-light);
  fill: none;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-dasharray: 20;
  stroke-dashoffset: 20;
}
.reasoning-option.selected .check-mark svg polyline {
  animation: checkMark 0.3s ease 0.2s forwards;
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
  color: var(--text-3);
  border: none;
  padding: 4px 6px;
  cursor: pointer;
  border-radius: 6px;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 26px;
  height: 26px;
  transition: all 0.15s;
}
.toolbar button:hover {
  background: var(--hover);
  color: var(--text);
}
.toolbar button.active {
  background: var(--monster);
  color: var(--text);
}
.toolbar button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.toolbar .divider {
  width: 1px;
  height: 16px;
  background: var(--border);
  margin: 0 4px;
  align-self: center;
}

/* Messages */
.messages {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
  background: var(--bg);
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
  background: var(--monster);
  color: var(--text);
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
  color: var(--text-2);
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
  padding: 10px 14px;
  text-align: left;
  max-width: 100%;
  background: rgba(139, 92, 246, 0.15);
  border: 1px solid rgba(139, 92, 246, 0.2);
  border-radius: 12px;
  align-self: flex-end;
  color: var(--text);
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
  color: var(--text-4);
}
.message.assistant .message-content {
  max-width: 90%;
  color: var(--text-2);
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
  background: var(--card);
  border: 1px solid var(--border);
  font-size: 11px;
  color: var(--text-2);
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

/* 可折疊步驟卡片 */
.activity-card {
  margin-left: 32px;
  margin-bottom: 8px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--card);
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
  color: var(--text-2);
  list-style: none;
}
.activity-card summary::-webkit-details-marker {
  display: none;
}
.activity-card summary::before {
  content: '▶';
  font-size: 8px;
  transition: transform 0.2s;
  color: var(--text-4);
}
.activity-card[open] summary::before {
  transform: rotate(90deg);
}
.activity-card .card-icon {
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.activity-card .card-icon.done {
  color: var(--green);
}
.activity-card .card-icon.working {
  color: var(--monster-light);
}
.activity-check-svg {
  width: 16px;
  height: 16px;
}
.activity-check-svg circle {
  stroke: var(--green);
  fill: none;
  stroke-width: 2;
  stroke-dasharray: 50;
  stroke-dashoffset: 0;
}
.activity-check-svg polyline {
  stroke: var(--green);
  fill: none;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-dasharray: 20;
  stroke-dashoffset: 0;
}
/* 訊息中的 check icon */
.msg-check-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  vertical-align: middle;
  margin-right: 4px;
}
.msg-check-icon svg {
  width: 16px;
  height: 16px;
}
.msg-check-icon svg circle {
  stroke: var(--monster-light);
  fill: none;
  stroke-width: 2;
  stroke-dasharray: 50;
  stroke-dashoffset: 50;
  animation: msgCheckCircle 0.4s ease forwards;
}
.msg-check-icon svg polyline {
  stroke: var(--monster-light);
  fill: none;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-dasharray: 20;
  stroke-dashoffset: 20;
  animation: msgCheckMark 0.3s ease 0.25s forwards;
}
@keyframes msgCheckCircle {
  to { stroke-dashoffset: 0; }
}
@keyframes msgCheckMark {
  to { stroke-dashoffset: 0; }
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
  border-radius: 6px;
  background: rgba(139, 92, 246, 0.15);
  font-size: 10px;
  font-family: 'SF Mono', Monaco, 'Courier New', monospace;
}
.activity-card .card-badge .plus {
  color: var(--green);
}
.activity-card .card-badge .minus {
  color: var(--red);
}
.activity-card .card-body {
  padding: 8px 12px;
  border-top: 1px solid var(--border);
  font-size: 11px;
  background: var(--bg);
  max-height: 200px;
  overflow-y: auto;
}
.activity-card .card-body pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
  font-family: 'SF Mono', Monaco, 'Courier New', monospace;
}
.activity-card .file-link {
  color: var(--monster-light);
  cursor: pointer;
  text-decoration: underline;
}
.activity-card .file-link:hover {
  color: var(--monster);
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
  color: var(--text-2);
}
.activity-check {
  color: var(--green);
  font-size: 12px;
}
.activity-file {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-2);
  font-size: 12px;
}
.file-badge {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  padding: 2px 6px;
  border-radius: 6px;
  background: var(--bg);
  border: 1px solid var(--border);
  font-family: 'SF Mono', Monaco, 'Courier New', monospace;
  font-size: 11px;
}
.file-badge .plus {
  color: var(--green);
}
.file-badge .minus {
  color: var(--red);
}
.command-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 8px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--card);
  font-family: 'SF Mono', Monaco, 'Courier New', monospace;
  font-size: 12px;
  color: var(--text-2);
}
.command-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--monster-light);
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
  background: var(--card);
  color: var(--text-3);
  border: 1px solid var(--border);
  padding: 3px 8px;
  border-radius: 6px;
  font-size: 11px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  transition: all 0.15s;
}
.message-actions button:hover {
  background: var(--hover);
  color: var(--text);
  border-color: var(--monster);
}

/* Code blocks */
.message-content code {
  background: var(--card);
  padding: 2px 5px;
  border-radius: 4px;
  font-family: 'SF Mono', Monaco, 'Courier New', monospace;
  font-size: 12px;
}
.code-block {
  position: relative;
  margin: 8px 0;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid var(--border);
}
.code-block-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 10px;
  background: var(--card);
  border-bottom: 1px solid var(--border);
}
.code-block-actions {
  display: flex;
  gap: 4px;
}
.code-block-actions button {
  background: transparent;
  color: var(--text-3);
  border: none;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 11px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 3px;
}
.code-block-actions button:hover {
  background: var(--hover);
  color: var(--text);
}
.code-block pre {
  margin: 0;
  padding: 10px 12px;
  background: var(--bg);
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
  font-family: 'SF Mono', Monaco, 'Courier New', monospace;
  white-space: pre-wrap;
  word-wrap: break-word;
}
.code-block-lang {
  font-size: 10px;
  color: var(--text-4);
  font-family: 'SF Mono', Monaco, 'Courier New', monospace;
  text-transform: lowercase;
}

/* Image in message */
.message-attachment {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-left: 32px;
  padding: 6px 8px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--card);
  cursor: pointer;
  max-width: 240px;
  transition: all 0.15s;
}
.message.user .message-attachment {
  margin-left: 0;
  margin-right: 6px;
  align-self: flex-end;
}
.message-attachment:hover {
  background: var(--hover);
  border-color: var(--monster);
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
}
.message-image {
  width: 56px;
  height: 56px;
  border-radius: 6px;
  object-fit: cover;
  border: 1px solid var(--border);
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
  background: var(--card);
  border-left: 3px solid var(--monster);
  border-radius: 0 8px 8px 0;
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
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 12px;
}
.panel-title {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 10px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.panel-meta {
  font-size: 12px;
  opacity: 0.7;
  margin-bottom: 8px;
}
.panel-body {
  font-family: 'SF Mono', Monaco, 'Courier New', monospace;
  font-size: 12px;
  white-space: pre-wrap;
  background: var(--bg);
  padding: 8px 10px;
  border-radius: 8px;
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
  padding: 6px 14px;
  font-size: 12px;
  border-radius: 8px;
  cursor: pointer;
  border: none;
  font-weight: 500;
  transition: all 0.15s;
}
.btn-primary {
  background: var(--monster);
  color: var(--text);
}
.btn-primary:hover {
  background: var(--monster-dim);
}
.btn-secondary {
  background: var(--hover);
  color: var(--text-2);
  border: 1px solid var(--border);
}
.btn-secondary:hover {
  background: var(--card);
  color: var(--text);
}
.btn-danger {
  background: rgba(239, 68, 68, 0.2);
  color: var(--red);
  border: 1px solid var(--red);
}

/* 確認選項 */
.confirm-panel-inline {
  margin: 10px 5%;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid var(--border);
  background: var(--card);
}
.confirm-panel-inline .confirm-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 9px 12px;
  background: var(--bg);
  border-bottom: 1px solid var(--border);
}
.confirm-panel-inline .confirm-title {
  font-size: 12px;
  font-weight: 500;
  color: var(--amber);
}
.confirm-panel-inline .confirm-danger-type {
  font-size: 10px;
  color: var(--text-4);
}
.confirm-panel-inline .confirm-command {
  padding: 10px 12px;
  font-family: 'SF Mono', Monaco, 'Courier New', monospace;
  font-size: 10px;
  line-height: 1.2;
  white-space: pre-wrap;
  word-wrap: break-word;
  color: var(--text-2);
  border-bottom: 1px solid var(--border);
}
.confirm-panel-inline .confirm-cwd {
  padding: 4px 12px;
  font-size: 9px;
  color: var(--text-4);
  border-bottom: 1px solid var(--border);
}
.confirm-options {
  padding: 8px;
}
.confirm-option {
  padding: 8px 12px;
  margin: 4px 0;
  background: var(--bg);
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  transition: all 0.15s;
  font-size: 11px;
  color: var(--text-2);
}
.confirm-option:hover {
  background: var(--hover) !important;
  color: var(--text);
}
.confirm-option .option-num {
  color: var(--monster-light);
  margin-right: 8px;
  font-weight: 500;
}
.confirm-input-wrap {
  display: flex;
  gap: 8px;
  padding: 8px 12px;
  border-top: 1px solid var(--border);
}
.confirm-input-wrap input {
  flex: 1;
  padding: 8px 12px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text);
  font-size: 13px;
  outline: none;
}
.confirm-input-wrap input:focus {
  border-color: var(--monster) !important;
}
.confirm-input-wrap button {
  padding: 8px 16px;
  border-radius: 8px;
  background: var(--monster);
  color: var(--text);
  border: none;
  cursor: pointer;
  font-weight: 500;
  transition: all 0.15s;
}
.confirm-input-wrap button:hover {
  background: var(--monster-dim);
}
.confirm-hint {
  padding: 6px 12px;
  font-size: 11px;
  color: var(--text-4);
}

/* Activity panel */
.activity-panel {
  margin: 8px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 14px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 12px;
  font-size: 12px;
  position: relative;
}
.activity-panel[hidden] {
  display: none !important;
}
.activity-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  color: var(--text);
}
.activity-status {
  background: linear-gradient(90deg, var(--monster-light) 0%, var(--monster-light) 40%, #ffffff 50%, var(--monster-light) 60%, var(--monster-light) 100%);
  background-size: 200% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: textShimmer 2s linear infinite;
}
.activity-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: var(--text-3);
  font-size: 11.5px;
}
.activity-line {
  display: flex;
  align-items: flex-start;
  gap: 6px;
}
.activity-line::before {
  content: "•";
  color: var(--monster-light);
}
@keyframes textShimmer {
  0% { background-position: 100% 0; }
  100% { background-position: -100% 0; }
}
.spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(139, 92, 246, 0.2);
  border-top-color: var(--monster);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}

/* 任務清單面板 */
.history-panel {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  width: 100%;
  height: 100%;
  background: var(--bg);
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
  background: var(--card);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 8px;
  outline: none;
}
.history-search input::placeholder {
  color: var(--text-4);
}
.history-search input:focus {
  border-color: var(--monster);
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
  color: var(--text-4);
  font-weight: 500;
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
  background: var(--hover);
}
.history-item-icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  flex-shrink: 0;
  object-fit: cover;
}
.history-item-avatar {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  background: var(--card);
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
  color: var(--monster-light);
  font-family: 'SF Mono', Monaco, 'Courier New', monospace;
  flex-shrink: 0;
  background: rgba(139, 92, 246, 0.15);
  padding: 2px 6px;
  border-radius: 6px;
  font-weight: 500;
}
.history-item-agent {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
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
  color: var(--green);
  background: rgba(34, 197, 94, 0.15);
}
.history-item-status.busy {
  color: var(--cyan);
  background: rgba(6, 182, 212, 0.15);
  animation: pulse 1.5s ease-in-out infinite;
}
.history-item-status.waiting {
  color: var(--amber);
  background: rgba(245, 158, 11, 0.15);
  animation: pulse 2s ease-in-out infinite;
}
.history-item-status.archived {
  color: var(--text-4);
  background: rgba(107, 114, 128, 0.1);
}
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
.history-item.active {
  border-left: 2px solid var(--green);
  background: rgba(34, 197, 94, 0.05);
}
.history-item.busy {
  border-left: 2px solid var(--monster);
  background: rgba(139, 92, 246, 0.05);
}
.history-item.waiting {
  border-left: 2px solid var(--amber);
  background: rgba(245, 158, 11, 0.05);
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
  color: var(--text-4);
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

/* Input area */
.input-area {
  padding: 10px 12px;
  background: var(--bg);
  border-top: 1px solid var(--border);
  flex-shrink: 0;
  position: sticky;
  bottom: 0;
  z-index: 2;
}

.input-container {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  transition: border-color 0.15s;
}
@media (max-width: 300px) {
  .input-footer-toolbar .select-pill {
    display: none;
  }
}

.input-container:focus-within {
  border-color: var(--monster);
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
  background: var(--card);
  color: var(--text-2);
  padding: 4px 8px;
  border-radius: 8px;
  font-size: 11px;
  user-select: none;
  border: 1px solid var(--border);
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
  border-radius: 4px;
  object-fit: cover;
  border: 1px solid var(--border);
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
  background: var(--text-4);
  color: var(--bg);
  cursor: pointer;
  font-size: 12px;
  font-weight: bold;
  border: none;
  padding: 0;
  line-height: 1;
}
.attachment-chip .chip-remove:hover {
  background: var(--red);
  color: var(--text);
}

.input-wrapper {
  position: relative;
}

.input-textarea {
  width: 100%;
  min-height: 24px;
  max-height: 200px;
  padding: 4px 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 13px;
  background: transparent;
  color: var(--text);
  border: none;
  resize: none;
  outline: none;
  line-height: 1.5;
}
.input-textarea::placeholder {
  color: var(--text-4);
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
  color: var(--text-3);
  padding: 4px;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}
.icon-btn:hover {
  background: var(--hover);
  color: var(--text);
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
  background: var(--card);
  color: var(--text-2);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 4px 8px;
  font-size: 11px;
  white-space: nowrap;
  box-shadow: 0 4px 16px rgba(0,0,0,0.5);
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
  background: var(--monster);
  color: #ffffff;
  border: none;
  border-radius: 50%;
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s;
}
.send-icon-btn:hover {
  background: var(--monster-dim);
}
.send-icon-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
  background: var(--text-4);
}
.send-icon-btn svg {
  width: 14px;
  height: 14px;
  fill: currentColor;
}

.stop-icon-btn {
  background: transparent;
  border: 1px solid var(--red);
  color: var(--red);
  border-radius: 50%;
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s;
}
.stop-icon-btn:hover {
  background: rgba(239, 68, 68, 0.15);
}

/* Toast 通知 */
.toast {
  position: fixed;
  bottom: 80px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--card);
  border: 1px solid var(--border);
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 12px;
  color: var(--text);
  z-index: 1000;
  animation: fadeInOut 2s ease-in-out;
  box-shadow: 0 4px 16px rgba(0,0,0,0.4);
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
  background: var(--card);
  color: var(--text-2);
  border: 1px solid var(--border);
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s;
}
.followup-btn:hover {
  background: var(--hover);
  border-color: var(--monster);
  color: var(--text);
}`;
