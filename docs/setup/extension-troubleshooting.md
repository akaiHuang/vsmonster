# VS Code Extension 開發與除錯紀錄

本文記錄在開發 VSMONSTER Extension 時遇到的常見問題與解決方案，特別是針對 Monorepo 架構下的打包與圖示渲染問題。

## 1. Icon 渲染問題：變成「一坨」實心方塊

### 問題描述
在 Activity Bar 加入 SVG Icon 時，圖示在 VS Code 中顯示為一個實心的顏色方塊（或是黑色方塊），無法正確顯示圖形細節。

### 原因分析
VS Code 的 Activity Bar Icon 需要能夠適應不同的主題（Light/Dark Theme）。如果 SVG 檔案中沒有正確設定 `fill` 屬性，或是使用了固定的顏色代碼，VS Code 可能無法正確渲染或變色。

### 解決方案
SVG 必須使用 `fill="currentColor"` 讓 SVG 繼承父層容器的顏色（即 VS Code 的文字/圖示顏色）。

**錯誤的 SVG:**
```xml
<path fill="#000000" d="..." />
<!-- 或者完全沒有 fill 屬性 -->
```

**正確的 SVG:**
```xml
<g fill="currentColor">
  <path d="..." />
</g>
```

---

## 2. 打包錯誤：Invalid relative path

### 問題描述
執行 `vsce package` 時出現以下錯誤：
```
ERROR  invalid relative path: extension/../../package.json
```

### 原因分析
這通常發生在 **Monorepo** 結構中。`vsce` 預設會打包所有未被 `.vscodeignore` 排除的檔案。如果你的 Extension 目錄下的 `node_modules` 包含指向父目錄的 Symlinks（例如 workspace 依賴），`vsce` 會試圖追蹤這些連結並打包父目錄的檔案，導致路徑計算錯誤（試圖跳出 extension root）。

### 解決方案：設定 `.vscodeignore`
必須在 `.vscodeignore` 中明確排除父層連結或使用「白名單」模式。

#### 方法 A：排除模式 (Exclude)
明確忽略上層目錄：
```ignore
../**
**/../**
node_modules/**  # 如果使用 bundle (如 webpack/esbuild) 則排除 node_modules
```

#### 方法 B：白名單模式 (Whitelist) - **推薦**
先忽略所有檔案，再 "反忽略" (!) 需要的檔案。這是最穩定的方式，確保不會意外打包雜物。

```ignore
# 忽略所有
*

# 白名單 (需要的檔案)
!package.json
!README.md
!LICENSE
!icon.png
!dist/**
!resources/**
```

#### 方法 C：在乾淨目錄打包 - **最可靠**

如果 `.vscodeignore` 仍無法解決問題（例如 npm workspace symlinks 太深），可以複製必要檔案到乾淨目錄後打包：

```bash
# 建立乾淨目錄
mkdir -p /tmp/vsmonster-build

# 複製必要檔案
cp -r package.json README.md CHANGELOG.md LICENSE dist resources /tmp/vsmonster-build/

# 修改 package.json 跳過 prepublish（因為已經編譯好了）
sed -i '' 's/"vscode:prepublish": ".*"/"vscode:prepublish": "echo skipped"/' /tmp/vsmonster-build/package.json

# 安裝 production 依賴並打包
cd /tmp/vsmonster-build
npm install ws --save-exact  # 安裝必要依賴
npx vsce package
```

> ⚠️ **npm workspace symlinks**：在 Monorepo 中，npm/pnpm 會在根目錄的 `node_modules` 建立指向各個 package 的 symlinks。`vsce` 會追蹤這些 symlinks 並嘗試打包父目錄檔案，導致 `invalid relative path` 錯誤。方法 C 可以完全避開這個問題。

---

## 3. README 圖片驗證錯誤

### 問題描述
打包時出現錯誤：
```
ERROR  SVGs are restricted in README.md; please use other file image formats, such as PNG
```

### 原因分析
VS Code Marketplace 基於安全性考量，禁止在 `README.md` 中直接嵌入 SVG 圖片。

### 解決方案
將 `README.md` 中的圖片轉為 PNG 或 JPG 格式。
- ✅ `![Icon](resources/icon.png)`
- ❌ `![Icon](resources/icon.svg)`

---

## 4. node_modules 依賴問題

### 問題描述
在 Monorepo 中，依賴通常會被 Hoist 到根目錄的 `node_modules`。但 Extension 發布時需要獨立的 `node_modules` (或是已經 Bundle 好的程式碼)。

### 解決方案
1. **使用 Bundler (推薦)**：使用 `esbuild` 或 `webpack` 將代碼與依賴打包成單一檔案 (如 `dist/extension.js`)，這樣就不需要打包 `node_modules`。
2. **手動安裝**：在 extension 目錄下執行 `npm install --no-save` 強制安裝依賴到當前目錄（不建議，容易造成版本衝突）。

