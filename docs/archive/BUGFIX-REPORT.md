# VSMONSTER 編譯錯誤修復報告

## 修復日期
2026-02-01

## 修復的問題

### ✅ 1. TypeScript 編譯錯誤

#### 1.1 Import 路徑錯誤
**檔案**: 
- `packages/gateway/src/channels/line/index.ts`
- `packages/gateway/src/channels/telegram/index.ts`

**修復內容**:
```typescript
// 修復前
import { ChannelAdapter, IncomingMessage, OutgoingMessage } from './base';
import { logger } from '../utils/logger';

// 修復後
import { ChannelAdapter, IncomingMessage, OutgoingMessage } from '../base';
import { logger } from '../../utils/logger';
```

**原因**: 這些文件位於 `line/` 和 `telegram/` 子目錄中，需要使用 `../` 來訪問上層目錄的 `base.ts`。

---

#### 1.2 TaskManager API 不存在
**檔案**: `packages/gateway/src/task/manager.ts`

**新增方法**:
```typescript
getUserTasks(userId: string): Task[]
updateTaskStatus(taskId: string, status: TaskStatus, progress?: number): void
completeTask(taskId: string): void
updateTaskProgress(taskId: string, progress: number): void
```

**原因**: `commands/processor.ts` 中使用了這些方法，但 TaskManager 中沒有定義。新增這些方法作為現有方法的別名或包裝器。

---

#### 1.3 型別不匹配
**檔案**: `packages/gateway/src/config/loader.ts`

**修復內容**:
```typescript
// 修復前
if (process.env.DISCORD_BOT_TOKEN) {
  config.channels.discord = {
    botToken: process.env.DISCORD_BOT_TOKEN,
    applicationId: process.env.DISCORD_APPLICATION_ID || '', // ❌ string | undefined
  };
}

// 修復後
if (process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_APPLICATION_ID) {
  config.channels.discord = {
    botToken: process.env.DISCORD_BOT_TOKEN,
    applicationId: process.env.DISCORD_APPLICATION_ID, // ✅ string
  };
}
```

---

#### 1.4 process 變數名稱衝突
**檔案**: `packages/gateway/src/mcp/controller.ts`

**修復內容**:
```typescript
// 修復前
const process = spawn(...);
process.on('error', ...);

// 修復後
const childProcess = spawn(...);
childProcess.on('error', ...);
```

**原因**: `process` 是 Node.js 的全域變數，使用相同名稱的區域變數會導致型別推斷錯誤。

---

#### 1.5 VSMONSTERConfig 缺少屬性
**檔案**: `packages/gateway/src/config/loader.ts`

**新增屬性**:
```typescript
export interface VSMONSTERConfig {
  port: number;
  channels: ChannelsConfig;
  tunnel?: TunnelConfig;
  mcp?: MCPConfig;
  moltbotGatewayUrl?: string; // ← 新增
}
```

**原因**: `server-simplified.ts` 中使用了 `config.moltbotGatewayUrl`，但介面中未定義。

---

### ✅ 2. 缺少必要依賴

**檔案**: `packages/gateway/package.json`

**新增依賴**:
```json
{
  "dependencies": {
    "@line/bot-sdk": "^9.3.0",
    "@discordjs/rest": "^2.2.0",
    "discord-api-types": "^0.37.61",
    "grammy": "^1.19.2",
    "ngrok": "^5.0.0-beta.2",
    "telegraf": "^4.15.0"
  }
}
```

**修復的錯誤**:
- `Cannot find module 'ngrok'`
- `Cannot find module 'grammy'`
- `Cannot find module '@line/bot-sdk'`

---

### ✅ 3. 配置檔案載入路徑問題

**檔案**: `packages/gateway/src/config/loader.ts`

**修復內容**:
```typescript
export function loadConfig(): VSMONSTERConfig {
  const configPaths = [
    // 當前工作目錄
    path.join(process.cwd(), 'configs', 'config.json'),
    path.join(process.cwd(), 'config.json'),
    
    // 專案根目錄（從 packages/gateway 往上兩層）
    path.join(process.cwd(), '..', '..', 'configs', 'config.json'),
    path.join(process.cwd(), '..', '..', 'config.json'),
    
    // 使用 __dirname（編譯後的位置）
    path.join(__dirname, '..', '..', 'configs', 'config.json'),
    path.join(__dirname, '..', '..', '..', '..', 'configs', 'config.json'),
    
    // 用戶主目錄
    path.join(process.env.HOME || '', '.vsmonster', 'config.json'),
  ];
  // ...
}
```

**改進點**:
1. 添加檢查專案根目錄的路徑（monorepo 支援）
2. 使用 `__dirname` 處理編譯後的執行環境
3. 支援多種部署場景

---

## 安裝與測試步驟

### 1. 安裝依賴
```bash
cd /Users/akaihuangm1/Desktop/vsmonster
pnpm install
```

