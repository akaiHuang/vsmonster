# RFC-001: Monster Mission Control

| 狀態 | 草案 (Draft) |
|------|-------------|
| 作者 | VSMONSTER Team |
| 建立日期 | 2026-01-30 |
| 最後更新 | 2026-01-30 |
| 目標版本 | v0.2.0 |

---

## 📋 摘要 (Abstract)

本 RFC 提案建立 **Monster Mission Control**（以下簡稱 MMC），一個與 VSMONSTER 深度整合的視覺化任務管理面板。MMC 提供看板式任務追蹤、專案生命週期管理、自動化開發環境設定，以及與多個 VS Code 實例的即時通訊能力。

---

## 🎯 動機與目標 (Motivation & Goals)

### 問題陳述

目前 VSMONSTER 缺乏：
1. 視覺化的任務管理介面
2. 多專案同時管理能力
3. 標準化的專案初始化流程
4. 專案與對話上下文的持久化關聯

### 目標

1. **任務視覺化**：提供 Kanban 看板管理任務狀態
2. **對話驅動開發**：從自然語言對話中識別並建立任務
3. **標準化專案架構**：自動生成 README、AGENTS.md、開發規格書
4. **多專案並行**：支援多個 VS Code 實例同時開發不同專案
5. **一鍵部署測試**：整合 Cloudflare/ngrok 提供即時預覽
6. **版本控制**：強制 Git 流程，每個階段自動 commit

---

## 🏗️ 系統架構 (Architecture)

### 高層架構圖

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           USER INTERFACES                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   📱 LINE/Telegram/Discord          🖥️ Monster Mission Control (Web UI)    │
│            │                                      │                         │
│            │ WebSocket                            │ HTTP/WebSocket          │
│            ▼                                      ▼                         │
│   ┌─────────────────────────────────────────────────────────────────┐      │
│   │                    VSMONSTER Gateway                             │      │
│   │                                                                  │      │
│   │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │      │
│   │  │ Chat Engine  │  │ Task Router  │  │ Project Orchestrator │  │      │
│   │  │              │  │              │  │                      │  │      │
│   │  │ • 意圖識別   │  │ • 任務排序   │  │ • 專案初始化         │  │      │
│   │  │ • 對話管理   │  │ • 優先級     │  │ • VS Code 啟動       │  │      │
│   │  │ • 上下文     │  │ • 依賴分析   │  │ • Socket 管理        │  │      │
│   │  └──────────────┘  └──────────────┘  └──────────────────────┘  │      │
│   │                                                                  │      │
│   │  ┌──────────────────────────────────────────────────────────┐   │      │
│   │  │                    Mission Database                       │   │      │
│   │  │                      (MongoDB)                            │   │      │
│   │  │  • missions    • projects    • conversations    • users   │   │      │
│   │  └──────────────────────────────────────────────────────────┘   │      │
│   └─────────────────────────────────────────────────────────────────┘      │
│                                    │                                        │
│                                    │ WebSocket (per-project)                │
│                                    ▼                                        │
│   ┌─────────────────────────────────────────────────────────────────┐      │
│   │                    VS Code Instances                             │      │
│   │                                                                  │      │
│   │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │      │
│   │  │ Project A   │  │ Project B   │  │ Project C   │   ...       │      │
│   │  │ Socket: A1  │  │ Socket: B2  │  │ Socket: C3  │             │      │
│   │  │ mission/    │  │ mission/    │  │ mission/    │             │      │
│   │  │ proj-a/     │  │ proj-b/     │  │ proj-c/     │             │      │
│   │  └─────────────┘  └─────────────┘  └─────────────┘             │      │
│   └─────────────────────────────────────────────────────────────────┘      │
│                                    │                                        │
│                                    │ Deploy                                 │
│                                    ▼                                        │
│   ┌─────────────────────────────────────────────────────────────────┐      │
│   │                    Deployment Layer                              │      │
│   │                                                                  │      │
│   │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │      │
│   │  │ Cloudflare  │  │   ngrok     │  │  MongoDB    │             │      │
│   │  │  Tunnel     │  │   Tunnel    │  │   Atlas     │             │      │
│   │  └─────────────┘  └─────────────┘  └─────────────┘             │      │
│   └─────────────────────────────────────────────────────────────────┘      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 目錄結構

