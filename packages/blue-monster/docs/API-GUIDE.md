# BlueMonster API 使用指南

BlueMonster 提供 VS Code 命令和 WebView 訊息 API，讓你可以程式化控制聊天功能。

---

## 目錄

0. [創建任務](#0-創建任務)
1. [顯示所有任務清單和 ID](#1-顯示所有任務清單和-id)
2. [用 ID 查看聊天內容](#2-用-id-查看聊天內容)
3. [切換模型](#3-切換模型)
4. [切換模式](#4-切換模式)
5. [在任務中發送訊息](#5-在任務中發送訊息)

---

## VS Code 命令

BlueMonster 註冊了以下 VS Code 命令，可透過命令面板或 API 呼叫：

| 命令 ID | 功能 |
|---------|------|
| `blueMonster.openView` | 開啟 BlueMonster 側邊欄 |
| `blueMonster.openPanel` | 開啟 BlueMonster 面板 |
| `blueMonster.selectModel` | 選擇 AI 模型 |
| `blueMonster.clearHistory` | 清除當前聊天記錄 |
| `blueMonster.mcp.startAll` | 啟動所有 MCP 伺服器 |
| `blueMonster.mcp.stopAll` | 停止所有 MCP 伺服器 |

### 使用方式

```typescript
// 在你的擴展中呼叫 BlueMonster 命令
await vscode.commands.executeCommand('blueMonster.openView');
await vscode.commands.executeCommand('blueMonster.selectModel');
```

---

## 0. 創建任務

### 方法 A：透過 UI 創建

1. 開啟 BlueMonster 側邊欄 (`blueMonster.openView`)
2. 在輸入框輸入訊息並按 Enter
3. 系統自動創建新任務並分配任務 ID（格式：`#0001`）

### 方法 B：透過命令創建

```typescript
// 先開啟 BlueMonster 視圖
await vscode.commands.executeCommand('blueMonster.openView');

// 如果需要清除當前對話開始新任務
await vscode.commands.executeCommand('blueMonster.clearHistory');
```

### 方法 C：透過 WebView 訊息創建

如果你有 WebView 的引用，可以發送 `newChat` 訊息：

```javascript
// 在 WebView 內部
vscode.postMessage({ type: 'newChat' });
```

### 任務 ID 格式

- 格式：`#0001`, `#0002`, `#0003`...
- 自動遞增，從 `#0001` 開始
- 在歷史記錄中可見

---

## 1. 顯示所有任務清單和 ID

### 方法 A：透過 UI 查看

1. 開啟 BlueMonster 側邊欄
2. 點擊「History」圖示或展開歷史面板
3. 所有任務以列表顯示，包含：
   - 任務 ID（如 `#0001`）
   - 標題（首則訊息摘要）
   - 日期
   - 訊息數量

### 方法 B：透過 WebView 訊息取得

```javascript
// 在 WebView 內部請求歷史記錄
vscode.postMessage({ type: 'getHistory', query: '' });

// 監聽回應
window.addEventListener('message', event => {
  const message = event.data;
  if (message.type === 'chatHistories') {
    console.log('任務清單:', message.histories);
    // 結構: [{ id, taskId, title, date, messageCount, preview }, ...]
  }
});
```

### 歷史記錄結構

```typescript
interface TaskSummary {
  id: string;         // 內部 UUID
  taskId: string;     // 顯示 ID，如 "#0001"
  title: string;      // 任務標題
  date: string;       // 創建日期
  messageCount: number; // 訊息數量
  preview: string;    // 內容預覽
}
```

### 搜尋任務

```javascript
// 帶搜尋關鍵字
vscode.postMessage({ type: 'getHistory', query: '搜尋關鍵字' });
```

---

## 2. 用 ID 查看聊天內容

### 方法 A：透過 UI 載入

1. 在歷史面板中點擊任務項目
2. 自動載入該任務的完整聊天記錄

### 方法 B：透過 WebView 訊息載入

```javascript
// 使用內部 ID 載入歷史對話
vscode.postMessage({ type: 'loadHistory', id: '對話的內部UUID' });

// 注意：這裡使用的是內部 id，不是 taskId (#0001)
// 你需要先透過 getHistory 取得 id 對應關係
```

### 完整流程範例

```javascript
// 1. 取得所有任務
vscode.postMessage({ type: 'getHistory', query: '' });

// 2. 監聽回應並找到目標任務
window.addEventListener('message', event => {
  const message = event.data;
  
  if (message.type === 'chatHistories') {
    // 找到 taskId 為 #0001 的任務
    const task = message.histories.find(h => h.taskId === '#0001');
    if (task) {
      // 3. 載入該任務
      vscode.postMessage({ type: 'loadHistory', id: task.id });
    }
  }
  
  if (message.type === 'history') {
    // 4. 收到完整聊天記錄
    console.log('聊天內容:', message.messages);
  }
});
```

### 聊天訊息結構

```typescript
interface UiMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  kind?: 'text' | 'image';
  dataUrl?: string;    // 圖片 base64
  mimeType?: string;
  name?: string;
  ts?: number;         // 時間戳記
  activity?: {         // 活動記錄
    steps: string[];
    files: string[];
    commands: string[];
  };
}
```

---

## 3. 切換模型

### 方法 A：透過命令面板

1. `Cmd+Shift+P` (macOS) 或 `Ctrl+Shift+P` (Windows/Linux)
2. 輸入 "BlueMonster: Select Model"
3. 選擇想要的模型

### 方法 B：透過程式碼

```typescript
await vscode.commands.executeCommand('blueMonster.selectModel');
```

### 方法 C：透過 WebView 訊息

```javascript
// 請求可用模型列表
vscode.postMessage({ type: 'requestModelOptions' });

// 監聽回應
window.addEventListener('message', event => {
  if (event.data.type === 'modelOptions') {
    console.log('可用模型:', event.data.options);
    // options: [{ label: 'GPT-4o', value: 'gpt-4o' }, ...]
  }
});

// 切換到指定模型
vscode.postMessage({ type: 'applyModel', value: 'gpt-4o' });
```

### 支援的模型

| 模型值 | 說明 |
|--------|------|
| `gpt-4o` | GPT-4o (推薦) |
| `gpt-4o-mini` | GPT-4o Mini (快速) |
| `o1` | O1 推理模型 |
| `o1-mini` | O1 Mini |
| `o3-mini` | O3 Mini |
| `claude-3.5-sonnet` | Claude 3.5 Sonnet |
| `claude-3.7-sonnet` | Claude 3.7 Sonnet |
| `claude-3.7-sonnet-thought` | Claude 3.7 Sonnet (Thought) |
| `gemini-2.0-flash-001` | Gemini 2.0 Flash |

### 方法 D：透過 UI 下拉選單

在聊天介面頂部有模型選擇器，直接點選切換。

---

## 4. 切換模式

BlueMonster 有三種操作模式：

| 模式 | 說明 |
|------|------|
| `plan` | 計畫模式 - 只進行對話，不執行任何命令 |
| `agent-safe` | 代理-安全模式 - 危險命令需要確認 |
| `agent-yolo` | 代理-危險模式 - 自動執行所有命令 |

### 方法 A：透過 UI 切換

在聊天介面頂部有模式選擇器（下拉選單），可選擇：
- 計畫
- 代理-安全
- 代理-危險

### 方法 B：透過 WebView 訊息

```javascript
// 切換模式（發送訊息時指定）
vscode.postMessage({
  type: 'userMessage',
  text: '你的訊息內容',
  mode: 'plan'  // 或 'agent-safe' 或 'agent-yolo'
});
```

### 模式行為差異

```
┌─────────────┬───────────────┬─────────────┬─────────────┐
│   命令類型   │    計畫模式    │  代理-安全   │  代理-危險   │
├─────────────┼───────────────┼─────────────┼─────────────┤
│ 危險命令     │   ❌ 不執行    │  ⚠️ 需確認   │  ✅ 自動執行 │
│ 一般命令     │   ❌ 不執行    │  ✅ 自動執行 │  ✅ 自動執行 │
│ 聊天對話     │   ✅ 正常      │  ✅ 正常     │  ✅ 正常     │
└─────────────┴───────────────┴─────────────┴─────────────┘
```

### 危險命令類別（可在設定中配置）

- `rm` - 刪除檔案/資料夾
- `mv` - 移動/重新命名
- `chmod` - 變更權限
- `chown` - 變更擁有者
- `sudo` - 超級使用者
- `dd` - 低階磁碟操作
- `mkfs` - 格式化
- `kill` - 終止程序
- `reboot/shutdown` - 重啟/關機
- `curl | sh` - 管道執行
- `git push --force` - 強制推送

---

## 5. 在任務中發送訊息

### 方法 A：透過 UI 輸入

1. 在聊天輸入框輸入訊息
2. 按 Enter 或點擊發送按鈕

### 方法 B：透過 WebView 訊息

```javascript
// 發送純文字訊息
vscode.postMessage({
  type: 'userMessage',
  text: '你好，請幫我寫一個 Hello World',
  mode: 'agent-safe'  // 可選，預設使用當前選擇的模式
});

// 發送帶圖片的訊息
vscode.postMessage({
  type: 'userMessage',
  text: '請分析這張圖片',
  mode: 'plan',
  images: [{
    dataUrl: 'data:image/png;base64,...',
    mimeType: 'image/png'
  }]
});

// 發送帶附件的訊息
vscode.postMessage({
  type: 'userMessage',
  text: '請檢視這個檔案',
  mode: 'agent-safe',
  files: [{
    name: 'example.ts',
    path: '/path/to/example.ts'
  }]
});
```

### 訊息參數

```typescript
interface UserMessagePayload {
  type: 'userMessage';
  text: string;                    // 訊息內容
  mode?: 'plan' | 'agent-safe' | 'agent-yolo';  // 操作模式
  images?: Array<{                 // 圖片附件
    dataUrl: string;
    mimeType: string;
  }>;
  files?: Array<{                  // 檔案附件
    name: string;
    path: string;
  }>;
}
```

### 停止生成

```javascript
vscode.postMessage({ type: 'stop' });
```

### 監聽回應

```javascript
window.addEventListener('message', event => {
  const message = event.data;
  
  switch (message.type) {
    case 'append':
      // 新訊息
      console.log('新訊息:', message.message);
      break;
    case 'busy':
      // 忙碌狀態
      console.log('忙碌中:', message.value);
      break;
    case 'thinking':
      // 思考日誌
      console.log('思考:', message.text);
      break;
    case 'toast':
      // 通知訊息
      console.log('通知:', message.text);
      break;
  }
});
```

---

## 完整 API 參考

### WebView → Extension 訊息類型

| type | 說明 | 參數 |
|------|------|------|
| `ready` | WebView 已就緒 | - |
| `userMessage` | 發送使用者訊息 | `text`, `mode?`, `images?`, `files?` |
| `newChat` | 開始新對話 | - |
| `getHistory` | 取得歷史記錄 | `query?` |
| `loadHistory` | 載入歷史對話 | `id` |
| `exportChat` | 匯出對話 | - |
| `stop` | 停止生成 | - |
| `clear` | 清除對話 | - |
| `applyModel` | 切換模型 | `value` |
| `requestModelOptions` | 請求模型列表 | - |
| `selectFiles` | 選擇檔案附件 | `includeActive?` |
| `openFile` | 開啟檔案 | `path` |
| `insertCode` | 插入程式碼 | `code` |
| `runInTerminal` | 執行終端命令 | `command` |
| `viewImage` | 檢視圖片 | `dataUrl` |
| `openSettings` | 開啟設定 | - |

### Extension → WebView 訊息類型

| type | 說明 | 參數 |
|------|------|------|
| `history` | 完整聊天記錄 | `messages` |
| `append` | 新增訊息 | `message` |
| `model` | 當前模型 | `label` |
| `modelOptions` | 可用模型列表 | `options`, `currentValue` |
| `busy` | 忙碌狀態 | `value` |
| `thinking` | 思考日誌 | `text`, `reset?` |
| `toast` | 通知訊息 | `text` |
| `chatHistories` | 歷史記錄列表 | `histories` |
| `filesSelected` | 已選擇的檔案 | `files` |
| `confirm` | 確認對話框 | `id`, `message`, `options?` |
| `confirmResult` | 確認結果 | `id`, `approved` |
| `choose` | 選擇對話框 | `id`, `options` |

---

## 設定參考

在 VS Code 設定中搜尋 `blueMonster` 可配置：

```json
{
  // 預設模型
  "blueMonster.model": "gpt-4o",
  
  // 安全模式確認設定
  "blueMonster.safeMode.confirmRm": true,
  "blueMonster.safeMode.confirmMv": true,
  "blueMonster.safeMode.confirmChmod": true,
  "blueMonster.safeMode.confirmSudo": true,
  "blueMonster.safeMode.confirmGitPushForce": true,
  // ... 更多確認項目
  
  // MCP 伺服器設定
  "blueMonster.mcp.servers": []
}
```

---

## 範例：自動化腳本

```typescript
import * as vscode from 'vscode';

async function automateBlueMonster() {
  // 1. 開啟 BlueMonster
  await vscode.commands.executeCommand('blueMonster.openView');
  
  // 2. 清除舊對話，開始新任務
  await vscode.commands.executeCommand('blueMonster.clearHistory');
  
  // 3. 選擇模型
  await vscode.commands.executeCommand('blueMonster.selectModel');
  
  // 注意：發送訊息需要透過 WebView 訊息機制
  // 這需要在擴展中取得 WebView 的引用
}
```

---

## 常見問題

### Q: 如何取得 WebView 的引用？

WebView 是內部管理的，如果你要從外部擴展發送訊息，目前需要：
1. 透過 VS Code 命令 API 間接操作
2. 或修改 BlueMonster 擴展暴露更多 API

### Q: taskId 和 id 有什麼區別？

- `taskId`：顯示用的編號（如 `#0001`），方便使用者識別
- `id`：內部 UUID，用於資料操作

### Q: 如何在自己的擴展中整合 BlueMonster？

可以透過 VS Code 的擴展依賴機制，在你的 `package.json` 中加入：

```json
{
  "extensionDependencies": ["vsmonster.blue-monster"]
}
```

然後使用 `vscode.commands.executeCommand` 呼叫 BlueMonster 命令。
