# UFO Control Center 架構草案

> 狀態：草案

## 角色定位
- UFO：任務討論與規格生成、等待區管理、交接 BlueMonster
- BlueMonster：接手後的規格優化、拆件、實作與整合

## 主要流程
1. 訊息進入 UFO
2. UFO 與使用者討論需求
3. 產出任務規格書，寫入 `UFO/tasks/pending`
4. 使用者確認後移入 `UFO/tasks/approved`
5. 交接給 BlueMonster，產出開發規格與拆件說明
6. 依序經過多模型開發與整合流程
7. 完成後移入 `UFO/tasks/done`，必要時更新 `UFO/tools.md`

## 檔案化狀態機
- pending：待確認的任務規格書
- approved：已確認，等待 BlueMonster 接手
- in-progress：BlueMonster 開發中
- done：完成與歸檔

## 交接契約（摘要）
- 交接輸入為任務規格書 + 已確認狀態
- 接手前必須先讀文件與既有工具區
- 接手後產出開發規格、拆件清單與組裝說明

## 待擴充
- Gateway 路由至 UFO
- Mission Control 顯示 UFO 任務狀態
- 工具區自動引用與版本管理