```
~/Desktop/clawdbot-projects/           # 預設 Mission 根目錄
├── .vsmonster/                        # VSMONSTER 全域設定
│   ├── config.json                    # 全域配置
│   ├── projects.json                  # 專案索引
│   └── db/                            # 本地 MongoDB 資料
│
└── mission/                           # 所有任務專案
    ├── create-a-hellow-world-page-first/
    │   ├── .vsmonster/                # 專案專屬設定
    │   │   ├── project.json           # 專案 metadata
    │   │   ├── socket.json            # WebSocket 連接資訊
    │   │   └── deploy.json            # 部署設定
    │   ├── .git/                      # Git 版本控制
    │   ├── README.md                  # 自動生成
    │   ├── AGENTS.md                  # Copilot 指引
    │   ├── SPEC.md                    # 開發規格書
    │   ├── CHANGELOG.md               # 變更日誌
    │   └── src/                       # 專案原始碼
    │
    └── another-project/
        └── ...
```

---

## 🔄 任務生命週期 (Task Lifecycle)

### 狀態流程圖

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           TASK LIFECYCLE                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌──────────┐    ┌──────────┐    ┌───────────┐    ┌────────┐    ┌───────┐│
│   │          │    │          │    │           │    │        │    │       ││
│   │ Backlog  │───►│ Planned  │───►│In Progress│───►│ Review │───►│ Done  ││
│   │          │    │          │    │           │    │        │    │       ││
│   └──────────┘    └──────────┘    └───────────┘    └────────┘    └───────┘│
│        │              │                │                │            │     │
│        │              │                │                │            │     │
│   ┌────▼────┐    ┌────▼────┐    ┌─────▼─────┐    ┌────▼────┐    ┌───▼───┐│
│   │ 對話中  │    │ 用戶確認│    │ VS Code   │    │ 測試中  │    │ 部署  ││
│   │ 收集需求│    │ 開發順序│    │ 自動開發  │    │ 問題回報│    │ 完成  ││
│   └─────────┘    └─────────┘    └───────────┘    └─────────┘    └───────┘│
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 狀態定義

| 狀態 | 說明 | 觸發條件 |
|------|------|----------|
| `backlog` | 待處理：已識別任務意圖，尚未確認 | 對話中識別到任務關鍵字 |
| `planned` | 已規劃：用戶確認，等待排序 | 用戶回覆「確認建立」|
| `in_progress` | 進行中：VS Code 正在開發 | 用戶同意開發順序 |
| `review` | 審查中：等待用戶測試 | 開發完成，部署預覽 |
| `completed` | 已完成：用戶驗收通過 | 用戶確認完成 |
| `blocked` | 受阻：需要更多資訊 | 開發過程遇到問題 |

---

## 📝 詳細規格 (Detailed Specification)

### 1. 意圖識別與任務建立

#### 1.1 任務意圖關鍵字

```typescript
// packages/gateway/src/intent/detector.ts

interface TaskIntent {
  type: 'create' | 'modify' | 'fix' | 'deploy' | 'query';
  confidence: number;  // 0-1
  entities: {
    projectType?: 'web' | 'api' | 'mobile' | 'cli' | 'other';
    framework?: string;
    features?: string[];
  };
  rawText: string;
}

const INTENT_PATTERNS = {
  create: [
    /建立|建置|開發|做一個|寫一個|create|build|make/i,
    /網站|網頁|app|應用|系統|平台|website|application/i,
  ],
  modify: [
    /修改|調整|更新|改成|update|modify|change/i,
  ],
  fix: [
    /修復|修正|解決|bug|fix|repair|debug/i,
  ],
  deploy: [
    /部署|上線|發布|deploy|publish|release/i,
  ],
};
```

#### 1.2 任務確認對話流程

