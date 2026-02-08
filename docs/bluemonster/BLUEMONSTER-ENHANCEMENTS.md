# 🚀 BlueMonster 進階功能增強

> BlueMonster 已獲得 4 項新的進階功能，讓 AI 助手更強大、更安全、更具學習能力。

---

## 📋 新增功能概覽

| # | 功能 | 描述 | 位置 | 難度 |
|---|------|------|------|------|
| 1️⃣ | 🌐 URL 分享與文件分發 | 使用 Cloudflare/ngrok 為用戶快速生成檔案下載連結 | copilot-instructions.md | 進階 |
| 2️⃣ | 🧠 技能組合學習模式 | 當遇到複雜問題時，組合現有技能創造新解決方案 | copilot-instructions.md | 高級 |
| 3️⃣ | ⚠️ 檔案刪除安全確認 | 執行刪除前詢問用戶，防止意外損失 | copilot-instructions.md | 基礎 |
| 4️⃣ | 🔐 系統檔案保護 | 學習系統檔案知識，防止刪除重要檔案 | copilot-instructions.md | 中級 |

---

## 1️⃣ 🌐 URL 分享與文件分發

### 功能說明

BlueMonster 可以幫用戶快速創建公開 URL 分享檔案或建立臨時網頁。

### 主要能力

1. **自動啟動隧道指向埠或檔案伺服器**
   - 使用 Python HTTP 伺服器提供檔案
   - 啟動 ngrok 或 Cloudflare 隧道

2. **生成並回覆公開 URL**
   - 提供用戶可訪問的短連結
   - 為長期分享使用 Cloudflare（固定域名）

3. **為檔案建立 HTML 下載頁面**
   - 簡單美觀的下載介面
   - 支持多檔案列表

4. **為資料建立臨時查看網頁**
   - CSV/JSON 資料視覺化
   - 臨時 API 端點

5. **管理多個隧道和 URL**
   - 追蹤活躍隧道（ActiveTunnels.md）
   - 快速啟動/停止

### 使用場景

**場景 1：分享 CSV 報告**
```bash
BlueMonster: 我將為您創建 CSV 下載連結
$ python3 -m http.server 8000 &
$ ngrok http 8000
# URL: https://abc-xyz.ngrok.io/report.csv
```

**場景 2：建立上傳表單**
```bash
BlueMonster: 我將建立一個簡單的上傳表單
# 啟動 Express 伺服器
# 提供公開 URL
# 用戶可上傳檔案
```

**場景 3：分享日誌檔案**
```bash
BlueMonster: 日誌已準備好在以下位置查看
# URL: https://media.your-domain.com/logs/app.log
```

### 相關工具

- **ngrok**：快速開發隧道（每次重啟 URL 會改變）
- **Cloudflare Tunnel**：穩定生產隧道（固定域名）
- **Python HTTP 伺服器**：快速檔案服務
- **Express.js**：自訂網頁和表單

### 相關文檔

- [ActiveTunnels.md](../ActiveTunnels.md) - 活躍隧道管理
- [setup-ngrok.md](../setup/setup-ngrok.md) - ngrok 快速開始
- [MEDIA-CDN-SETUP.md](../media/MEDIA-CDN-SETUP.md) - Cloudflare 隧道設置
- [newSkill.md](./newSkill.md) - 已驗證的技能組合

---

## 2️⃣ 🧠 技能組合學習模式

### 功能說明

BlueMonster 可以通過組合現有技能來解決新問題，並記錄發現的新技能。

### 思考框架

當遇到無法直接解決的問題時：

```
<SkillCombination>
1. 分析問題 → 此問題需要哪些基礎操作？
2. 查詢現有技能 → 我已知道的技能中有什麼相關的？
3. 尋找組合方案 → 如何將多個技能組合成解決方案？
4. 驗證可行性 → 此組合是否安全？有什麼風險？
5. 執行組合 → 逐步實施新技能
6. 記錄發現 → 將新技能記錄到 newSkill.md（如果重要）
</SkillCombination>
```

### 實際例子

**問題**：用戶要求「快速分享 CSV 給多人下載」

**解決過程**：
```
1. 分析
   - 需要：檔案伺服器 + 公開 URL

2. 查詢現有技能
   - Python HTTP 伺服器 ✓
   - ngrok 隧道 ✓
   - 檔案操作 ✓

3. 組合方案
   進入檔案目錄 → 啟動 HTTP 伺服器 → 啟動 ngrok → 分享 URL

4. 驗證可行性
   - ✓ 安全（用戶控制內容）
   - ⚠️ 臨時 URL（非問題，任務結束後可關閉）
   - ✓ 快速實施

5. 執行
   實施上述 3 個步驟

6. 記錄
   此技能已記錄到 docs/newSkill.md - "CSV 快速分享服務"
```

