# BlueMonster 模型切換指南（Copilot SDK）

這份文件說明 **BlueMonster** 在 VS Code 內切換 Copilot 模型與 Reasoning Effort 的方式。

---

## 1) 模型切換方式

BlueMonster 透過 **Copilot SDK / VS Code Language Model API** 運作，模型只能選擇 Copilot 提供的清單。

### ✅ 切換方式
1. 在 BlueMonster 視窗右上角點 **Model**  
2. 或在命令面板執行：`BlueMonster: Select Model`
3. 或在聊天輸入：`/model <name>` / `/model list`
4. 也可以直接對 BlueMonster 說自然語句：
   - `列出可用模型`
   - `切換到 gpt-5-mini high`
   - `改成 gpt-5.1-codex-mini (low)`

### ✅ 直接設定（進階）
你也可以直接寫入 `settings.json`：
```json
{
  "blueMonster.model": "<copilot-model-id>"
}
```

> `blueMonster.model` 的值必須是 Copilot 提供的 **model id**。  
> 建議先用 **/model list** 或 UI 清單查詢。

---

## 2) Reasoning Effort

支援 Reasoning 的模型（例如 GPT‑5 系列）可設定推理等級：

```json
{
  "blueMonster.reasoningEffort": "medium"
}
```

可用值：`low` / `medium` / `high` / `extra-high`  
建議直接在 UI 的模型選單中選取（會自動同步設定）。

---

## 2.5) 代理模式切換（Agent Mode）

你可以透過自然語句或命令切換：
- 自然語句：`切換到代理-安全` / `切換到代理-危險` / `切換到計畫`
- 命令面板：`BlueMonster: Set Mode`

---

## 3) 常見問題

### 看不到模型清單？
可能原因：
- VS Code 版本過舊
- 尚未安裝或登入 GitHub Copilot
- 尚未在 Copilot Chat UI 送出過任何訊息（授權未完成）

---

## 4) 設定檔位置

你可以用 VS Code 命令面板：  
`Preferences: Open User Settings (JSON)`

常見路徑：

macOS（Stable）：
```
~/Library/Application Support/Code/User/settings.json
```

Windows（Stable）：
```
%APPDATA%\Code\User\settings.json
```

Linux（Stable）：
```
~/.config/Code/User/settings.json
```
