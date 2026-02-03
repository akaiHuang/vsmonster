# BlueMonster 擴展架構文檔

> 最後更新：2026-02-02  
> 版本：0.1.0  
> 代碼行數：2,467 行 (優化自 5,592 行，減少 56%)

## 📁 目錄結構

```
packages/blue-monster/
├── src/
│   ├── extension.ts          # 主入口 (2,467 行)
│   ├── utils/                 # 工具模組
│   │   ├── index.ts           # 統一匯出
│   │   ├── helpers.ts         # 通用工具函數
│   │   ├── terminal.ts        # 終端機管理
│   │   ├── config.ts          # 配置讀取
│   │   └── tools.ts           # 工具定義與正規化
│   └── webview/               # Webview UI 資源
│       ├── index.ts           # 統一匯出
│       ├── styles.css         # 原始 CSS (~1,290 行)
│       ├── main.js            # 原始 JS (~1,100 行)
│       ├── webview-css.ts     # CSS 作為 TypeScript 常量
│       ├── webview-js.ts      # JS 作為 TypeScript 常量
│       └── webview-html.ts    # HTML 模板
├── dist/
│   └── extension.js           # 編譯輸出 (esbuild 打包)
├── resources/                 # 圖片資源
├── package.json               # 擴展清單
├── tsconfig.json              # TypeScript 配置
└── esbuild.js                 # 構建腳本
```

---

## 🏗️ 模組詳解

### 1. `extension.ts` - 主入口

**職責**：擴展的核心邏輯，包含主要類別和啟動流程。

#### 主要組件

| 組件 | 行數範圍 | 說明 |
|------|----------|------|
| `SYSTEM_PROMPT_TEMPLATE` | ~50-150 | AI 系統提示詞模板 |
| `getWebviewHtml()` | ~260-275 | 生成 Webview HTML |
| `BlueMonsterSession` | ~280-2120 | 核心會話管理類 |
| `McpManager` | ~2125-2195 | MCP 伺服器管理 |
| `BlueMonsterViewProvider` | ~2200-2230 | Sidebar 視圖提供者 |
| `BlueMonsterPanel` | ~2230-2270 | 獨立面板管理 |
| `activate()` | ~2275-2460 | 擴展啟動入口 |
| `deactivate()` | ~2465 | 擴展停用清理 |

#### BlueMonsterSession 類別方法