```
用戶: 幫我建立一個 Hello World 網頁

VSMONSTER: 🎯 我偵測到你想建立一個新專案！

📋 任務摘要:
• 名稱: Hello World 網頁
• 類型: Web 應用
• 框架: Next.js (推薦)

是否要建立這個任務？
1️⃣ 確認建立
2️⃣ 需要更多討論
3️⃣ 我自己先寫草案

用戶: 1

VSMONSTER: ✅ 任務已建立！

📌 任務 #T-001: Hello World 網頁
📂 專案將建立於: ~/mission/hello-world-page/

目前待辦清單:
• [T-001] Hello World 網頁 (新建立)

準備好開始開發了嗎？輸入「開始開發」啟動 VS Code
```

### 2. 專案初始化流程

#### 2.1 自動化步驟

```typescript
// packages/gateway/src/project/initializer.ts

interface ProjectInitOptions {
  missionId: string;
  name: string;
  type: 'nextjs' | 'react' | 'node' | 'express' | 'other';
  features: string[];
  database?: 'mongodb' | 'none';
}

class ProjectInitializer {
  async initialize(options: ProjectInitOptions): Promise<Project> {
    const projectPath = path.join(MISSION_DIR, slugify(options.name));
    
    // Step 1: 建立目錄結構
    await this.createDirectoryStructure(projectPath);
    
    // Step 2: 初始化 Git
    await this.initializeGit(projectPath);
    
    // Step 3: 生成基礎文件
    await this.generateBaseFiles(projectPath, options);
    
    // Step 4: 安裝相依套件
    await this.installDependencies(projectPath, options);
    
    // Step 5: 建立 VSMONSTER 專案設定
    await this.createProjectConfig(projectPath, options);
    
    // Step 6: 開啟 VS Code 並建立 Socket 連接
    const socket = await this.openVSCodeWithSocket(projectPath);
    
    // Step 7: 初始 commit
    await this.gitCommit(projectPath, 'chore: initial project setup');
    
    return { ...options, path: projectPath, socketId: socket.id };
  }
}
```

#### 2.2 自動生成文件

**README.md 模板**

```markdown
# {PROJECT_NAME}

> {PROJECT_DESCRIPTION}

[![VSMONSTER](https://img.shields.io/badge/Managed%20by-VSMONSTER-purple)](https://github.com/xxx/vsmonster)
[![Mission](https://img.shields.io/badge/Mission-{MISSION_ID}-blue)]()

## 🚀 快速開始

\`\`\`bash
pnpm install
pnpm dev
\`\`\`

## 📋 專案資訊

| 項目 | 內容 |
|------|------|
| Mission ID | {MISSION_ID} |
| 建立時間 | {CREATED_AT} |
| 框架 | {FRAMEWORK} |
| 資料庫 | {DATABASE} |
| 預覽連結 | {PREVIEW_URL} |

## 🏗️ 專案結構

\`\`\`
{DIRECTORY_TREE}
\`\`\`

## 📝 開發日誌

詳見 [CHANGELOG.md](../CHANGELOG.md)

---

*此專案由 VSMONSTER Mission Control 自動建立*
```

**AGENTS.md 模板**

```markdown
# AGENTS.md - Copilot 開發指引

## 專案概述

{PROJECT_DESCRIPTION}

## 開發規範

### 程式碼風格
- 使用 TypeScript strict mode
- ESLint + Prettier 自動格式化
- 檔案命名: kebab-case
- 元件命名: PascalCase

### Git Commit 規範
- feat: 新功能
- fix: 錯誤修復
- docs: 文件更新
- style: 程式碼格式
- refactor: 重構
- test: 測試
- chore: 維護

### 目錄結構規範
{DIRECTORY_CONVENTIONS}

## 當前任務

{CURRENT_TASK_DESCRIPTION}

## 注意事項

- 每完成一個功能區塊，立即 commit
- 使用中文註解說明複雜邏輯
- API 錯誤處理必須完整
- 前端需有 loading 和 error 狀態

## 禁止事項

- 不要修改 .vsmonster/ 目錄
- 不要刪除 AGENTS.md
- 不要直接修改 node_modules
```