### 何時記錄新技能

- ✅ 此組合對未來有參考價值 → 記錄
- ✅ 用戶首次提出這類需求 → 記錄
- ❌ 重複已知的基礎操作 → 不記錄

### 新技能範本

見 [newSkill.md](./newSkill.md) - 「技能條目模板」部分

### 已發現的技能

1. **CSV 快速分享服務** - 分享報告檔案
2. **臨時網頁服務生成** - 建立上傳表單
3. **日誌查看服務** - 遠端查看日誌

---

## 3️⃣ ⚠️ 檔案刪除安全確認

### 功能說明

BlueMonster 在執行 `rm` 命令前，必須詢問用戶確認，防止意外刪除檔案。

### 三層確認機制

#### 🔍 第一步：查詢檔案信息

```bash
$ ls -lh <file>          # 檢查檔案大小和修改時間
$ file <file>            # 檢查檔案類型
$ head -20 <file>        # 查看檔案內容（如果是文本）
```

BlueMonster 告訴用戶：
- 檔案大小、類型、最後修改時間
- 檔案前 20 行內容概覽

#### ⛔ 第二步：檢查系統黑名單

檢查此檔案是否在「受保護的系統檔案」清單中。

如果是，立即停止並警告用戶：
```
❌ 警告：.env 在保護清單中
理由：可能包含敏感的環境變數或密鑰
此檔案非常重要，不建議刪除！
```

#### ❓ 第三步：詢問用戶確認

顯示準備刪除的檔案信息，用戶必須明確確認：
```
準備刪除：
- 檔案：.env.backup
- 大小：1.2K
- 最後修改：2 天前

確定要刪除 .env.backup 嗎？
（請明確回答「是的，刪除 .env.backup」）
```

#### ✅ 第四步：執行刪除

在所有確認後執行刪除，並驗證成功：
```bash
$ rm .env.backup
$ ls .env.backup 2>&1
# ls: cannot access '.env.backup': No such file or directory
✅ 檔案已成功刪除
```

### 決策流程圖

```
            ┌─ 是否是絕對禁止檔案？
            │     是 → ❌ 拒絕並說明原因
            │
檔案刪除要求 ┤
            │     否 → 是否是高度風險檔案？
            │           是 → ⚠️  多次確認 → 執行
            │           否 → 是否是中等風險檔案？
            │                 是 → ⚠️  一次確認 → 執行
            │                 否 → ✅ 直接執行
            │
            └─ 所有情況都要驗證刪除成功
```

### 相關文檔

- [copilot-instructions.md](../../packages/blue-monster/.github/copilot-instructions.md) - 完整規則

---

## 4️⃣ 🔐 系統檔案保護

### 功能說明

BlueMonster 學習系統檔案的重要性，防止意外刪除關鍵檔案。

### 風險等級分類

#### 🔴 絕對禁止刪除（嚴重風險）

系統檔案會導致系統無法運行：
- `/etc/*` - 系統配置
- `/sys/*` - 系統核心
- `/bin/*`, `/sbin/*` - 系統命令
- `~/.ssh/*` - SSH 密鑰
- `~/.git/` - Git 版本控制

#### 🟠 高度風險檔案（需多次確認）

刪除會導致應用/項目無法運行：
- `.git/` - 版本控制元數據
- `node_modules/` - NPM 相依
- `.env*` - 環境變數和密鑰
- `.gitignore` - Git 配置

#### 🟡 中等風險檔案（需一次確認）

刪除會導致應用功能缺失：
- `package.json` - NPM 配置
- `tsconfig.json` - TypeScript 配置
- `src/` - 源代碼
- `*.sql`, `*.db` - 資料庫

#### 🟢 安全檔案（可直接刪除）

刪除無害：
- `*.log` - 日誌
- `*.tmp`, `*.bak` - 臨時檔案
- `~/.cache/` - 緩存

### 系統檔案知識表

| 檔案/目錄 | 用途 | 風險 | 刪除後果 |
|---------|------|------|--------|
| `.bashrc`, `.zshrc` | Shell 配置 | 🔴 高 | 終端無法正常初始化 |
| `.ssh/` | SSH 密鑰 | 🔴 高 | 無法連接遠端伺服器 |
| `.git/` | 版本控制 | 🔴 高 | 丟失所有版本歷史 |
| `.env` | 環境變數 | 🔴 高 | 應用無法啟動（密鑰遺失） |
| `.gitignore` | Git 配置 | 🟠 中 | 敏感檔案被意外提交 |
| `package.json` | NPM 依賴 | 🟠 中 | 無法安裝依賴 |
| `tsconfig.json` | TypeScript 設定 | 🟠 中 | 編譯失敗 |
| `src/` | 源代碼 | 🟠 中 | 丟失所有應用代碼 |
| `.DS_Store` | macOS 緩存 | 🟢 低 | 無害，可刪除 |
| `*.log` | 日誌檔案 | 🟢 低 | 只是信息遺失 |

