# UFO Control Center 開發清單

**資源位置**: `ufo&crap/ufo.png`, `ufo&crap/ufo.svg`, `ufo&crap/crap.png`, `ufo&crap/crap.svg`

**定位摘要**
UFO 是 VSMONSTER 的新成員，作為一個獨立的 VS Code 擴充套件（類似 BlueMonster），負責「任務討論 → 規格書產出 → 等待區管理 → 交接給 BlueMonster」的控制中心。

**需求流程（目標行為）**
1. LINE 訊息進來後由 UFO 進行互動。
2. UFO 使用 0x AI（Grok）與用戶討論需求。
3. 討論完產出任務規格書，放入任務等待區（以資料夾管理）。
4. 用戶確認後交由 BlueMonster（Opus 4.5）優化大綱與產出開發規格書、拆分零件與組裝說明、產出 `agents.md`。
5. Gemini 3 Flash 開發零件，GPT‑5.2‑Codex 進行組裝、整合、優化與測試。
6. 若仍不滿意，再由 Opus 4.5 修正。
7. UFO 需能列出任務等待區與任務開發進度（對齊 BlueMonster 任務清單）。
8. 完成後如有必要，UFO 將功能整理至「工具區」以累積能力。
9. 後續任務能適時調用工具區（`tools.md`）。

**開發清單（優先順序由上而下）**
1. 定義 UFO 的邊界與責任，與 BlueMonster 的角色切分與交接契約。
2. 決定 UFO 擴充套件的放置位置（建議 `packages/ufo`）與專案結構。
3. 定義 UFO ↔ Gateway 的訊息協定與事件流程（LINE 接入後如何路由到 UFO）。
4. 設計任務規格書格式與模板（檔名規則、狀態欄位、確認欄位）。
5. 設計任務等待區的資料夾結構與存取 API。
6. 實作 UFO VS Code UI：等待區清單、任務狀態、交接狀態。
7. 建立「交接給 BlueMonster」的標準輸入格式與觸發條件。
8. 定義多模型流程的狀態機與降級策略（Grok → Opus 4.5 → Gemini 3 Flash → GPT‑5.2‑Codex）。
9. 新增「每次 AI 接手前先爬文件」的約束與檢查點（系統提示或 preflight）。
10. 建立工具區與 `tools.md` 管理流程（新增、引用、版本紀錄）。
11. 擴充 Mission Control 或新增視覺化：UFO 任務等待區與藍怪開發進度。 
12. 撰寫安裝/設定指南與範例流程（LINE 配置、API key、模型切換策略）。

**待你確認的問題**
1. UFO 擴充套件要與 BlueMonster 共存於同一 Activity Bar 容器，還是獨立容器？
2. 任務等待區預計放在哪個路徑？（例如 `UFO/tasks/pending`）
3. `tools.md` 要放在 `UFO/` 內，還是共享於 `docs/`？
4. 模型供應商的 API key 與設定要放在 VS Code Settings、`.env`，或 gateway 設定檔？
