# BlueMonster 模型切換指南（Copilot / CLI）

這份文件說明 **BlueMonster** 在 VS Code 內切換模型的方式，以及如何透過終端機快速調整設定。

---

## 1) Copilot 模式（預設）

BlueMonster 使用 VS Code **Language Model API（Copilot）**。  
**可切換的模型只會是 Copilot 提供的清單**，無法切換到不在清單中的模型。

### ✅ 切換方式
1. 在 BlueMonster 視窗右上角點 **Model**  
2. 或在命令面板執行：`BlueMonster: Select Model`
3. 或在聊天輸入：`/model <name>` / `/model list`

### ✅ 設定檔固定模型（可用終端機改）
你也可以直接寫入 `settings.json`：
```json
{
  "blueMonster.model": "<copilot-model-id>"
}
```

> `blueMonster.model` 的值必須是 Copilot 提供的 **model id**。  
> 建議先用 **Select Model** 看清單，再把對應 id 寫進去。

### ❗看不到模型的常見原因
- VS Code 版本 < 1.90
- 尚未安裝或登入 GitHub Copilot
- 尚未在 Copilot Chat UI 送出過任何訊息（授權未完成）

---

## 2) CLI 模式（使用你自己的模型）

如果你要用 **gpt-codex-mini** 或其他非 Copilot 模型，請改用 CLI 模式：

```json
{
  "blueMonster.backend": "cli",
  "blueMonster.cliCommand": "your-llm-cli --model {model} --prompt {prompt}",
  "blueMonster.cliModel": "gpt-codex-mini"
}
```

### 🔁 透過終端機切換模型
macOS / Linux：
```bash
export BM_MODEL="gpt-codex-mini"
```

Windows PowerShell：
```powershell
$env:BM_MODEL="gpt-codex-mini"
```

> 你的 CLI 參數名稱可能不是 `--model`。  
> 請以你實際使用的 CLI 文件為準。

---

## 3) Copilot CLI（你說的 copilot CLI）

### ✅ 安裝/啟動
Copilot CLI 可以用 npm 安裝：`npm install -g @github/copilot`。citeturn0search0turn0search5  
或用 `gh copilot` 啟動（`gh` 會自動下載並執行 Copilot CLI）。citeturn0search6

### ✅ 切換模型
Copilot CLI 支援 `/model` 指令或 `--model` 參數切換模型。citeturn0search1

### ✅ BlueMonster 搭配範例
如果用 `gh copilot`：
```json
{
  "blueMonster.backend": "cli",
  "blueMonster.cliCommand": "gh copilot -- -p {prompt}",
  "blueMonster.cliModel": "gpt-codex-mini"
}
```

> `gh copilot` 需用 `--` 才能把參數傳給 Copilot CLI。citeturn0search6

---

## 4) 用終端機直接修改 VS Code 設定檔（選用）

你也可以直接改 VS Code 的 `settings.json`，路徑如下：

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

> 若是 **Insiders / VSCodium**，路徑會略有不同。  
> 建議用 VS Code 命令面板：`Preferences: Open User Settings (JSON)`。

---

## 5) 我還是想在聊天中直接切換模型？

可以做，但要先確認你在 **Copilot 模式** 或 **CLI 模式**：
- Copilot 模式：請用 **Model** 按鈕或 `BlueMonster: Select Model`
- CLI 模式：改環境變數或直接改 `blueMonster.cliCommand`

如果你希望我直接做成「`/model xxx`」指令，我可以幫你加。
