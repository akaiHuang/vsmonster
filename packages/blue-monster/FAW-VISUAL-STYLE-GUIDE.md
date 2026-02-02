# FAW Creative Studio 視覺風格報告

> 🎨 **FAW Labs** - Cyberpunk / Tech-Terminal 設計系統分析
> 
> 生成日期：2026年1月30日

---

## 📊 風格定位

| 屬性 | 描述 |
|------|------|
| **主風格** | Cyberpunk Terminal / HUD Interface |
| **次要風格** | Retro Gaming (8-bit Pixel Art) |
| **設計語言** | 科技軍事終端機 + 復古電玩 |
| **目標氛圍** | 專業科技感、未來感、駭客美學 |

---

## 🎨 色彩系統

### 主要色彩 (CSS Variables)

```css
:root {
  --c-primary: #00FF99;    /* 霓虹綠 - 主要強調色 */
  --c-alert: #FF004D;      /* 警報紅 - 次要強調色/CTA */
  --c-dark: #050505;       /* 深黑 - 主要背景 */
  --c-grid: #1A1A1A;       /* 格線灰 - 網格/邊框 */
}
```

### 完整色板

| 用途 | 色碼 | 顏色名稱 | 應用場景 |
|------|------|----------|----------|
| **Primary** | `#00FF99` | 霓虹綠 | 狀態指示、hover 效果、重要資訊 |
| **Alert/CTA** | `#FF004D` | 警報紅 | 按鈕、警告、行動呼籲 |
| **Background** | `#000000` | 純黑 | 主要背景 |
| **Surface** | `#050505` / `#0A0A0A` | 深炭黑 | 卡片、區塊背景 |
| **Border** | `#222222` / `#333333` | 邊框灰 | 分隔線、邊框 |
| **Text Primary** | `#EAEAEA` | 淺灰白 | 主要文字 |
| **Text Secondary** | `#666666` / `#555555` | 中灰 | 次要文字、說明 |
| **Blue Accent** | `#3B82F6` (blue-500) | 藍色 | Agency 區塊 |

### 外星人角色色彩

| 角色 | 色碼 | 名稱 |
|------|------|------|
| COMMANDER (Crab) | `#a855f7` | 紫色 |
| INVADER (Squid) | `#22d3ee` | 青色 |
| DROID (Octopus) | `#facc15` | 黃色 |
| MOTHERSHIP (UFO) | `#ef4444` | 紅色 |
| SCOUT (Green) | `#22c55e` | 綠色 |
| TROPHY | `#facc15` | 金色 |

---

## 🔤 字體系統

### 字體家族

| 字體 | CSS Class | 用途 | 範例 |
|------|-----------|------|------|
| **JetBrains Mono** | `.font-code` | 程式碼、終端機文字、狀態列 | `SYSTEM OPTIMAL` |
| **Chakra Petch** | `.font-tech` | 標題、大型文字 | `INNOVATION FRONTIER` |
| **Noto Sans TC** | `.font-zh` | 中文內容 | 品牌策略說明 |
| **Press Start 2P** | `.font-retro` | 復古遊戲風格 | 遊戲 UI、得分 |
| **Rajdhani** | `.font-tech` (alternate) | 科技感標題 | 遊戲關卡標題 |

### 字體大小規範

```css
/* 標題 */
.text-4xl  /* 主標題 36px */
.text-2xl  /* 次標題 24px */

/* 內文 */
.text-sm   /* 內文 14px */
.text-xs   /* 小字/標籤 12px */

/* 特殊 */
.text-[10px]  /* 極小字/狀態碼 */
```

---

## 🎭 視覺元素

### 1. 背景效果

#### 網格背景 (Blueprint Grid)
```css
.bg-grid-pattern {
  background-size: 40px 40px;
  background-image:
    linear-gradient(to right, var(--c-grid) 1px, transparent 1px),
    linear-gradient(to bottom, var(--c-grid) 1px, transparent 1px);
}
```

#### 掃描線效果 (Scanline)
```css
.scanline {
  background: linear-gradient(
    to bottom, 
    rgba(255,255,255,0), 
    rgba(255,255,255,0) 50%, 
    rgba(0,0,0,0.2) 50%, 
    rgba(0,0,0,0.2)
  );
  background-size: 100% 4px;
}
```

### 2. 邊框與角落裝飾

```jsx
{/* Corner decorations - 軍事風格角落標記 */}
<div className="absolute top-0 left-0 w-2 h-2 border-l border-t border-[#555]" />
<div className="absolute top-0 right-0 w-2 h-2 border-r border-t border-[#555]" />
<div className="absolute bottom-0 left-0 w-2 h-2 border-l border-b border-[#555]" />
<div className="absolute bottom-0 right-0 w-2 h-2 border-r border-b border-[#555]" />
```

### 3. 狀態指示器

```jsx
{/* 線上狀態 */}
<span className="animate-pulse text-[#00FF99]">● SYSTEM OPTIMAL</span>

{/* 標籤 Badge */}
<span className="text-[10px] bg-[#00FF99] text-black px-1">ONLINE</span>
```

---

## ✨ 動畫效果

### 1. 慢速旋轉
```css
@keyframes spin-slow {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
.animate-spin-slow {
  animation: spin-slow 20s linear infinite;
}
```

### 2. CRT 閃爍效果
```css
@keyframes flicker {
  0% { opacity: 0.97; }
  50% { opacity: 1; }
  100% { opacity: 0.98; }
}
.crt-flicker {
  animation: flicker 0.15s infinite;
}
```

### 3. RGB 故障效果 (Glitch)
```css
.rgb-flash {
  filter:
    drop-shadow(-3px 0 rgba(255, 0, 0, 0.7))
    drop-shadow(3px 0 rgba(0, 255, 255, 0.7));
  animation: rgb-jitter 0.5s steps(2, end);
}
```

