# Telegram 連線問題排除指南

## 問題描述

**日期**：2026-02-04

**症狀**：
- Gateway 啟動時出現 `HttpError: Network request for 'getMe' failed!`
- 錯誤碼：`ETIMEDOUT`
- curl 命令可以正常連接 Telegram API
- Node.js 無法連接 Telegram API

**錯誤訊息**：
```
[ERROR] Failed to initialize Telegram bot: HttpError: Network request for 'getMe' failed!
    at ApiClient.call (grammy/out/core/client.js:54:29)
    ...
  error: FetchError: request to https://api.telegram.org/bot.../getMe failed, reason: 
    errno: 'ETIMEDOUT',
    code: 'ETIMEDOUT'
```

## 原因分析

**根本原因**：Node.js 的網路堆疊與系統 curl 使用不同的連線方式

| 測試 | 結果 |
|------|------|
| `curl https://api.telegram.org/bot.../getMe` | ✅ 成功 |
| `curl -4 https://api.telegram.org/bot.../getMe` (IPv4) | ✅ 成功 |
| `node -e "fetch('https://api.telegram.org/...')"` | ❌ ETIMEDOUT |
| `NODE_OPTIONS="--dns-result-order=ipv4first" node ...` | ❌ ETIMEDOUT |

**可能原因**：
1. **DNS 解析差異**：Node.js 可能優先使用 IPv6，而 IPv6 路由被封鎖
2. **TLS 握手問題**：Node.js 使用的 TLS 庫與系統不同
3. **防火牆/代理限制**：某些網路環境只允許特定程式連線
4. **grammy 套件**：使用 `node-fetch` 可能有額外的網路限制

## 解決方案

### 方案 A：Curl Fallback 模式（已實作）

修改 `packages/gateway/src/channels/telegram/index.ts`，在 grammy 失敗時自動切換到 curl：

```typescript
// 自定義 API 請求函數，使用 curl 繞過 Node.js 網路問題
async function customFetch(url: string, init?: RequestInit): Promise<Response> {
  const method = init?.method || 'GET';
  const body = init?.body ? String(init.body) : '';
  
  let cmd: string;
  if (method === 'POST' && body) {
    cmd = `curl -s -X POST "${url}" -H "Content-Type: application/json" -d '${body}'`;
  } else {
    cmd = `curl -s "${url}"`;
  }
  
  const { stdout } = await execAsync(cmd, { timeout: 30000 });
  return new Response(stdout, { status: 200 });
}
```

**優點**：
- 不需要修改網路環境
- 自動 fallback，無需手動切換

**限制**：
- 圖片/檔案上傳在 curl 模式下不支援
- 效能略差（每次都啟動子程序）

### 方案 B：使用 VPN

開啟 VPN 後重啟 Gateway，讓所有流量走 VPN 通道。

### 方案 C：部署到雲端

將 Gateway 部署到可以正常連接 Telegram API 的伺服器（如 Railway、Render、Vercel）。

### 方案 D：設定 HTTP Proxy

在 `.env` 中設定代理：
```bash
HTTP_PROXY=http://your-proxy:port
HTTPS_PROXY=http://your-proxy:port
```

## 驗證方式

1. **測試 curl 連線**：
```bash
curl -s "https://api.telegram.org/bot<TOKEN>/getMe"
```

2. **測試 Node.js 連線**：
```bash
node -e "fetch('https://api.telegram.org/bot<TOKEN>/getMe').then(r=>r.json()).then(console.log).catch(console.error)"
```

3. **檢查 Gateway 日誌**：
```
[INFO] Telegram Bot initialized (curl mode): @YourBotName
```
看到 `(curl mode)` 表示正在使用 curl fallback。

## 相關檔案

- `packages/gateway/src/channels/telegram/index.ts` - Telegram channel 實作
- `.env` - Telegram Bot Token 設定
- `docs/setup-telegram.md` - Telegram 設定指南

## 參考資料

- [grammy Documentation](https://grammy.dev/)
- [Telegram Bot API](https://core.telegram.org/bots/api)
- [Node.js DNS Resolution](https://nodejs.org/api/dns.html)
