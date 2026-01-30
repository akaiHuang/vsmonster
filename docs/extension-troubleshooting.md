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
