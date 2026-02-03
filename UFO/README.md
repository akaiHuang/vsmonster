# UFO Control Center

UFO 是 VSMONSTER 的新成員，定位為任務規格生成與交接的控制中心。
它負責與使用者討論需求、產出任務規格書、管理等待區，並在確認後交接給 BlueMonster。

## 目前範圍
- 只在 `UFO/` 內開發與管理
- 以檔案為主的任務等待區與工具區
- 提供 Control Center Dashboard 與任務清單 UI

## 資料夾結構
```
UFO/
├── DEVELOPMENT-CHECKLIST.md
├── ARCHITECTURE.md
├── README.md
├── specs/
│   ├── task-spec-template.md
│   └── dev-spec-template.md
├── tasks/
│   ├── pending/
│   ├── approved/
│   ├── in-progress/
│   └── done/
├── tools.md
└── extension/
    ├── package.json
    ├── tsconfig.json
    ├── esbuild.js
    ├── resources/
    └── src/
        ├── extension.ts
        └── dashboard.ts
```

## 開發路線
1. 完成 UFO 任務等待區與規格書流程
2. 交接契約與 BlueMonster 的接手格式
3. 後續再與 Gateway 與 Mission Control 串接
