# Copilot SDK 多工研究報告

> 研究日期：2026-02-02

## 📋 目錄

1. [當前實作分析](#當前實作分析)
2. [Copilot SDK 概述](#copilot-sdk-概述)
3. [Request 計算方式](#request-計算方式)
4. [多工實作方案](#多工實作方案)
5. [建議與結論](#建議與結論)

---

## 當前實作分析

### 現有架構

```typescript
// 目前使用 Map 管理多個任務
class BlueMonsterSession {
  private tasks: Map<string, TaskState> = new Map();
  private activeChatId: string;
  
  // 每個任務有獨立狀態
  interface TaskState {
    chatId: string;
    messages: UiMessage[];
    busy: boolean;
    // ...
  }
}
```

### 問題：共用 Language Model API 連線

```
任務 A (執行中) ──┐
                 ├──► VS Code LM API ──► Copilot Server
任務 B (等待中) ──┘
```

- **實際行為**：任務是「交錯執行」而非「並行執行」
- **原因**：`vscode.lm.sendRequest()` 是 async，但我們一次只處理一個
- **結果**：用戶感知上像是並行（可以切換），但 AI 回應是串行的

---

## Copilot SDK 概述

### GitHub Copilot SDK

```
Repository: https://github.com/github/copilot-sdk
```

### 核心概念

```typescript
import { CopilotClient, TurnBasedConversation } from '@anthropic-ai/copilot-sdk';

// 創建客戶端
const client = new CopilotClient({
  token: process.env.GITHUB_TOKEN
});

// 每個對話是獨立的
const conversation1 = new TurnBasedConversation(client);
const conversation2 = new TurnBasedConversation(client);

// 可以並行發送請求
await Promise.all([
  conversation1.sendMessage("任務 A"),
  conversation2.sendMessage("任務 B")
]);
```

### SDK vs VS Code LM API 比較

| 特性 | VS Code LM API | Copilot SDK |
|------|----------------|-------------|
| 整合方式 | 內建於 VS Code | 需要額外安裝 |
| 認證 | 自動（Copilot 登入） | 需要 GitHub Token |
| 多對話支援 | 需手動管理 | 原生支援 |
| 工具調用 | 原生支援 | 需要額外實作 |
| 適用場景 | VS Code 擴充套件 | 獨立應用程式 |

---

## Request 計算方式

### ⚠️ 重要：Copilot Request 的定義

```
┌─────────────────────────────────────────────────────────┐
│  1 Request = 1 次模型調用（不論對話長度）              │
│                                                         │
│  用戶: "寫一個函數"     ←─ 開始                        │
│  AI: "好的，這是..."    ←─ 結束 = 1 Request            │
│                                                         │
│  用戶: "加上錯誤處理"   ←─ 開始                        │
│  AI: "已更新..."        ←─ 結束 = 1 Request            │
│                                                         │
│  總計: 2 Requests                                       │
└─────────────────────────────────────────────────────────┘
```

### 持續對話 vs 新對話

```
情境 A：同一對話持續 10 輪
→ 10 Requests（每輪 1 個）

情境 B：開 5 個新任務各 2 輪
→ 10 Requests（5 × 2）

結論：Request 數量 = 模型調用次數，與對話數無關
```

### Token 消耗 vs Request 數量

| 計費項目 | 說明 |
|----------|------|
| **Request 數量** | 模型調用次數（可能有每日/每月限制） |
| **Token 消耗** | 輸入 + 輸出的 token 數量 |
| **Multiplier** | 不同模型的消耗倍率（0x ~ 10x） |

---

## 多工實作方案

### 方案 1：現有架構優化（推薦）

**原理**：保持現有架構，加入 Request 計數和佇列管理

```typescript
// Request 計數器
interface TaskState {
  // ... 現有欄位
  requestCount: number;  // 新增：此任務的 request 數量
}

// 全局計數
class BlueMonsterSession {
  private totalRequests: number = 0;
  
  private async sendToModel(messages: any[]) {
    this.totalRequests++;
    this.currentTask.requestCount++;
    // ... 發送請求
  }
}
```

**優點**：
- 改動最小
- 不影響現有功能
- 可以追蹤使用量

### 方案 2：智慧佇列管理

**原理**：限制同時執行的請求數量

```typescript
const MAX_CONCURRENT = 2;  // 最多同時 2 個請求

class RequestQueue {
  private queue: Array<() => Promise<void>> = [];
  private running: number = 0;
  
  async enqueue(task: () => Promise<void>) {
    if (this.running < MAX_CONCURRENT) {
      this.running++;
      await task();
      this.running--;
      this.processNext();
    } else {
      this.queue.push(task);
    }
  }
}
```

### 方案 3：完整 SDK 整合（複雜）

**原理**：使用 Copilot SDK 實現真正的並行

```typescript
// 需要在 gateway 伺服器端實作
import { CopilotClient } from '@anthropic-ai/copilot-sdk';

class MultiTaskManager {
  private conversations: Map<string, TurnBasedConversation> = new Map();
  
  async sendMessage(taskId: string, message: string) {
    let conv = this.conversations.get(taskId);
    if (!conv) {
      conv = new TurnBasedConversation(this.client);
      this.conversations.set(taskId, conv);
    }
    return await conv.sendMessage(message);
  }
}
```

**注意**：這需要在後端（gateway）實作，不是在 VS Code 擴充套件中。

---

## 建議與結論

### 📊 方案比較

| 方案 | 複雜度 | 並行能力 | Request 消耗 | 建議 |
|------|--------|----------|--------------|------|
| 方案 1 | ⭐ | 串行 | 可追蹤 | ✅ 立即實作 |
| 方案 2 | ⭐⭐ | 有限並行 | 可控制 | 🔜 下一步 |
| 方案 3 | ⭐⭐⭐⭐ | 完全並行 | 最高 | 📅 未來考慮 |

### 🎯 立即行動項目

1. **實作 Request 計數器**
   - 在 TaskState 加入 `requestCount`
   - 在 Header 顯示當前任務的 request 數量
   - 格式：`🐿️ Hazel (02 requests)`

2. **加入使用量提示**
   - 當單一任務超過 10 requests 時提醒
   - 顯示模型的 multiplier 對應消耗

### 💡 為什麼不需要 SDK？

對於 BlueMonster 的使用場景：
- VS Code LM API 已經足夠
- 用戶通常不需要真正的並行（切換任務即可）
- 串行執行反而能控制 request 消耗
- SDK 需要額外的 token 管理和認證

### 🔮 未來可能需要 SDK 的情況

- 建立獨立的 AI 助手應用（不依賴 VS Code）
- 需要真正的批次處理多個任務
- 需要更精細的 token 計費控制
