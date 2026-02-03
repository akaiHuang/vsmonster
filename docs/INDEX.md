# 📚 BlueMonster 文檔索引

完整的 BlueMonster 使用和部署文檔導航。

---

## 🚀 新手開始

### 新手開始

### 1️⃣ 安裝與設置
- [SETUP-CHECKLIST.md](./SETUP-CHECKLIST.md) ⭐ **從這裡開始**
  - 6 個安裝步驟
  - 每個步驟都有具體命令
  - 包含故障排除

### 2️⃣ 了解 BlueMonster
- [BLUEMONSTER-SKILLS.md](./docs/BLUEMONSTER-SKILLS.md) ⭐ **技能總覽**
  - 環境感知能力
  - 隧道工具（Cloudflare, ngrok）
  - 多媒體系統管理
  - 檔案操作技能
  - 專案開發能力

### 3️⃣ BlueMonster 進階功能 ⭐ **新！**
- [BLUEMONSTER-ENHANCEMENTS.md](./docs/BLUEMONSTER-ENHANCEMENTS.md) ⭐ **新功能完整指南**
  - 🌐 URL 分享與文件分發
  - 🧠 技能組合學習模式
  - ⚠️ 檔案刪除安全確認
  - 🔐 系統檔案保護
  - 包含使用指南和決策流程圖

---

## 🎯 功能文檔

### BlueMonster 進階功能
- [BLUEMONSTER-ENHANCEMENTS.md](./docs/BLUEMONSTER-ENHANCEMENTS.md) - **新功能完整指南**
  - URL 分享與隧道管理
  - 技能組合學習框架
  - 檔案刪除安全規則
  - 系統檔案保護清單

### 媒體系統
- [MEDIA-CDN-SETUP.md](./docs/MEDIA-CDN-SETUP.md) - **媒體隧道設置教程**
  - Cloudflare 隧道配置
  - DNS 路由設置
  - 環境變數配置
  
- [bluemonster-media-guide.md](./docs/bluemonster-media-guide.md) - **AI 使用指南**
  - 如何查詢媒體
  - 如何上傳媒體
  - 常見場景示例

- [media-database-guide.md](./docs/media-database-guide.md) - **API 完整文檔**
  - 8 個 REST 端點
  - 請求/響應格式
  - curl 範例

- [media-integration-guide.md](./docs/media-integration-guide.md) - **平台集成**
  - LINE 集成
  - Telegram 集成
  - Discord 集成

### 隧道管理
- [CLOUDFLARE-MAINTENANCE.md](./docs/CLOUDFLARE-MAINTENANCE.md) - **隧道操作日誌**
  - 隧道狀態檢查命令
  - DNS 配置驗證
  - 故障排除記錄

- [ActiveTunnels.md](./docs/ActiveTunnels.md) ⭐ **活躍隧道管理**
  - 當前活躍隧道列表
  - 隧道啟動/停止命令
  - ngrok 和 Cloudflare 對比
  - 安全考慮

### 高級功能
- [newSkill.md](./docs/newSkill.md) ⭐ **技能學習日誌**
  - BlueMonster 發現的新技能組合
  - 已驗證的技能（CSV 分享、網頁生成、日誌查看）
  - 技能模板和添加指南
  - 技能狀態追蹤

---

## 📖 詳細指南

### 按用途分類

#### 👤 最終用戶
```
1. 閱讀 SETUP-CHECKLIST.md
2. 按步驟完成安裝
3. 在社群軟體中測試 Bot
```

#### 👨‍💻 開發者
```
1. 了解 BLUEMONSTER-SKILLS.md 中的開發工具部分
2. 查看 media-database-guide.md 的 API
3. 參考 media-integration-guide.md 實現新功能
```

#### 🤖 AI 助手/BlueMonster
```
1. 系統提示：packages/blue-monster/.github/copilot-instructions.md
2. 技能參考：docs/BLUEMONSTER-SKILLS.md
3. 多媒體操作：docs/bluemonster-media-guide.md
```

#### 🚀 DevOps/系統管理
```
1. 隧道設置：docs/MEDIA-CDN-SETUP.md
2. Cloudflare 維護：docs/CLOUDFLARE-MAINTENANCE.md
3. 系統監控：SETUP-CHECKLIST.md 的驗證步驟
```

---

## 🔍 快速查詢表

### 常見命令查詢
| 我想要... | 查看 | 具體位置 |
|---------|------|---------|
| 檢查 BlueMonster 能做什麼 | BLUEMONSTER-SKILLS.md | 環境感知技能、隧道工具、多媒體等 |
| 上傳媒體到 LINE | bluemonster-media-guide.md | 常見場景 - 場景 1 |
| 查詢媒體 API | media-database-guide.md | REST 端點列表 |
| 設置 Cloudflare 隧道 | MEDIA-CDN-SETUP.md | 步驟 1-4 |
| 配置環境變數 | .env.example | 複製並編輯此文件 |
| 啟動 Gateway | SETUP-CHECKLIST.md | 步驟 4 |
| 安裝 VS Code 擴展 | SETUP-CHECKLIST.md | 步驟 5 |
| 驗證設置是否正確 | SETUP-CHECKLIST.md | 步驟 6 |
| 快速分享檔案 | newSkill.md | CSV 快速分享服務 |
| 檢查活躍隧道 | ActiveTunnels.md | 活躍隧道列表 |
| 安全刪除檔案 | copilot-instructions.md | 檔案刪除安全規則 |
| 發現新技能 | newSkill.md | 技能模板和添加指南 |