**SPEC.md (開發規格書) 模板**

```markdown
# 開發規格書 - {PROJECT_NAME}

## 1. 專案目標

{PROJECT_GOALS}

## 2. 功能需求

### 2.1 核心功能
{CORE_FEATURES}

### 2.2 次要功能
{SECONDARY_FEATURES}

## 3. 技術規格

### 3.1 技術棧
| 層級 | 技術 | 版本 |
|------|------|------|
| 前端框架 | Next.js | 14.x |
| UI 函式庫 | React | 18.x |
| 語言 | TypeScript | 5.x |
| 樣式 | Tailwind CSS | 3.x |
| 資料庫 | MongoDB | 7.x |
| ORM | Prisma | 5.x |

### 3.2 API 設計
{API_DESIGN}

### 3.3 資料模型
{DATA_MODELS}

## 4. UI/UX 規格

### 4.1 頁面結構
{PAGE_STRUCTURE}

### 4.2 響應式斷點
- Mobile: < 640px
- Tablet: 640px - 1024px
- Desktop: > 1024px

## 5. 部署規格

### 5.1 環境
- 開發: localhost:3000
- 預覽: {PREVIEW_URL}
- 正式: {PRODUCTION_URL}

### 5.2 環境變數
{ENVIRONMENT_VARIABLES}

## 6. 驗收標準

{ACCEPTANCE_CRITERIA}

---

*自動生成於 {GENERATED_AT}*
*VSMONSTER Mission: {MISSION_ID}*
```

### 3. VS Code 專案管理

#### 3.1 Socket 連接機制

```typescript
// packages/gateway/src/project/socket-manager.ts

interface ProjectSocket {
  projectId: string;
  socketId: string;
  vscodeWindowId: string;
  status: 'connecting' | 'connected' | 'disconnected';
  lastHeartbeat: Date;
}

class ProjectSocketManager {
  private sockets: Map<string, ProjectSocket> = new Map();
  
  /**
   * 為專案建立專屬 Socket 連接
   */
  async createProjectSocket(projectId: string): Promise<ProjectSocket> {
    const socketId = `proj_${projectId}_${nanoid(8)}`;
    
    // 儲存到 .vsmonster/socket.json
    await this.saveSocketConfig(projectId, socketId);
    
    return {
      projectId,
      socketId,
      vscodeWindowId: '', // VS Code 啟動後填入
      status: 'connecting',
      lastHeartbeat: new Date(),
    };
  }
  
  /**
   * 根據對話上下文找到對應專案
   */
  async findProjectByContext(userId: string, hint?: string): Promise<Project | null> {
    // 1. 檢查用戶最近活躍的專案
    const activeProjects = await this.getActiveProjects(userId);
    
    // 2. 如果有提示，模糊匹配專案名稱
    if (hint) {
      const matched = activeProjects.find(p => 
        p.name.toLowerCase().includes(hint.toLowerCase())
      );
      if (matched) return matched;
    }
    
    // 3. 返回最近活躍的專案
    return activeProjects[0] || null;
  }
  
  /**
   * 發送指令到特定專案的 VS Code
   */
  async sendToProject(projectId: string, command: CopilotCommand): Promise<void> {
    const socket = this.sockets.get(projectId);
    if (!socket || socket.status !== 'connected') {
      throw new Error(`Project ${projectId} is not connected`);
    }
    
    // 透過 WebSocket 發送到對應的 VS Code 實例
    this.wss.to(socket.socketId).emit('copilot:command', command);
  }
}
```

#### 3.2 VS Code 擴展整合

