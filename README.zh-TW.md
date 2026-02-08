<p align="center">
  <img src="packages/blue-monster/resources/blueMonster.svg" alt="VSMONSTER" width="220">
</p>

<h1 align="center">VSMONSTER</h1>

<p align="center">
  <strong>手機傳一句話。<br>你的電腦在你睡覺時寫程式。</strong>
</p>

<p align="center">
  第一個 <strong>Gemini 3</strong> 多 Agent 蟲群協作 for VS Code。<br>
  <a href="https://vsmonster.pages.dev">線上展示</a> ·
  <a href="CHANGELOG.md">更新日誌</a> ·
  <a href="README.md">English</a>
</p>

---

## 這是什麼？

VSMONSTER 把 VS Code 變成你用手機操控的 AI 工廠。
傳一句話 → 一群 Agent 立刻開始幫你同時寫程式。

它由三個核心 Agent 組成：

| Agent | 角色 | 做什麼 |
|-------|------|--------|
| **UFO** 🛸 | 控制中心 | 管理、規劃、分配任務。收到你的需求後，UFO 把它拆成任務規格書，管理排程，再把核准的任務交給 BlueMonster 去做。 |
| **BlueMonster** 👾 | 任務執行者 | 真正動手寫程式的那位。BlueMonster 透過 GitHub Copilot SDK 執行任務 — 讀檔案、寫程式、跑終端機、分析圖片 — 而且可以同時跑多個任務。 |
| **Holography** 🛰️ | 訊息翻譯官（通訊橋樑） | 把你手機上的訊息（LINE / Telegram / Discord）翻譯成 UFO 聽得懂的指令，再把結果傳回你的手機。 |

```
你（拿著手機）
  📱 「修好登入的 bug，再加一個深色模式」
    ↓
Holography 🛰️ 翻譯你的訊息
    ↓
UFO 🛸 建立任務規格、規劃工作
    ↓
BlueMonster 👾 用 Copilot 開始寫程式
    ↓
📱 手機收到通知：「完成了，預覽在這裡。」
```

---

## 它能幫你什麼？

**在任何地方寫程式** — 通勤、吃飯、遛狗時用手機傳任務，你的電腦幫你做。

**同時跑多個任務** — 不像普通 Copilot 一次只能做一件事，BlueMonster 在背景同時處理多個任務。排 10 個重構工作，去喝杯咖啡，回來全部完成。

**看見一切正在發生** — VS Code 側邊欄的即時任務面板 + Mission Control 手機網頁。看著任務從 Pending → Running → Done。

**Gemini 3、Claude、GPT — 全部固定費率** — 靠你的 GitHub Copilot 訂閱，就能用 Gemini 3 Pro、Claude Opus、GPT-5 等頂級模型。不用按 token 計費。一天跑 100 個任務，月費還是 $10–$39。

**手機上審核與批准** — 任務完成後，手機收到交付連結。預覽結果、檢查程式碼，批准或退回。

**安全到底** — 所有執行都在你的本機。程式碼不會離開你的電腦。Token 絕不暴露給 AI。

---

## 開始使用（4 個步驟）

### 第一步：裝好 VS Code + Copilot

1. **下載 VS Code**

