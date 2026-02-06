# Cloudflare Tunnel 維護記錄

**日期**：2026年2月4日

## 操作摘要

檢查並清理 Cloudflare Tunnel 的重複進程。

---

## 1. 查看登入狀況

```bash
cloudflared tunnel list
```

**結果**：
- ✅ 已登入
- 隧道名稱：`moltbot`
- 隧道 ID：`<your-tunnel-id>`
- 建立時間：2026-01-29 08:35:48

---

## 2. 查看隧道詳細資訊

```bash
cloudflared tunnel info moltbot
```

**結果**：
- 4 個連接器（Connector）在運行
- 所有連接器都是 macOS ARM64 架構
- 版本：2026.1.2
- 原點 IP：1.161.93.215

| 連接器 ID | 建立時間 | 狀態 |
|---|---|---|
| 416c4967... | 2026-01-29 08:52:25 | 活躍 |
| 7506a117... | 2026-01-29 08:52:55 | 活躍 |
| ba613d88... | 2026-02-03 04:44:54 | 活躍 |
| 0acb013e... | 2026-02-03 04:48:15 | 活躍 |

---

## 3. 查看網域設定

```bash
cat ~/.cloudflared/config.yml
```

**配置內容**：
```yaml
tunnel: <your-tunnel-id>
credentials-file: ~/.cloudflared/<your-tunnel-id>.json

ingress:
  - hostname: your-domain.com
    service: http://localhost:3000
  - service: http_status:404
```

**綁定網域**：
- **網域**：`ufo.fawstudio.com`
- **指向**：`http://localhost:3000`

---

## 4. 發現的問題：重複進程

```bash
ps aux | grep cloudflared | grep -v grep
```

**結果**：發現 4 個重複的 cloudflared 進程在運行

| PID | 啟動時間 | 狀態 |
|-----|---------|------|
| 47352 | 四04下午 | 後台 (SN) |
| 49015 | 四04下午 | 後台 (S) |
| 74186 | 12:44下午 | 活躍終端 (S+) |
| 78061 | 12:48下午 | 活躍終端 (S+) |

**問題影響**：
- 資源浪費（多個進程佔用記憶體）
- 可能的連接衝突

---

## 5. 清理重複進程

執行清理命令：

```bash
# 停止所有 cloudflared 進程
killall cloudflared

# 確認清理完成
ps aux | grep cloudflared | grep -v grep
```

**結果**：✅ 所有進程已清理

---

## 6. DNS 錯誤記錄

**錯誤訊息**：
```
2026-02-03T16:38:15Z ERR Failed to refresh DNS local resolver error="ParseAddr(\"\"): unable to parse IP"
```

**說明**：
- DNS 解析器試圖解析一個空的 IP 地址
- 原因：配置中可能有殘留的空值或版本衝突
- **影響**：⚠️ 僅影響 DNS 解析器功能，不影響隧道主要轉發功能
- **狀態**：✅ 隧道仍正常運作，可安全忽略

---

## 重新啟動隧道

清理後，若需重新啟動隧道，執行：

```bash
# 前台運行（可見日誌）
cloudflared tunnel run moltbot

# 後台運行（可選）
nohup cloudflared tunnel run moltbot > ~/.cloudflared/tunnel.log 2>&1 &
```

---

## 狀態檢查命令參考

| 操作 | 命令 |
|------|------|
| 查看所有隧道 | `cloudflared tunnel list` |
| 查看隧道詳情 | `cloudflared tunnel info moltbot` |
| 查看配置檔 | `cat ~/.cloudflared/config.yml` |
| 查看運行進程 | `ps aux \| grep cloudflared` |
| 查看隧道日誌 | `cloudflared tunnel run moltbot` |

---

**最後更新**：2026-02-04 12:48