```typescript
// packages/vscode-extension/src/project-connector.ts

class ProjectConnector {
  private socketId: string | null = null;
  
  /**
   * 從 .vsmonster/socket.json 讀取 Socket ID 並連接
   */
  async connectToMissionControl(): Promise<void> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) return;
    
    const socketConfigPath = path.join(workspaceRoot, '.vsmonster', 'socket.json');
    
    if (await fs.pathExists(socketConfigPath)) {
      const config = await fs.readJson(socketConfigPath);
      this.socketId = config.socketId;
      
      // 連接到 Gateway
      await this.gateway.connect({
        type: 'project',
        socketId: this.socketId,
        projectId: config.projectId,
      });
      
      // 註冊事件處理
      this.registerEventHandlers();
    }
  }
  
  /**
   * 回報開發進度
   */
  async reportProgress(status: 'working' | 'completed' | 'error', message: string): Promise<void> {
    await this.gateway.send({
      type: 'project:progress',
      socketId: this.socketId,
      status,
      message,
      timestamp: new Date(),
    });
  }
}
```

### 4. Git 版本控制

#### 4.1 自動 Commit 策略

```typescript
// packages/gateway/src/project/git-manager.ts

interface GitCommitTrigger {
  event: 'file_save' | 'task_complete' | 'deploy' | 'manual';
  debounceMs: number;
  messageTemplate: string;
}

const GIT_TRIGGERS: GitCommitTrigger[] = [
  {
    event: 'file_save',
    debounceMs: 30000, // 30 秒內的修改合併為一個 commit
    messageTemplate: 'wip: auto-save changes',
  },
  {
    event: 'task_complete',
    debounceMs: 0,
    messageTemplate: 'feat({scope}): {description}',
  },
  {
    event: 'deploy',
    debounceMs: 0,
    messageTemplate: 'chore: prepare for deployment',
  },
];

class GitManager {
  /**
   * 初始化專案 Git
   */
  async initializeGit(projectPath: string): Promise<void> {
    await execa('git', ['init'], { cwd: projectPath });
    
    // 建立 .gitignore
    await this.createGitignore(projectPath);
    
    // 設定 Git hooks
    await this.setupGitHooks(projectPath);
  }
  
  /**
   * 智能 Commit
   */
  async smartCommit(projectPath: string, options: {
    scope?: string;
    description: string;
    type: 'feat' | 'fix' | 'docs' | 'style' | 'refactor' | 'test' | 'chore';
  }): Promise<void> {
    const { scope, description, type } = options;
    const message = scope 
      ? `${type}(${scope}): ${description}`
      : `${type}: ${description}`;
    
    await execa('git', ['add', '-A'], { cwd: projectPath });
    await execa('git', ['commit', '-m', message], { cwd: projectPath });
  }
}
```

### 5. 部署與預覽

#### 5.1 部署服務抽象

```typescript
// packages/gateway/src/deploy/deployer.ts

interface DeployConfig {
  provider: 'cloudflare' | 'ngrok' | 'vercel';
  domain?: string;
  tunnel?: {
    enabled: boolean;
    authtoken?: string;
  };
}

interface DeployResult {
  url: string;
  provider: string;
  expiresAt?: Date;
}

class Deployer {
  /**
   * 部署專案並返回預覽 URL
   */
  async deploy(projectPath: string, config: DeployConfig): Promise<DeployResult> {
    switch (config.provider) {
      case 'cloudflare':
        return this.deployToCloudflare(projectPath, config);
      case 'ngrok':
        return this.deployToNgrok(projectPath, config);
      case 'vercel':
        return this.deployToVercel(projectPath, config);
      default:
        throw new Error(`Unknown provider: ${config.provider}`);
    }
  }
  
  /**
   * Cloudflare Tunnel 部署
   */
  private async deployToCloudflare(projectPath: string, config: DeployConfig): Promise<DeployResult> {
    // 1. 檢查 cloudflared 是否安裝
    await this.ensureCloudflared();
    
    // 2. 啟動 Next.js dev server
    const devServer = await this.startDevServer(projectPath);
    
    // 3. 建立 Cloudflare Tunnel
    const tunnel = await execa('cloudflared', [
      'tunnel',
      '--url', `http://localhost:${devServer.port}`,
    ]);
    
    // 4. 解析 Tunnel URL
    const url = this.parseTunnelUrl(tunnel.stdout);
    
    return { url, provider: 'cloudflare' };
  }
  
  /**
   * 檢查用戶是否有自己的域名
   */
  async promptDomainSetup(userId: string): Promise<void> {
    const message = `
🌐 部署選項

目前使用臨時預覽連結。如果你有自己的域名，可以獲得更穩定的連結。

1️⃣ 繼續使用臨時連結 (ngrok)
2️⃣ 設定 Cloudflare 域名
3️⃣ 購買域名 (推薦 GoDaddy)

請選擇:
    `;
    
    await this.sendToUser(userId, message);
  }
}
```

### 6. 資料庫整合

#### 6.1 MongoDB 本地安裝

```typescript
// packages/gateway/src/database/mongo-manager.ts