> VSMONSTER 目前採用 TypeScript 編譯 (`tsc`)，建議未來遷移至 `esbuild` 以簡化打包流程並縮小體積。

---

## 5. Webview 內嵌 Script 被 CSP 封鎖（Tab 點擊無反應）

### 問題描述
在 VS Code Webview 中使用 inline `<script>` 標籤（即直接寫在 HTML 中的 JavaScript），即使設定了正確的 `nonce`、加入 `'unsafe-inline'`、甚至完全移除 CSP `<meta>` 標籤，JavaScript 仍然不會執行。表現為 UI 渲染正常但所有互動（Tab 切換、按鈕點擊等）完全無反應。

### 原因分析
VS Code 對 Webview 有**兩層 CSP**：

1. **VS Code 自身的 CSP（HTTP Header 層級）**：VS Code 透過 HTTP Response Header 對 webview iframe 強制注入 CSP，**這是開發者無法修改的**。
2. **Extension 的 CSP（`<meta>` 標籤層級）**：開發者在 HTML 中寫的 `<meta http-equiv="Content-Security-Policy">` 是第二層。

瀏覽器執行時，**兩層 CSP 都必須通過**，取最嚴格的交集。即使你在 `<meta>` 層放寬了 `script-src`，VS Code 的 HTTP Header CSP 仍然會封鎖 inline script。

### 錯誤的做法（全部無效）

```html
<!-- ❌ 加 nonce 沒用 -->
<meta http-equiv="Content-Security-Policy"
  content="script-src 'nonce-abc123';">
<script nonce="abc123">console.log('blocked')</script>

<!-- ❌ 加 unsafe-inline 沒用（CSP Level 3 中有 nonce 時 unsafe-inline 會被忽略） -->
<meta http-equiv="Content-Security-Policy"
  content="script-src 'unsafe-inline' 'nonce-abc123';">

<!-- ❌ 移除 CSP meta 沒用（VS Code 的 HTTP Header CSP 仍在） -->
<script>console.log('still blocked')</script>

<!-- ❌ 移除 nonce 也沒用 -->
<script>console.log('nope')</script>
```

### 正確的做法：使用外部 Script 檔案

將 JavaScript 放在**獨立的 `.js` 檔案**中，透過 `webview.asWebviewUri()` 轉為合法的 webview URI 再載入：

**TypeScript（Extension Host 端）：**
```typescript
// 建立 script URI
const scriptUri = webview.asWebviewUri(
  vscode.Uri.joinPath(extensionUri, 'media', 'dashboard.js')
);

// HTML 中使用外部 script
return `<!doctype html>
<html>
<body>
  <!-- 透過 data-* 屬性傳遞設定給 JS -->
  <div id="config" data-api-url="${apiUrl}" style="display:none"></div>
  <script src="${scriptUri}"></script>
</body>
</html>`;
```

**JavaScript（外部檔案 `media/dashboard.js`）：**
```javascript
(function () {
  const vscode = acquireVsCodeApi();
  const config = document.getElementById('config');
  const apiUrl = config ? config.dataset.apiUrl : '';

  // 所有 UI 邏輯放在這裡...
})();
```

### 傳遞資料給外部 Script 的方法

由於外部 `.js` 檔案無法使用 template literal 插值（如 `${variable}`），需要透過其他方式傳遞設定值：

| 方法 | 說明 |
|------|------|
| `data-*` 屬性 | 在 HTML 元素上設定 `data-xxx`，JS 透過 `el.dataset.xxx` 讀取（**推薦**） |
| 隱藏 `<input>` | `<input type="hidden" id="config" value="${json}">` |
| `window.postMessage` | Extension Host 透過 `webview.postMessage()` 傳送 |

### 除錯技巧

如果懷疑 JS 沒有執行，可以在 HTML 中加入一個視覺化的偵測 Banner：

```html
<div id="js-check" style="background:red;color:white;padding:16px;font-size:18px;">
  JS NOT RUNNING - script blocked by CSP
</div>
```

外部 JS 中第一行移除它：

```javascript
(function () {
  const check = document.getElementById('js-check');
  if (check) check.remove();
  // ... 其餘邏輯
})();
```

如果頁面上看到紅色 Banner，就表示 JS 確實沒有執行。

### 重點總結

| 項目 | 說明 |
|------|------|
| Inline `<script>` | 永遠被封鎖，不論 nonce、unsafe-inline 設定 |
| 外部 `.js` + `asWebviewUri()` | 唯一可靠的方式 |
| CSP 層級 | VS Code HTTP Header（不可改）+ Extension `<meta>`（可改），取交集 |
| `enableScripts: true` | 必須設定，但不代表 inline script 能執行 |
| 資料傳遞 | 用 HTML `data-*` 屬性或 `postMessage` |