### 保護原則

1. ✅ 檔案看起來「像設定檔」（`.yml`, `.json`, `.yaml`）→ 詢問用戶
2. ✅ 檔案看起來「像程式碼或資料」（`src/`, `data/`）→ 詢問用戶
3. ✅ 檔案名稱「包含 .env, .git, .ssh, node_modules」→ 多次確認
4. ✅ 檔案「不是用戶明確要求刪除的」→ 詢問確認

### 保護策略

BlueMonster 在刪除前應：

1. **識別檔案類型**
   - 是否是系統檔案？
   - 是否是項目關鍵檔案？
   - 是否包含敏感信息？

2. **根據風險等級決策**
   - 🔴 高風險 → 拒絕或多次確認
   - 🟠 中等 → 一次確認
   - 🟢 低風險 → 直接刪除

3. **提供清晰警告**
   - 說明檔案的用途
   - 說明刪除的後果
   - 建議備份（如果重要）

### 相關文檔

- [copilot-instructions.md](../../packages/blue-monster/.github/copilot-instructions.md) - 完整清單和規則

---

## 🎯 使用指南

### 對於 BlueMonster

1. **充分利用新功能**
   - 在遇到複雜問題時使用 SkillCombination 思考框架
   - 記錄新發現的技能到 newSkill.md
   - 使用隧道工具快速分享檔案

2. **遵守安全規則**
   - 刪除檔案前詢問用戶
   - 檢查系統檔案黑名單
   - 三層確認機制

3. **持續學習**
   - 參考已發現的技能組合
   - 創造新的技能組合
   - 更新文檔

### 對於用戶

1. **了解 BlueMonster 能力**
   - 讀 [BLUEMONSTER-SKILLS.md](./BLUEMONSTER-SKILLS.md) 了解基本能力
   - 讀 [newSkill.md](./newSkill.md) 了解高級技能
   - 讀 [ActiveTunnels.md](../ActiveTunnels.md) 管理隧道

2. **享受新功能**
   - 要求 BlueMonster 分享檔案
   - 要求 BlueMonster 組合技能
   - 放心讓 BlueMonster 操作檔案（會有安全確認）

3. **提供反饋**
   - 提出新的需求
   - 幫助 BlueMonster 發現新技能
   - 改進現有功能

---

## 📚 相關文檔

### 核心文檔
- [copilot-instructions.md](../../packages/blue-monster/.github/copilot-instructions.md) - BlueMonster 系統提示（包含所有新功能）
- [BLUEMONSTER-SKILLS.md](./BLUEMONSTER-SKILLS.md) - 技能總覽
- [INDEX.md](../INDEX.md) - 文檔導航

### 新增文檔
- [newSkill.md](./newSkill.md) - 技能學習日誌
- [ActiveTunnels.md](../ActiveTunnels.md) - 活躍隧道管理

### 相關指南
- [setup-ngrok.md](../setup/setup-ngrok.md) - ngrok 快速開始
- [MEDIA-CDN-SETUP.md](../media/MEDIA-CDN-SETUP.md) - Cloudflare 隧道設置
- [bluemonster-media-guide.md](../media/bluemonster-media-guide.md) - 多媒體使用指南

---

## ✅ 驗證清單

確保所有功能已正確實施：

- [ ] BlueMonster 可使用 ngrok/Cloudflare 分享檔案
- [ ] BlueMonster 理解 SkillCombination 思考框架
- [ ] BlueMonster 在刪除前會詢問用戶
- [ ] BlueMonster 知道系統檔案保護規則
- [ ] newSkill.md 檔案已建立
- [ ] ActiveTunnels.md 檔案已建立
- [ ] copilot-instructions.md 已更新
- [ ] INDEX.md 已更新新文檔連結

---

## 🔄 未來改進

**計劃中的增強**：
- [ ] HTTP 伺服器自動啟動/停止腳本
- [ ] 檔案刪除 CLI 助手（帶確認對話）
- [ ] 技能推薦系統（基於用戶需求）
- [ ] 隧道健康檢查和自動恢復
- [ ] 技能評分和排序（最常用到最少用）
- [ ] 多語言支持

---

**最後更新**：2026-02-04  
**版本**：1.0 - 完整功能實施  
**狀態**：✅ 就緒生產使用