class MongoManager {
  /**
   * 確保 MongoDB 已安裝並運行
   */
  async ensureMongoRunning(): Promise<void> {
    // 檢查 Docker 是否有運行 MongoDB
    const isDockerMongo = await this.checkDockerMongo();
    if (isDockerMongo) return;
    
    // 檢查本機 MongoDB
    const isLocalMongo = await this.checkLocalMongo();
    if (isLocalMongo) return;
    
    // 啟動 Docker MongoDB
    await this.startDockerMongo();
  }
  
  /**
   * 使用 Docker 啟動 MongoDB
   */
  private async startDockerMongo(): Promise<void> {
    await execa('docker', [
      'run', '-d',
      '--name', 'vsmonster-mongo',
      '-p', '27017:27017',
      '-v', 'vsmonster-mongo-data:/data/db',
      'mongo:7',
    ]);
  }
  
  /**
   * 為專案建立獨立資料庫
   */
  async createProjectDatabase(projectId: string): Promise<string> {
    const dbName = `vsmonster_${projectId}`;
    const connectionString = `mongodb://localhost:27017/${dbName}`;
    
    // 測試連接
    const client = new MongoClient(connectionString);
    await client.connect();
    await client.close();
    
    return connectionString;
  }
}
```

---

## 🖼️ UI 設計 (UI Design)

### Mission Control 介面

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  🎮 Mission Control                              Tasks │ Dashboard │ Settings│
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1 This week   1 In progress   1 Total   0% Completion   1 Workers active  │
│                                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                        │
│  │ + New task  │  │ 🤖 Workers  │  │ 📁 Activity │                        │
│  └─────────────┘  └─────────────┘  └─────────────┘                        │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ○ Backlog (1)   ● Planned (0)   ● In Progress (0)   ● Review (0)   ● Done │
│                                                                             │
│  ┌─────────────┐                                                           │
│  │ ● Create a  │                                                           │
│  │   'Hello    │                                                           │
│  │   world'    │                                                           │
│  │   page      │                                                           │
│  │             │                                                           │
│  │ Other       │                                                           │
│  │ Just now    │                                                           │
│  └─────────────┘                                                           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Workers 視圖

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  🤖 Workers                                                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────┐       │
│  │ 🟢 VS Code #1 - hello-world-page                                │       │
│  │    Socket: proj_hw_abc123                                        │       │
│  │    Status: Working on "Create index.tsx"                        │       │
│  │    Last activity: 2 minutes ago                                 │       │
│  │    [Open VS Code] [View Logs] [Stop]                           │       │
│  └─────────────────────────────────────────────────────────────────┘       │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────┐       │
│  │ 🔴 VS Code #2 - (Disconnected)                                  │       │
│  │    Socket: proj_xx_def456                                        │       │
│  │    Last seen: 1 hour ago                                        │       │
│  │    [Reconnect] [Remove]                                         │       │
│  └─────────────────────────────────────────────────────────────────┘       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 📦 套件相依 (Dependencies)

### 新增套件

```json
{
  "dependencies": {
    "mongodb": "^6.3.0",
    "mongoose": "^8.0.0",
    "nanoid": "^5.0.0",
    "slugify": "^1.6.6",
    "execa": "^8.0.0",
    "cloudflared": "^0.1.0",
    "socket.io": "^4.7.0",
    "socket.io-client": "^4.7.0"
  },
  "devDependencies": {
    "@types/mongoose": "^5.11.0"
  }
}
```

### Mission Control Web UI (獨立套件)

```json
{
  "name": "@vsmonster/mission-control",
  "dependencies": {
    "next": "^14.0.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "@tanstack/react-query": "^5.0.0",
    "socket.io-client": "^4.7.0",
    "zustand": "^4.4.0",
    "tailwindcss": "^3.4.0",
    "framer-motion": "^10.0.0",
    "@dnd-kit/core": "^6.1.0",
    "@dnd-kit/sortable": "^8.0.0"
  }
}
```

---

## 🚀 實作計畫 (Implementation Plan)

### Phase 1: 基礎架構 (Week 1-2)

- [ ] MongoDB 整合與本地 Docker 設定
- [ ] Mission Database Schema 設計
- [ ] Project Initializer 核心邏輯
- [ ] Git Manager 實作

### Phase 2: 任務管理 (Week 3-4)

- [ ] Intent Detector 意圖識別
- [ ] Task Router 任務路由
- [ ] 對話流程狀態機
- [ ] Mission Control API

### Phase 3: VS Code 整合 (Week 5-6)

- [ ] Project Socket Manager
- [ ] VS Code Extension 專案連接器
- [ ] 多實例管理
- [ ] 進度回報機制

### Phase 4: Web UI (Week 7-8)

- [ ] Mission Control 前端框架
- [ ] Kanban 看板元件
- [ ] Workers 管理頁面
- [ ] 即時狀態更新

### Phase 5: 部署整合 (Week 9-10)

- [ ] Cloudflare Tunnel 整合
- [ ] ngrok 備援方案
- [ ] 域名設定引導
- [ ] 預覽連結管理

### Phase 6: 測試與文件 (Week 11-12)

- [ ] 單元測試
- [ ] 整合測試
- [ ] E2E 測試
- [ ] 使用者文件

---

## 🔒 安全考量 (Security Considerations)

1. **Socket 認證**：每個專案 Socket 需要 JWT 認證
2. **專案隔離**：不同專案的 VS Code 實例完全隔離
3. **資料加密**：敏感設定使用 AES-256 加密儲存
4. **權限控制**：支援多用戶時的專案權限管理

---

## 📊 成功指標 (Success Metrics)

| 指標 | 目標 |
|------|------|
| 專案初始化時間 | < 30 秒 |
| Socket 連接延遲 | < 100ms |
| 任務建立到開發啟動 | < 2 分鐘 |
| 部署預覽連結生成 | < 60 秒 |

---

## 📚 參考資料 (References)

- [Moltbot Architecture](https://docs.molt.bot/concepts/architecture)
- [VS Code Extension API](https://code.visualstudio.com/api)
- [Cloudflare Tunnel Docs](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/)
- [MongoDB Change Streams](https://www.mongodb.com/docs/manual/changeStreams/)

---

## 📝 附錄 (Appendix)

### A. 環境變數

```bash
# .env.example

# MongoDB
MONGODB_URI=mongodb://localhost:27017/vsmonster

# Cloudflare
CLOUDFLARE_TUNNEL_TOKEN=your_token_here

# ngrok (備援)
NGROK_AUTHTOKEN=your_authtoken_here

# Mission Control
MISSION_ROOT=~/Desktop/clawdbot-projects/mission
```

### B. 配置檔案結構

```json
// .vsmonster/config.json
{
  "version": "1.0.0",
  "missionRoot": "~/Desktop/clawdbot-projects/mission",
  "database": {
    "provider": "mongodb",
    "uri": "mongodb://localhost:27017/vsmonster"
  },
  "deploy": {
    "defaultProvider": "cloudflare",
    "fallback": "ngrok"
  },
  "git": {
    "autoCommit": true,
    "commitDebounceMs": 30000
  },
  "vscode": {
    "autoOpen": true,
    "extensionId": "vsmonster.vsmonster"
  }
}
```

---

*RFC-001 完*