---

## 📊 文檔結構圖

```
vsmonster/
├─ SETUP-CHECKLIST.md              ⭐ 用戶安裝入口
├─ .env.example                    📝 環境變數模板
├─ packages/
│  └─ blue-monster/
│     └─ .github/
│        └─ copilot-instructions.md  🤖 BlueMonster 系統提示
│                                       (含檔案刪除安全、技能組合)
└─ docs/
   ├─ BLUEMONSTER-SKILLS.md         ⭐ 技能總覽
   ├─ MEDIA-CDN-SETUP.md            🚀 媒體隧道設置
   ├─ bluemonster-media-guide.md    📚 多媒體使用指南
   ├─ media-database-guide.md       📖 API 文檔
   ├─ media-integration-guide.md    🔧 平台集成
   ├─ CLOUDFLARE-MAINTENANCE.md     🛠️  隧道維護記錄
   ├─ ActiveTunnels.md              🌐 活躍隧道管理
   └─ newSkill.md                   📝 技能學習日誌
```

---

## 🎓 學習路徑

### 新手路徑（1-2 小時）
1. 讀 SETUP-CHECKLIST.md → 安裝步驟
2. 執行安裝命令
3. 在 LINE/Telegram 測試
4. 查看 BLUEMONSTER-SKILLS.md 了解能力

### 開發者路徑（2-4 小時）
1. 讀 BLUEMONSTER-SKILLS.md 全文
2. 讀 media-database-guide.md API
3. 讀 media-integration-guide.md 實現
4. 研究 packages/gateway/src/services/ 代碼

### 運維路徑（1-2 小時）
1. 讀 SETUP-CHECKLIST.md 的驗證部分
2. 讀 MEDIA-CDN-SETUP.md
3. 讀 CLOUDFLARE-MAINTENANCE.md
4. 熟悉隧道命令

### BlueMonster 高級功能（2-3 小時）
1. 讀 copilot-instructions.md 的「技能組合思考框架」
2. 學習 newSkill.md 中的技能模板
3. 了解 ActiveTunnels.md 的隧道管理
4. 學習檔案刪除的三層安全確認機制

---

## ❓ 常見問題查詢

### 「我想...」
| 場景 | 查看文檔 | 章節 |
|------|---------|------|
| 快速開發測試 | BLUEMONSTER-SKILLS.md | ngrok 部分 |
| 生產環境部署 | MEDIA-CDN-SETUP.md | Cloudflare Tunnel 部分 |
| 用 AI 處理照片 | bluemonster-media-guide.md | 常見場景 2 |
| 查詢用戶上傳歷史 | bluemonster-media-guide.md | 常見場景 3 |
| 集成新的社群平台 | media-integration-guide.md | 平台特定部分 |
| 調整 Cloudflare 緩存 | MEDIA-CDN-SETUP.md | 未來擴展部分 |
| 移除舊媒體文件 | BLUEMONSTER-SKILLS.md | 檔案操作部分 |
| 快速分享 CSV 給多人 | newSkill.md | CSV 快速分享服務 |
| 為用戶建立上傳表單 | newSkill.md | 臨時網頁服務生成 |
| 安全地刪除檔案 | copilot-instructions.md | 檔案刪除安全規則 |
| 保護系統檔案 | copilot-instructions.md | 受保護的系統檔案清單 |
| 發現新的技能組合 | copilot-instructions.md | 技能組合思考框架 |
| 追蹤活躍隧道 | ActiveTunnels.md | 活躍隧道列表和管理 |

---

## 🔗 相關資源

### 外部文檔
- [Cloudflare Tunnel 官方文檔](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/)
- [ngrok 官方文檔](https://ngrok.com/docs)
- [LINE Bot SDK](https://developers.line.biz/)
- [Telegram Bot API](https://core.telegram.org/bots/api)
- [Discord Bot Documentation](https://discord.com/developers/docs)

### 項目資源
- GitHub 倉庫：https://github.com/akaiHuang/vsmonster
- 問題追蹤：https://github.com/akaiHuang/vsmonster/issues
- 更新日誌：[CHANGELOG.md](../CHANGELOG.md)

---

## 📝 最後更新

**日期**：2026-02-04  
**新增**：
- ✅ 技能組合思考框架（SkillCombination）
- ✅ 檔案刪除三層安全確認機制
- ✅ 系統檔案保護黑名單
- ✅ URL 分享與隧道管理（ActiveTunnels.md）
- ✅ 技能學習日誌（newSkill.md）
**文檔版本**：1.0  
**適用**：vsmonster 所有用戶

---

## 💡 提示

- 💚 所有文檔都支持 Markdown 格式，可在 GitHub 或 VS Code 中查看
- 📎 使用目錄導航在長文檔中快速跳轉
- 🔗 文檔之間有相互參考連結，按需點擊
- ⚡ SETUP-CHECKLIST.md 是最常用的，建議加入收藏