```typescript
class BlueMonsterSession {
  // === 狀態管理 ===
  private createChatId(): string
  private resetCurrentChat(): void
  private resetActivity(): void
  
  // === 活動記錄 ===
  private recordActivityStep(text: string): void
  private recordActivityFile(entry: ActivityFileEntry): void
  private recordActivityCommand(command: string): void
  private consumeActivityPayload(): ActivityPayload | undefined
  
  // === UI 通訊 ===
  private broadcast(message: Record<string, unknown>): void
  private addMessage(role, text, part?, activity?): void
  private addAssistantResult(result: ChatResult): void
  private setBusy(value: boolean): void
  private setModelLabel(label: string): void
  
  // === 思考狀態 ===
  private startThinking(text?: string): void
  private appendThinking(text: string): void
  private stopThinking(): void
  private requestStop(): void
  
  // === 終端機操作 ===
  private confirmTerminalCommand(command, cwd?): Promise<boolean>
  private confirmTerminalCommandModal(command, cwd?): Promise<boolean>
  private confirmTerminalCommandInline(command, cwd?, dangerType?, category?): Promise<boolean>
  private runTerminalCommand(command, cwd?): Promise<void>
  private runTerminalCommandWithResult(command, cwd?): Promise<string>
  
  // === 檔案操作 (Danger Mode) ===
  async runVsCodeCommandWithResult(command, args?): Promise<string>
  async readFileWithResult(path): Promise<string>
  async writeFileWithResult(path, content): Promise<string>
  async openFileWithResult(path, preview?): Promise<string>
  async switchWindowWithResult(): Promise<string>
  async searchTasksWithResult(query): Promise<string>
  
  // === AI 互動 ===
  private runCli(prompt, memoryContext?): Promise<ChatResult>
  private runLm(prompt, turnCount?, memoryContext?): Promise<ChatResult>
  async selectModel(): Promise<void>
  private listCopilotModels(): Promise<string>
  private getModelOptions(): Promise<ModelOptions>
  private setCopilotModelByName(name): Promise<string>
  private setCliModelByName(name): Promise<string>
  
  // === 確認/選擇處理 ===
  private handleConfirmResponse(message): void
  private handleChoiceResponse(message): void
  async showChoiceToUser(title, description, options): Promise<ChoiceResult>
  private handleApplyModel(message): void
  
  // === 訊息處理 ===
  async handleUserMessage(userText, images?, fileContext?): Promise<void>
  async handleMessage(message): void
  
  // === 歷史記錄 ===
  private normalizeText(value): string
  private tokenize(value): string[]
  private buildSearchText(messages): string
  private buildTokenCounts(searchText): Record<string, number>
  private buildHistoryPreview(messages): string
  private cloneMessages(messages): UiMessage[]
  private ensureHistoryIndex(histories): Promise<ChatHistoryEntry[]>
  private scoreHistory(entry, tokens, normalizedQuery): { score, matchCount }
  private findRelevantHistories(query, limit?): Promise<Array<...>>
  private buildMemoryContext(query): Promise<string>
  private saveCurrentChatToHistory(options?): Promise<void>
  private getChatHistories(query?): Promise<any[]>
  private loadChatHistory(id): Promise<void>
  private exportChat(): Promise<void>
  private insertCodeAtCursor(code): Promise<void>
}
```

---

### 2. `utils/` - 工具模組

#### 2.1 `helpers.ts` - 通用工具函數

| 函數 | 說明 |
|------|------|
| `countLineDiff(before, after)` | 計算文字的行數差異 (LCS 演算法) |
| `extractHeredocWrite(command)` | 從 heredoc 命令提取路徑和內容 |
| `extractRedirectTarget(command)` | 從命令提取重定向目標 |
| `normalizeText(value)` | 正規化文字 (小寫、去空白) |
| `tokenize(value)` | 將文字分詞 (用於搜尋) |
| `normalizeInput(input, validator)` | 通用輸入驗證 |

| 常量 | 說明 |
|------|------|
| `STOP_WORDS` | 搜尋停用詞集合 |

#### 2.2 `terminal.ts` - 終端機管理

| 函數 | 說明 |
|------|------|
| `setupTerminalCloseHandler()` | 監聽終端機關閉事件 |
| `getTerminal(cwd?)` | 取得或建立共享終端機 |
| `disposeTerminal()` | 清理終端機資源 |

#### 2.3 `config.ts` - 配置讀取

| 函數 | 說明 |
|------|------|
| `getConfig()` | 取得 VS Code 配置物件 |
| `getReasoningEffort()` | 取得 Reasoning Effort（含舊設定相容） |
| `getTerminalConfirmationMode()` | 取得終端機確認模式 |
| `setTerminalConfirmationMode(mode)` | 設定終端機確認模式 |
| `getDangerModeEnabled()` | 取得是否啟用 Danger Mode |
| `getPreferredModelId()` | 取得偏好的模型 ID |
| `getMcpAutoStart()` | 取得 MCP 是否自動啟動 |
| `getMcpServers()` | 取得 MCP 伺服器配置列表 |
| `getSafeModeSettings()` | 取得安全模式設定 |
| `detectDangerousCommand(command)` | 偵測危險命令 |
| `shouldConfirmCommand(command, settings)` | 檢查命令是否需要確認 |

| 常量 | 說明 |
|------|------|
| `CONFIG_SECTION` | 配置區段名稱 ('blueMonster') |

