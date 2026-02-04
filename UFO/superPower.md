# UFO & BlueMonster 技能庫

> 這個檔案記錄所有已開發過的專案技能，可重複調用避免重複造輪子。

## 🎯 使用方式

當用戶需求與已有技能相似時：
1. 搜尋此檔案找到相關技能
2. 直接調用 BlueMonster 執行相應的任務
3. 告知用戶使用現有技能，無需重新開發

---

## 📦 技能清單

### 1. 隨機 Emoji 狀態訊息

**功能描述**：
- 在 AI 思考時顯示動態隨機 emoji，提升用戶體驗
- 每次狀態更新使用不同的 emoji

**適用場景**：
- 長時間 AI 處理需要視覺反饋
- 需要讓等待過程更有趣

**技術實作**：
```typescript
const randomEmojis = ['✨', '🤔', '🙂‍↔️', '🛸', '🤩', '😮', '🤭', '🥕', '🥦', '🌟', '💓', '👀'];
const getRandomEmoji = () => randomEmojis[Math.floor(Math.random() * randomEmojis.length)];
sendToUser(channel, userId, `👾 ${getRandomEmoji()} Thinking... 👾`);
```

**檔案位置**：
- `UFO/extension/src/extension.ts` (line 1310-1325)

**建立時間**：2026-02-04

---

### 2. 動態個性學習系統

**功能描述**：
- AI 可根據用戶要求修改自己的回覆風格
- 支援自動學習用戶偏好（you.md）
- 支援主動調整個性（me.md）

**適用場景**：
- 用戶想改變 AI 的回覆風格
- 需要記錄用戶長期習慣
- 個性化客製 AI 助理

**技術實作**：
```typescript
// 自動學習（每次對話）
appendUserProfile(context, userMessage);

// 載入個性上下文
function loadPersonaContext(context) {
  return `<me>${fs.readFileSync(mePath)}</me>
          <you>${fs.readFileSync(youPath)}</you>`;
}
```

**檔案位置**：
- `UFO/extension/src/extension.ts` (line 905-923)
- `UFO/me.md` - 個性定義
- `UFO/you.md` - 自動學習記錄

**建立時間**：2026-02-04

---

## 📝 新增技能範本

當 BlueMonster 完成新專案後，請按此格式新增：

```markdown
### [技能編號]. [技能名稱]

**功能描述**：
- （簡短說明這個技能做什麼）

**適用場景**：
- （什麼情況下可以使用）

**技術實作**：
\`\`\`typescript
// 關鍵程式碼片段
\`\`\`

**檔案位置**：
- （檔案路徑和行數）

**建立時間**：YYYY-MM-DD

**相關技能**：
- （如果有關聯的其他技能）
```

---

## 🔍 技能分類索引

### 用戶體驗
- #1 隨機 Emoji 狀態訊息

### AI 個性化
- #2 動態個性學習系統

### 檔案操作
- （待補充）

### 任務管理
- （待補充）

### 通訊整合
- （待補充）

---

## 💡 使用建議

1. **優先搜尋**：用戶提出需求時，先搜尋 superPower.md 是否有類似技能
2. **組合使用**：多個技能可以組合使用解決複雜問題
3. **持續更新**：每次 BlueMonster 完成新功能都要記錄
4. **標註版本**：如果技能有更新，記錄版本變化

---

最後更新：2026-02-04