### 4. 打字機游標
```css
.typing-cursor::after {
  content: '|';
  animation: blink 1s step-start infinite;
}
@keyframes blink { 50% { opacity: 0; } }
```

### 5. 3D Y 軸旋轉 (徽章)
```css
@keyframes rotateY {
  0% { transform: rotateY(0deg); }
  100% { transform: rotateY(360deg); }
}
.animate-spin-y {
  animation: rotateY 4s linear infinite;
}
```

---

## 🖼️ UI 元件模式

### 1. 終端機按鈕

```jsx
{/* 主要按鈕 */}
<button className="
  text-[#FF004D] text-xs 
  border border-[#FF004D]/30 
  px-4 py-2 
  hover:bg-[#FF004D] hover:text-black 
  transition-colors
">
  ENTER_NODE
</button>

{/* 次要按鈕 */}
<button className="
  text-blue-500 text-xs 
  border border-blue-500/30 
  px-4 py-2 
  hover:bg-blue-500 hover:text-white 
  transition-colors
">
  ACCESS_DOCS
</button>
```

### 2. 數據列表

```jsx
<div className="font-mono text-xs text-gray-500 space-y-4">
  <div className="flex justify-between border-b border-[#222] pb-2">
    <span>UPTIME_GUARANTEE</span>
    <span className="text-white">99.99%</span>
  </div>
  <div className="flex justify-between border-b border-[#222] pb-2">
    <span>TOKEN_GATE</span>
    <span className="text-[#00FF99]">ENABLED</span>
  </div>
</div>
```

### 3. 區塊標題

```jsx
{/* 區塊編號 + 副標題 */}
<h3 className="text-[#FF004D] font-mono text-xs mb-2 tracking-widest">
  [ SECTOR_B: WEB3 ]
</h3>
<h2 className="text-4xl text-white" style={{ fontFamily: "'Chakra Petch', sans-serif" }}>
  INNOVATION<br/>FRONTIER
</h2>
```

### 4. 卡片元件

```jsx
<div className="bg-[#0A0A0A] border border-[#222] p-8 relative group">
  {/* Corner markers */}
  <div className="absolute top-0 left-0 w-2 h-2 border-l border-t border-[#555]" />
  {/* ... 其他角落 */}
  
  {/* Icon */}
  <div className="bg-[#111] border border-[#333] p-2">
    <Activity className="text-[#00FF99] w-6 h-6" />
  </div>
  
  {/* Status badge */}
  <span className="font-mono text-[10px] bg-[#00FF99] text-black px-1">ONLINE</span>
</div>
```

---

## 🕹️ 遊戲視覺系統

### Pixel Art 外星人

- **尺寸**：11x8 像素矩陣
- **風格**：經典 Space Invaders 致敬
- **動畫**：2 幀循環動畫
- **3D 轉換**：支援 Three.js 方塊渲染

### 子彈類型視覺

| 類型 | 顏色 | 特效 |
|------|------|------|
| FIRE | 紅/黃 `#FF0000` `#FFFF00` | 火焰爆炸 |
| VIRUS | 綠色 `#22c55e` | 毒霧擴散 |
| WIND | 藍色 `#00FFFF` | 風暴漩渦 |
| GOLD | 金色 `#eab308` | 星光閃爍 |

---

## 📱 響應式設計

### 斷點

```css
/* Tailwind 預設斷點 */
sm: 640px   /* 手機橫向 */
md: 768px   /* 平板 */
lg: 1024px  /* 桌機 */
xl: 1280px  /* 大螢幕 */
```

### 導航列響應式

```jsx
{/* 桌面：完整狀態列 */}
<div className="hidden md:flex">
  STATUS BAR CONTENT
</div>

{/* 手機：簡化選單 */}
<button className="md:hidden">
  MENU
</button>
```

---

## 🎯 設計原則總結

### DO ✅

1. **使用深色背景** - 純黑 `#000` 或深炭黑 `#050505`
2. **霓虹強調色** - `#00FF99` 用於正面狀態，`#FF004D` 用於行動呼籲
3. **等寬字體** - 終端機風格使用 JetBrains Mono
4. **細邊框** - 1px `#222` 邊框營造模組感
5. **角落裝飾** - 軍事/科技感的角落標記
6. **掃描線覆蓋** - 營造 CRT 螢幕質感
7. **全大寫英文** - 系統訊息、標籤使用全大寫 + 底線分隔

### DON'T ❌

1. 避免使用純白背景
2. 避免圓角過大（保持銳利邊緣）
3. 避免過多漸層（保持扁平）
4. 避免使用非等寬字體顯示數據
5. 避免彩色背景（除非特殊強調）

---

## 🔗 相關資源

| 資源 | 路徑 |
|------|------|
| 全域樣式 | `src/app/globals.css` |
| Tailwind 配置 | `tailwind.config.js` |
| 遊戲主元件 | `src/components/game-v3/GameV3Hero.jsx` |
| 外星人定義 | `src/data/alienDefinitions.js` |
| 3D 編輯器 | `src/app/alien-studio/page.jsx` |

---

## 📸 風格參考

### 靈感來源

1. **Cyberpunk 2077** - 霓虹色彩 + 故障美學
2. **Space Invaders** - 經典像素外星人
3. **軍事終端機** - 綠色螢幕、數據儀表板
4. **Blade Runner** - 雨夜霓虹、科幻都市

### 類似風格關鍵字

- Cyberpunk UI
- Terminal Dashboard
- HUD Interface
- Retro Gaming
- Glitch Art
- Neon Aesthetic

---

*Generated by FAW Creative Studio Analysis System*