| 類型 | 說明 |
|------|------|
| `TerminalConfirmationMode` | 'modal' \| 'chat' \| 'off' |
| `SafeModeSettings` | 安全模式各項開關 |
| `DangerCategory` | 危險命令類別 |
| `DangerInfo` | 危險命令資訊 |
| `McpServerConfig` | MCP 伺服器配置 |

#### 2.4 `tools.ts` - 工具定義與正規化

| 工具常量 | 說明 |
|----------|------|
| `TOOL_NAME` | 終端機工具 |
| `VS_COMMAND_TOOL_NAME` | VS Code 命令工具 |
| `READ_FILE_TOOL_NAME` | 讀取檔案工具 |
| `WRITE_FILE_TOOL_NAME` | 寫入檔案工具 |
| `OPEN_FILE_TOOL_NAME` | 開啟檔案工具 |
| `SWITCH_WINDOW_TOOL_NAME` | 切換視窗工具 |
| `SEARCH_TASKS_TOOL_NAME` | 搜尋任務工具 |

| 定義函數 | 說明 |
|----------|------|
| `terminalToolDefinition()` | 終端機工具定義 |
| `vsCodeCommandToolDefinition()` | VS Code 命令工具定義 |
| `readFileToolDefinition()` | 讀取檔案工具定義 |
| `writeFileToolDefinition()` | 寫入檔案工具定義 |
| `openFileToolDefinition()` | 開啟檔案工具定義 |
| `switchWindowToolDefinition()` | 切換視窗工具定義 |
| `searchTasksToolDefinition()` | 搜尋任務工具定義 |

| 正規化函數 | 說明 |
|------------|------|
| `normalizeToolInput(input)` | 正規化終端機工具輸入 |
| `normalizeVsCodeCommandInput(input)` | 正規化 VS Code 命令輸入 |
| `normalizeReadFileInput(input)` | 正規化讀取檔案輸入 |
| `normalizeWriteFileInput(input)` | 正規化寫入檔案輸入 |
| `normalizeOpenFileInput(input)` | 正規化開啟檔案輸入 |
| `normalizeSearchTasksInput(input)` | 正規化搜尋任務輸入 |

---

### 3. `webview/` - Webview UI 資源

#### 3.1 檔案說明

| 檔案 | 說明 |
|------|------|
| `styles.css` | 原始 CSS 樣式 (可直接編輯) |
| `main.js` | 原始 JavaScript (可直接編輯) |
| `webview-css.ts` | CSS 作為 `WEBVIEW_CSS` 常量導出 |
| `webview-js.ts` | JS 作為 `WEBVIEW_JS` 常量導出 (壓縮版) |
| `webview-html.ts` | HTML 模板作為 `WEBVIEW_HTML_TEMPLATE` 常量導出 |
| `index.ts` | 統一導出所有資源 |

#### 3.2 模板佔位符

HTML 模板使用以下佔位符，在 `getWebviewHtml()` 中替換：

| 佔位符 | 替換值 |
|--------|--------|
| `__NONCE__` | 隨機 nonce 值 (CSP 安全) |
| `__CSP_SOURCE__` | `webview.cspSource` |
| `__AVATAR_URL__` | BlueMonster 頭像 SVG URI |
| `__CSS__` | `WEBVIEW_CSS` 內容 |
| `__JS__` | `WEBVIEW_JS` 內容 |
| `__ASSISTANT_AVATAR_URL__` | (在 JS 中) BlueMonster 頭像 URL |

#### 3.3 CSS 結構 (`styles.css`)

```css
/* 變數定義 */
:root { ... }

/* 容器布局 */
body, #app, .container { ... }

/* Header */
.header, .header-left, .header-right { ... }

/* 訊息區域 */
.messages, .message, .message-content { ... }

/* 程式碼區塊 */
.code-block, .code-header, pre, code { ... }

/* 輸入區域 */
.input-area, .input-row, textarea { ... }

/* 確認對話框 */
.confirmation-box, .confirmation-actions { ... }

/* 歷史記錄 */
.history-panel, .history-item { ... }

/* 活動面板 */
.activity-panel, .activity-section { ... }

/* 響應式 & 動畫 */
@media, @keyframes { ... }
```