| 平台 | 下載連結 |
|------|----------|
| macOS | [下載](https://code.visualstudio.com/sha/download?build=stable&os=darwin-universal) |
| Windows | [下載](https://code.visualstudio.com/sha/download?build=stable&os=win32-x64-user) |
| Linux | [下載](https://code.visualstudio.com/sha/download?build=stable&os=linux-x64) |

2. **安裝 GitHub Copilot 擴充功能** — 開啟 VS Code → Extensions（`Cmd+Shift+X`）→ 搜尋 "GitHub Copilot" → 安裝

3. **選擇方案**

| 方案 | 價格 | 適合誰 |
|------|------|--------|
| Free | $0/月 | 先試用看看 |
| Pro | $10/月 | 一般使用 |
| **Pro+** | **$39/月** | **最強模型（Claude Opus、GPT-5 Codex）** |

> 作者推薦 Pro+，因為頂級模型處理複雜的跨檔案任務能力明顯更強。

---

### 第二步：安裝 VSMONSTER

**方法 A：用 Copilot 一鍵安裝（推薦）**

在 VS Code 開啟 Copilot Chat，貼上：

```
幫我安裝 👾 VSMONSTER 👾
https://github.com/akaiHuang/vsmonster.git
```

Copilot 會自動 clone、安裝依賴、引導你完成設定。

**方法 B：手動安裝**

```bash
git clone https://github.com/akaiHuang/vsmonster.git
cd vsmonster
pnpm install
cp .env.example .env
```

然後安裝 VS Code 擴充功能：
- 從 Marketplace：在 Extensions 搜尋 "VSMONSTER"
- 或下載 VSIX：[最新版本](https://github.com/akaiHuang/vsmonster/releases/latest)

**設定通訊軟體：**

> Token 很敏感 — 這步請自己動手，不要讓 AI 看到。

| 平台 | 難易度 | 教學 |
|------|--------|------|
| Telegram | 最簡單 | [設定教學](docs/setup/setup-telegram.md) |
| LINE | 中等 | [設定教學](docs/setup/setup-line.md) |
| Discord | 進階 | [設定教學](docs/setup/setup-discord.md) |

把平台的 Token 填入 `.env` 檔案，然後啟動 Gateway：

```bash
pnpm dev:gateway
```

---

### 第三步：你的第一個 Hello World

在用手機操控之前，先在 VS Code 裡面練習：

1. 用 VS Code 開啟你的專案
2. 找到側邊欄的 VSMONSTER 圖示 — 點開它
3. 你會看到 UFO 🛸 儀表板：連線狀態、任務列表、頻道資訊
4. 試著建立一個任務：開一個新檔案，叫 BlueMonster 幫你寫一個「Hello World」程式
5. 看著 BlueMonster 工作 — 它會規劃、寫程式、回報完成

恭喜 — 你剛剛讓 AI 幫你寫了程式，而你只是在旁邊看。

---

### 第四步：開始用手機操控

最爽的部分來了 — 用手機操控一切：

1. 打開你的通訊軟體（LINE / Telegram / Discord）
2. 傳一句話給你的 VSMONSTER 機器人：
   ```
   幫我做一個有 hero section 和聯絡表單的 landing page
   ```
3. 看著你的電腦自己開始寫程式（或在手機上打開 Mission Control：`http://你的tunnel網址:3001`）
4. 完成時收到通知 — 審核、批准、上線

你現在正躺在沙發上寫程式。享受你的人生吧。

---

## 架構

```
📱 手機（LINE / Telegram / Discord）
         ↓ webhook
   ┌─────────────────┐
   │ Holography 🛰️    │  訊息翻譯層
   └────────┬────────┘
            ↓
   ┌─────────────────┐
   │ Gateway          │  指揮調度中心（port 3000）
   └──┬─────┬─────┬──┘
      ↓     ↓     ↓
   UFO 🛸  👾    Mission Control
   規格 &  BlueMonster  任務面板
   排程    執行程式碼    （port 3001）
            ↓
      GitHub Copilot SDK
```

| 元件 | 做什麼 | 位置 |
|------|--------|------|
| **UFO** 🛸 | VS Code 擴充 — 任務規格與排程 | `UFO/extension/` |
| **BlueMonster** 👾 | VS Code 擴充 — AI 任務執行 | `packages/blue-monster/` |
| **Holography** 🛰️ | 多平台通訊整合（LINE/TG/Discord） | `packages/holography/` |
| **Gateway** | HTTP + WebSocket 伺服器 | `packages/gateway/` |
| **Mission Control** | Next.js 任務面板 | `packages/mission-control/` |

---

## 指令

從通訊軟體或 VS Code 中使用：

| 指令 | 做什麼 |
|------|--------|
| `/task 建立登入頁面` | 建立新任務 |
| `/status` | 查看所有任務進度 |
| `/model gpt-4` | 切換 AI 模型 |
| `/preview` | 取得預覽連結 |
| `/cancel task-001` | 取消任務 |
| `/help` | 顯示可用指令 |

> 不是指令的訊息，會自動被當成新任務處理。

---

## 隧道設定（對外連線）

要接收 LINE / Telegram / Discord 的訊息，Gateway 需要一個公開網址：

| 方法 | 安全性 | 難度 |
|------|--------|------|
| **Cloudflare Tunnel** | 最好（完全隱藏 IP） | 中等 |
| **ngrok** | 好（臨時網址） | 簡單 |

> 絕對不要直接暴露你的家用 IP。請務必使用隧道。

參考：[Cloudflare 設定](docs/setup/setup-cloudflare-tunnel.md) · [ngrok 設定](docs/setup/setup-ngrok.md)

---

## 安全性

- 全程本地執行 — 程式碼不會離開你的電腦
- Token 只存在 `.env`（已 gitignore，chmod 600）
- Token 偵測機制防止意外暴露
- 白名單 + 握手驗證機制保護通訊平台

---

## License

MIT

---

<p align="center">
  <strong>UFO 🛸 + BlueMonster 👾 + Holography 🛰️ = VSMONSTER</strong><br>
  <em>不要坐在辦公桌前了。在任何地方開始寫程式吧。</em>
</p>
