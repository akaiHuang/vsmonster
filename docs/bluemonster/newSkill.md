# 📝 BlueMonster 新技能發現日誌

> 當 BlueMonster 通過技能組合發現新的解決方案時，將其記錄在此。
> 這份文檔用於未來快速調用和參考。

---

## 使用方式

每次 BlueMonster 發現一個新技能時：

1. 在本文件中添加新的「技能條目」
2. 記錄技能名稱、問題、解決方案、代碼範例
3. 標記技能等級（基礎、進階、高級）
4. 添加到 BLUEMONSTER-SKILLS.md 的相應部分

---

## 技能條目模板

```markdown
### [技能名稱]

**發現時間**：YYYY-MM-DD  
**難度**：基礎 / 進階 / 高級  
**原始問題**：[什麼情況下需要這個技能]

**解決方案**：
[描述此技能如何工作]

**涉及的組合技能**：
- [技能1]
- [技能2]

**使用命令**：
\`\`\`bash
[具體命令]
\`\`\`

**程式碼範例**：
\`\`\`bash
[具體實例]
\`\`\`

**風險提示**：
[有什麼需要注意的地方]

**相關文檔**：
- [連結1]
- [連結2]

**狀態**：
- [ ] 驗證成功
- [ ] 已添加到 BLUEMONSTER-SKILLS.md
- [ ] 可供生產使用
```

---

## 已發現的新技能

### 1. CSV 快速分享服務

**發現時間**：2026-02-04  
**難度**：進階  
**原始問題**：用戶需要分享 CSV 文件給多人下載，但沒有伺服器

**解決方案**：
組合使用 Python HTTP 伺服器 + ngrok 隧道，快速生成公開下載連結。

**涉及的組合技能**：
- Python 環境
- ngrok 隧道工具
- Terminal 命令執行
- HTTP 伺服器概念

**使用命令**：
```bash
# 1. 進入檔案所在目錄
cd /path/to/csv

# 2. 啟動 Python HTTP 伺服器
python3 -m http.server 8000

# 3. 在另一個終端啟動 ngrok（新終端）
ngrok http 8000

# 4. 複製 ngrok 提供的 URL 給用戶
# 用戶可直接訪問並下載 CSV
```

**程式碼範例**：
```bash
# 快速分享單個檔案
$ cd ~/Downloads
$ python3 -m http.server 9000 &
$ ngrok http 9000
# URL: https://abc-xyz.ngrok.io/myfile.csv
```

**風險提示**：
- ⚠️ ngrok URL 是臨時的（重新啟動會變更）
- ⚠️ 應使用 Cloudflare Tunnel 做長期分享
- ⚠️ 注意防火牆可能阻止連接
- ⚠️ 敏感檔案不要通過此方式分享

**狀態**：
- [x] 驗證成功
- [ ] 已添加到 BLUEMONSTER-SKILLS.md
- [x] 可供生產使用

---

### 2. 臨時網頁服務生成

**發現時間**：2026-02-04  
**難度**：進階  
**原始問題**：AI 需要為用戶快速製作一個查看/上傳網頁，並分享給多人

**解決方案**：
用 Express.js 或簡單的 Python Flask 建立 HTTP 伺服器，提供 HTML 網頁，配合 ngrok/Cloudflare 分享。

**涉及的組合技能**：
- Express.js 框架 / Python Flask
- HTML 網頁開發
- ngrok / Cloudflare 隧道
- 埠號管理

**使用命令**：
```bash
# 1. 創建簡單 Express 伺服器
node /path/to/server.js

# 2. 啟動隧道
ngrok http 3000

# 3. 分享 URL
# 用戶訪問 URL 即看到網頁
```

**程式碼範例**：
```javascript
// quick-server.js
const express = require('express');
const app = express();

app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
      <body>
        <h1>檔案分享</h1>
        <form method="post" enctype="multipart/form-data">
          <input type="file" name="file">
          <button type="submit">上傳</button>
        </form>
      </body>
    </html>
  `);
});

app.listen(3000, () => console.log('Server running on port 3000'));
```

**風險提示**：
- ⚠️ 臨時 HTML 無法持久化
- ⚠️ 應實現認證防止未授權訪問
- ⚠️ 檔案上傳需驗證大小和類型
- ⚠️ HTTPS 建議使用 Cloudflare Tunnel

**狀態**：
- [x] 驗證成功
- [ ] 已添加到 BLUEMONSTER-SKILLS.md
- [ ] 可供生產使用（需改進安全）

---

### 3. 日誌查看服務

**發現時間**：2026-02-04  
**難度**：基礎  
**原始問題**：用戶要查看 vsmonster 的運行日誌，但在遠端機器上

**解決方案**：
啟動 HTTP 伺服器提供日誌檔案，配合隧道分享即時日誌視圖。

**涉及的組合技能**：
- 日誌檔案定位
- HTTP 伺服器
- 隧道分享
- 實時查看

**使用命令**：
```bash
# 1. 進入日誌目錄（如果有）
cd /path/to/logs

# 2. 啟動伺服器
python3 -m http.server 8001

# 3. 啟動隧道
ngrok http 8001

# 用戶訪問 URL 查看日誌
```

**風險提示**：
- ⚠️ 日誌可能包含敏感信息（IP、Token）
- ⚠️ 應使用認證保護
- ⚠️ 定期輪轉日誌文件

**狀態**：
- [x] 驗證成功
- [ ] 已添加到 BLUEMONSTER-SKILLS.md
- [ ] 可供生產使用

---

## 技能分類索引

### 🌐 網路分享類
- CSV 快速分享服務
- 臨時網頁服務生成
- 日誌查看服務

### 🔧 工具組合類
- [待補充]

### 📊 數據處理類
- [待補充]

### 🔐 安全相關
- [待補充]

---

## 如何添加新技能

1. **複製上面的模板**
2. **填寫所有欄位**（至少包括：技能名稱、原始問題、解決方案、使用命令）
3. **標記狀態**（未驗證 → 驗證成功 → 添加到主文檔 → 可供使用）
4. **提交時確認**已驗證成功且無風險

---

## 技能狀態說明

| 狀態 | 說明 | 是否可用 |
|------|------|---------|
| 🔍 探索中 | 正在測試的新想法 | ❌ 否 |
| ✅ 驗證成功 | 已測試且正常工作 | ✅ 是 |
| 📚 已文檔化 | 已添加到 BLUEMONSTER-SKILLS.md | ✅ 是 |
| ⚠️ 需改進 | 已驗證但有已知問題 | ⚠️ 謹慎使用 |
| 🚀 生產就緒 | 安全穩定，可用於生產 | ✅ 是 |

---

## 相關文檔

- [BLUEMONSTER-SKILLS.md](./BLUEMONSTER-SKILLS.md) - 主技能表
- [packages/blue-monster/.github/copilot-instructions.md](../../packages/blue-monster/.github/copilot-instructions.md) - BlueMonster 系統提示
- [SETUP-CHECKLIST.md](../SETUP-CHECKLIST.md) - 安裝檢查清單

---

**最後更新**：2026-02-04  
**條目數量**：3 個新技能  
**已驗證**：3 / 3

