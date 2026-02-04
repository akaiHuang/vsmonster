# UFO Prompt 測試指南

## 📋 Prompt 架構說明

UFO 的 System Prompt 由三個部分組成（按載入順序）：

```
1. copilot-instructions.md  (核心系統規則)
      ↓
2. me.md + you.md          (個性 + 使用者偏好)
      ↓
3. Prompt Studio          (Web UI 動態覆蓋)
```

### 各檔案職責

| 檔案 | 用途 | 更新頻率 | 生效方式 |
|------|------|----------|----------|
| `copilot-instructions.md` | 核心系統提示、回覆規範 | 很少改 | 重啟擴充套件 |
| `me.md` | UFO 角色定位、語氣風格 | 偶爾調整 | 重啟擴充套件 |
| `you.md` | 使用者偏好（自動學習）| 每則訊息 | 即時生效 |
| `prompt-studio.json` | 開發測試用 | 測試時 | 即時生效 |

---

## 🧪 測試方法

### 方法 1：語氣風格測試

**目的**：驗證 me.md 是否生效

**步驟**：
1. 編輯 `/UFO/me.md`，在「語氣與風格」區塊加入：
   ```markdown
   - **測試標記**：每次回答都用「👾」emoji 開頭
   ```

2. 重新載入 VS Code：
   - 按 `Cmd+Shift+P`
   - 輸入 "Developer: Reload Window"
   - 按 Enter

3. 透過 LINE 發送訊息給 UFO：
   ```
   哈囉，需要我幫你做什麼？
   ```

4. 檢查回覆是否以「👾」開頭

**預期結果**：
```
👾 哈囉！需要我幫你做什麼？

建議：1) 檢視專案搜尋並回報結構；2) 幫你修改或新增程式碼片段；3) 建立任務交給 BlueMonster。
```

---

### 方法 2：載入日誌檢查

**目的**：確認 System Prompt 完整載入

**步驟**：
1. 編輯 `/UFO/extension/src/extension.ts` 第 1303 行後加入：
   ```typescript
   const systemPrompt = [
     loadCopilotInstructions(context),
     loadPersonaContext(context),
     buildChatSystemPrompt()
   ]
     .filter(Boolean)
     .join("\n\n");
   
   // 加入這行 👇
   output.appendLine(`[UFO] 🧬 System Prompt (${systemPrompt.length} chars):\n${systemPrompt.substring(0, 500)}...`);
   ```

2. 重新編譯：
   ```bash
   cd /Users/akaihuangm1/Desktop/vsmonster
   pnpm --filter ufo-control-center build
   ```

3. 重新載入 VS Code

4. 發送訊息後，查看 Output 面板（選擇 "UFO"）

**預期輸出**：
```
[UFO] 🧬 System Prompt (1234 chars):
<copilot_instructions>
# UFO Copilot SDK Instructions
...
</copilot_instructions>

<me>
# UFO 個性檔案
...
</me>

<you>
# 使用者檔案
...
</you>
```

---

### 方法 3：you.md 記錄驗證

**目的**：確認使用者對話自動記錄

**步驟**：
1. 透過 LINE 發送 3 則不同訊息：
   ```
   訊息 1：Hi
   訊息 2：可以陪我聊天嗎？
   訊息 3：今天天氣如何？
   ```

2. 查看 `/UFO/you.md` 檔案：
   ```bash
   tail -10 /Users/akaihuangm1/Desktop/vsmonster/UFO/you.md
   ```

**預期結果**：
```markdown
## 需求模式
- （待補充）
- 2026-02-04T14:20:30.123Z Hi
- 2026-02-04T14:21:15.456Z 可以陪我聊天嗎？
- 2026-02-04T14:22:03.789Z 今天天氣如何？
```

---

### 方法 4：Prompt Studio 測試

**目的**：測試動態 Prompt 覆蓋

**步驟**：
1. 在 VS Code 中按 `Cmd+Shift+P`

2. 輸入 "UFO: Open Prompt Studio"

3. 在 "System Prompt" 欄位輸入：
   ```
   你必須在每次回答結尾加上「-- UFO 測試中 --」
   ```

4. 點擊「儲存」

5. 透過 LINE 發送訊息

**預期結果**：
```
回覆內容...

-- UFO 測試中 --
```

**測試完成後**：清空 Prompt Studio 內容並儲存

---

## 🔧 常見問題

### Q1：修改 copilot-instructions.md 後沒生效？
**A**：需要重新載入 VS Code（Cmd+Shift+P → "Developer: Reload Window"）

### Q2：me.md 修改後仍用舊風格？
**A**：檢查是否有 Prompt Studio 內容覆蓋（清空 prompt-studio.json）

### Q3：you.md 沒有自動記錄？
**A**：檢查 extension.ts 的 `appendUserProfile()` 是否被呼叫（加日誌測試）

### Q4：如何停用 Prompt Studio？
**A**：
```typescript
// 在 extension.ts 第 1303 行改為：
const systemPrompt = [
  loadCopilotInstructions(context),
  loadPersonaContext(context),
  // buildChatSystemPrompt()  // 註解掉這行
]
  .filter(Boolean)
  .join("\n\n");
```

---

## 📊 Prompt 優先順序

當多個 Prompt 有衝突時，優先順序為：

```
Prompt Studio (最高) > me.md > copilot-instructions.md
```

**建議**：
- **copilot-instructions.md**：穩定的核心規則
- **me.md**：可調整的個性風格
- **Prompt Studio**：僅用於開發測試
- **you.md**：不要手動編輯（自動累積）

---

## 🎯 最佳實踐

1. **職責分離**：
   - `copilot-instructions.md`：系統規則、回覆規範
   - `me.md`：語氣、風格、個性
   - `you.md`：使用者偏好學習

2. **測試流程**：
   ```
   修改 Prompt → 重啟 VS Code → 發送測試訊息 → 檢查回覆
   ```

3. **版本控制**：
   - `copilot-instructions.md` 和 `me.md` 加入 Git
   - `you.md` 和 `prompt-studio.json` 加入 .gitignore

4. **清理策略**：
   - you.md 超過 1000 行時，保留最近 500 則對話
   - 定期備份 you.md 以分析使用者偏好