#### 3.4 JS 功能 (`main.js`)

```javascript
// 狀態管理
let messages = [];
let isThinking = false;
let pendingConfirmations = new Map();

// VS Code API
const vscode = acquireVsCodeApi();

// 核心函數
function renderMessages() { ... }
function addMessage(role, text, kind, activity) { ... }
function sendMessage() { ... }
function handleConfirmation(id, approved, remember, sessionAllow) { ... }
function toggleHistory() { ... }
function loadHistory(id) { ... }

// 訊息處理
window.addEventListener('message', event => {
  switch (event.data.type) {
    case 'message': ...
    case 'thinking': ...
    case 'thinkingAppend': ...
    case 'thinkingStop': ...
    case 'confirm': ...
    case 'history': ...
    case 'toast': ...
    // ...
  }
});
```

---

## 🔄 資料流

```
┌─────────────────────────────────────────────────────────────┐
│                        VS Code                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐    ┌──────────────────┐    ┌───────────┐  │
│  │   Webview   │◄──►│ BlueMonsterSession│◄──►│  Copilot  │  │
│  │  (UI/HTML)  │    │   (Core Logic)   │    │  LM API   │  │
│  └─────────────┘    └──────────────────┘    └───────────┘  │
│        │                    │                              │
│        │                    ▼                              │
│        │            ┌──────────────┐                       │
│        │            │    utils/    │                       │
│        │            ├──────────────┤                       │
│        │            │ • config.ts  │                       │
│        │            │ • terminal.ts│                       │
│        │            │ • tools.ts   │                       │
│        │            │ • helpers.ts │                       │
│        │            └──────────────┘                       │
│        │                    │                              │
│        │                    ▼                              │
│        │            ┌──────────────┐                       │
│        └───────────►│  Terminal    │                       │
│                     │  (Commands)  │                       │
│                     └──────────────┘                       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 🛠️ 開發指南

### 編譯

```bash
cd packages/blue-monster
npm run compile      # 使用 esbuild 編譯
npx tsc --noEmit     # TypeScript 類型檢查
```

### 測試擴展

```bash
# 方法 1: F5 在 VS Code 中啟動
# 方法 2: 命令行
code --extensionDevelopmentPath="$(pwd)"

# 乾淨測試 (禁用其他擴展)
code --extensionDevelopmentPath="$(pwd)" --disable-extensions
```

### 修改 Webview UI

1. 編輯 `src/webview/styles.css` 或 `src/webview/main.js`
2. 將變更同步到 `webview-css.ts` / `webview-js.ts`
3. 執行 `npm run compile`

### 新增配置項

1. 在 `package.json` 的 `contributes.configuration` 添加設定
2. 在 `utils/config.ts` 添加 getter 函數
3. 在 `utils/index.ts` 導出

### 新增工具

1. 在 `utils/tools.ts` 添加工具常量和定義
2. 添加對應的正規化函數
3. 在 `utils/index.ts` 導出
4. 在 `extension.ts` 的 `BlueMonsterSession` 中實作處理邏輯

---

## 📊 優化歷程

| 版本 | 行數 | 說明 |
|------|------|------|
| 原始 | 5,592 | 單一 extension.ts |
| Phase 1-2 | 5,380 | Config getters 提取 |
| Phase 3 | 2,814 | CSS/JS 獨立化 (-46%) |
| Phase 4 | 2,467 | Utils 模組化 (-56%) |

---

## 🔗 相關文件

- [README.md](./README.md) - 擴展使用說明
- [CHANGELOG.md](./CHANGELOG.md) - 版本更新日誌
- [package.json](./package.json) - 擴展清單與配置
