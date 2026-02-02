# VSMONSTER 快速修復指南

## 問題總覽
用戶報告了編譯失敗和配置無法載入的問題。

## 已修復的問題 ✅

### 1. Import 路徑錯誤
- **檔案**: `src/channels/line/index.ts`, `src/channels/telegram/index.ts`
- **修復**: 將 `'./base'` 改為 `'../base'`，`'../utils/logger'` 改為 `'../../utils/logger'`

### 2. 缺少依賴套件
- **新增**:
  ```json
  "@line/bot-sdk": "^9.3.0",
  "discord.js": "^14.14.1",
  "grammy": "^1.19.2",
  "ngrok": "^5.0.0-beta.2"
  ```

### 3. TaskManager API
- **新增方法**: `getUserTasks()`, `updateTaskStatus()`, `completeTask()`, `updateTaskProgress()`

### 4. 配置載入路徑
- **改進**: 添加多層目錄檢查，支援 monorepo 結構

### 5. 型別錯誤
- 修復 `process` 變數名稱衝突
- 修復 Discord config 型別
- 添加 `moltbotGatewayUrl` 到 config 介面

### 6. server.ts 語法錯誤
- 移除重複的代碼片段

### 7. 缺少 tsconfig.json
- 創建完整的 TypeScript 配置

## 安裝步驟

```bash
# 1. 安裝依賴
cd /Users/akaihuangm1/Desktop/vsmonster
pnpm install

# 2. 安裝 gateway 依賴
cd packages/gateway
pnpm install

# 3. 編譯
pnpm build

# 4. 配置
cp ../../configs/config.example.json ../../configs/config.json
# 編輯 config.json 填入憑證

# 5. 啟動
pnpm dev
```

## 配置檔案範例

```json
{
  "port": 3000,
  "channels": {
    "line": {
      "channelAccessToken": "YOUR_TOKEN",
      "channelSecret": "YOUR_SECRET",
      "webhookSecret": "optional",
      "whitelist": []
    }
  }
}
```

## 驗證

編譯應該成功且無錯誤：
```bash
cd packages/gateway
pnpm build
# 應顯示: tsc 完成，無錯誤
```

## 後續改進建議

1. 添加 CI/CD 測試防止回歸
2. 改善配置載入的錯誤訊息
3. 添加配置驗證
4. 使用 workspace:* 協議管理 monorepo 依賴

---

**狀態**: 所有阻塞性錯誤已修復 ✅  
**日期**: 2026-02-01