### 2. 編譯 Gateway
```bash
cd packages/gateway
pnpm build
```

**預期結果**: 無 TypeScript 編譯錯誤

### 3. 配置設定
複製配置範例並填入憑證：

```bash
# 從專案根目錄
cp configs/config.example.json configs/config.json
# 編輯 configs/config.json 填入你的 LINE/Telegram/Discord 憑證
```

或使用環境變數：
```bash
cp .env.example .env
# 編輯 .env 填入憑證
```

### 4. 啟動 Gateway
```bash
# 方法 1: 從專案根目錄
cd /Users/akaihuangm1/Desktop/vsmonster
pnpm --filter gateway start

# 方法 2: 從 gateway 目錄
cd packages/gateway
pnpm start

# 方法 3: 開發模式（自動重啟）
cd packages/gateway
pnpm dev
```

**預期結果**:
```
INFO: Loading config from /path/to/vsmonster/configs/config.json
INFO: Initialized 1 channel(s)
INFO: LINE Bot initialized: YourBotName
INFO: VSMONSTER Gateway listening on port 3000
```

---

## 配置文件位置優先級

Gateway 會按以下順序查找配置文件：

1. `{cwd}/configs/config.json`
2. `{cwd}/config.json`
3. `{cwd}/../../configs/config.json` ← **Monorepo 根目錄**
4. `{cwd}/../../config.json`
5. `{__dirname}/../../configs/config.json`
6. `{__dirname}/../../../../configs/config.json`
7. `~/.vsmonster/config.json`
8. 環境變數（最低優先級）

**建議**:
- 開發環境：使用 `{專案根目錄}/configs/config.json`
- 生產環境：使用環境變數或 `~/.vsmonster/config.json`

---

## 驗證修復

### 檢查編譯
```bash
cd packages/gateway
pnpm build
echo $? # 應該輸出 0（成功）
```

### 檢查配置載入
```bash
# 創建測試配置
cat > configs/config.json << EOF
{
  "port": 3000,
  "channels": {
    "line": {
      "channelAccessToken": "test-token",
      "channelSecret": "test-secret"
    }
  }
}
EOF

# 啟動並檢查日誌
pnpm --filter gateway dev
```

應該看到：
```
✅ Loading config from .../configs/config.json
✅ Initialized 1 channel(s)
✅ LINE Bot initialized
```

---

## 已知限制

### 1. Discord 配置要求
Discord 必須同時提供 `DISCORD_BOT_TOKEN` 和 `DISCORD_APPLICATION_ID`，否則不會初始化。

### 2. Ngrok 依賴版本
使用 `ngrok@5.0.0-beta.2`，這是 beta 版本。如果遇到穩定性問題，可降級到 `ngrok@^4.0.0`。

### 3. 環境變數優先級
如果同時存在 `configs/config.json` 和 `.env`，會優先使用 `config.json`。

---

## 後續建議

### 1. 添加配置驗證
建議在 `loadConfig()` 中添加配置驗證：

```typescript
function validateConfig(config: VSMONSTERConfig): void {
  if (config.channels.line) {
    if (!config.channels.line.channelAccessToken || 
        !config.channels.line.channelSecret) {
      throw new Error('LINE config incomplete');
    }
  }
  // ... 其他驗證
}
```

### 2. 改善錯誤訊息
當配置文件找不到時，提供更清晰的錯誤訊息：

```typescript
if (!configFound) {
  console.error(`
❌ 找不到配置文件！

已查找的位置：
${configPaths.map(p => `  - ${p}`).join('\n')}

請執行以下步驟：
1. 複製配置範例：cp configs/config.example.json configs/config.json
2. 編輯配置文件並填入憑證
3. 重新啟動 Gateway
  `);
}
```

### 3. 添加 CI/CD 測試
在 `.github/workflows/` 中添加編譯測試，防止回歸：

```yaml
name: Build Test
on: [push, pull_request]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: pnpm/action-setup@v2
      - run: pnpm install
      - run: pnpm --filter gateway build
```

---

## 修復總結

| 問題類型 | 影響檔案數 | 嚴重程度 | 狀態 |
|---------|-----------|---------|------|
| Import 路徑錯誤 | 2 | 🔴 阻擋編譯 | ✅ 已修復 |
| 缺少依賴 | 1 (package.json) | 🔴 阻擋執行 | ✅ 已修復 |
| TaskManager API | 1 | 🔴 阻擋編譯 | ✅ 已修復 |
| 型別錯誤 | 2 | 🟡 編譯警告 | ✅ 已修復 |
| 配置載入 | 1 | 🟡 功能受限 | ✅ 已修復 |
| 變數名稱衝突 | 1 | 🟡 型別推斷 | ✅ 已修復 |

**所有高優先級問題已修復，專案可以正常編譯和執行。**

---

最後更新：2026-02-01
修復版本：v0.2.1
