# UFO 控制中心：Cloudflare + LINE 測試流程紀錄

> 日期：2026-02-03
> 用途：記錄實際流程，後續優化

## 目標
- 讓 LINE 訊息透過 Cloudflare Tunnel 進入 Gateway
- Gateway 再把訊息轉給 UFO，生成任務規格書

## 已完成事項
1. **UFO 外掛可以同步設定到 `.env`**
   - 設定欄位：LINE / Telegram / Discord token、Gateway port
   - 變更會自動寫入專案根目錄 `.env`

2. **Gateway 改為優先讀取 `.env`**
   - `.env` 內的設定覆蓋 `configs/config.json`

3. **Cloudflare Tunnel 已設定 DNS**
   - Tunnel ID: `REDACTED_TUNNEL_ID`
   - Tunnel 名稱: `moltbot`
   - 子網域: `ufo.fawstudio.com`
   - DNS 已執行：
     - `cloudflared tunnel route dns moltbot ufo.fawstudio.com`

4. **LINE Webhook Secret 已建立並寫入 `.env`**
   - `LINE_WEBHOOK_SECRET` 已設定

## 目前使用的 Webhook URL
```
https://ufo.fawstudio.com/webhook/line/REDACTED_LINE_WEBHOOK_SECRET
```

> 注意：請於 LINE Developers 後台設定此 URL。

## 尚需執行（本機終端）
1. 啟動 Cloudflare Tunnel（本機需常駐）
   ```bash
   cloudflared tunnel run moltbot
   ```

2. 重啟 Gateway（讀取最新 `.env`）
   ```bash
   pnpm dev:gateway
   ```

3. 以 LINE 發送訊息測試
   - UFO 應於 `UFO/tasks/pending/` 產生任務規格書

## 問題與風險
- Cloudflare Tunnel 需在**本機終端常駐**
- 若 `.env` 沒有 `LINE_WEBHOOK_SECRET`，Webhook URL 會無法固定
- 若未重啟 Gateway，`.env` 變更不會生效

## 後續可優化方向
1. 在 Gateway 啟動時輸出完整 Webhook URL（含 secret）
2. 在 UFO 設定頁增加「一鍵同步 .env」按鈕與成功提示
3. 將 Cloudflare 設定自動化（腳本或 Launch Agent）
4. 在 UFO 內顯示 Gateway/Tunnel 健康狀態

## 白名單握手（2026-02-03 更新）

- 握手碼由 🛸 / 👾 組成，首次未授權訊息會在後台印出
- 使用者需回覆正確握手碼才能加入白名單
- 若未看到握手碼，可傳「你好」重新產生（後台會更新握手碼）

### 管理指令：清空白名單
Gateway 啟動時會顯示 `UFO Admin reset token`，在 LINE 傳：

```
/ufo-reset <token>
```

成功後會回：`🧹 已清空白名單與握手狀態`
