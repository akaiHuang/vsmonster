import { test, expect } from '@playwright/test';

/**
 * Mission Control Dashboard E2E Tests
 * 
 * 這些測試會自動：
 * - 截圖（失敗時）
 * - 錄影（CI 環境）
 * - 生成 HTML 報告
 */

test.describe('Mission Control Dashboard', () => {
  
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should load dashboard homepage', async ({ page }) => {
    // 檢查頁面標題
    await expect(page).toHaveTitle(/Monster Mission Control/);
    
    // 截圖：首頁載入成功
    await page.screenshot({ 
      path: 'test-results/screenshots/homepage-loaded.png',
      fullPage: true 
    });
  });

  test('should display Kanban board with columns', async ({ page }) => {
    // 等待 Kanban 板載入
    const kanbanBoard = page.locator('[data-testid="kanban-board"]');
    await expect(kanbanBoard).toBeVisible();

    // 檢查 5 個狀態欄
    const columns = ['Backlog', 'Planned', 'In Progress', 'Review', 'Completed'];
    for (const column of columns) {
      await expect(page.getByText(column)).toBeVisible();
    }

    // 截圖：Kanban 板
    await page.screenshot({ 
      path: 'test-results/screenshots/kanban-board.png' 
    });
  });

  test('should display stats bar with metrics', async ({ page }) => {
    // 檢查統計欄
    const statsBar = page.locator('[data-testid="stats-bar"]');
    await expect(statsBar).toBeVisible();

    // 檢查指標
    await expect(page.getByText(/Active Tasks/i)).toBeVisible();
    await expect(page.getByText(/Workers/i)).toBeVisible();
  });

  test('should open new task modal', async ({ page }) => {
    // 點擊新增任務按鈕
    const newTaskButton = page.getByRole('button', { name: /New Task/i });
    await newTaskButton.click();

    // 檢查 Modal 開啟
    const modal = page.locator('[data-testid="new-task-modal"]');
    await expect(modal).toBeVisible();

    // 截圖：新增任務 Modal
    await page.screenshot({ 
      path: 'test-results/screenshots/new-task-modal.png' 
    });
  });

  test('should create a new task', async ({ page }) => {
    // 開啟 Modal
    await page.getByRole('button', { name: /New Task/i }).click();

    // 填寫表單
    await page.fill('[data-testid="task-title"]', 'Test Task from E2E');
    await page.fill('[data-testid="task-description"]', 'This is an automated test task');
    
    // 選擇優先級
    await page.selectOption('[data-testid="task-priority"]', 'high');

    // 提交
    await page.click('[data-testid="submit-task"]');

    // 確認任務出現在 Backlog
    await expect(page.getByText('Test Task from E2E')).toBeVisible();

    // 截圖：任務創建成功
    await page.screenshot({ 
      path: 'test-results/screenshots/task-created.png' 
    });
  });

  test('should drag task between columns', async ({ page }) => {
    // 這個測試需要有任務存在
    // 先創建一個任務或使用 mock 數據
    
    const taskCard = page.locator('[data-testid="task-card"]').first();
    const targetColumn = page.locator('[data-testid="column-in-progress"]');

    // 拖放
    await taskCard.dragTo(targetColumn);

    // 截圖：拖放後
    await page.screenshot({ 
      path: 'test-results/screenshots/task-dragged.png' 
    });
  });

  test('should show worker status', async ({ page }) => {
    // 檢查 Worker 狀態指示器
    const header = page.locator('header');
    await expect(header).toBeVisible();

    // 截圖：Header with workers
    await page.screenshot({ 
      path: 'test-results/screenshots/header-workers.png' 
    });
  });

});

test.describe('Responsive Design', () => {
  
  test('should display correctly on mobile', async ({ page }) => {
    // 設置行動裝置視窗
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');

    // 截圖：行動版
    await page.screenshot({ 
      path: 'test-results/screenshots/mobile-view.png',
      fullPage: true 
    });
  });

  test('should display correctly on tablet', async ({ page }) => {
    // 設置平板視窗
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/');

    // 截圖：平板版
    await page.screenshot({ 
      path: 'test-results/screenshots/tablet-view.png',
      fullPage: true 
    });
  });

});

test.describe('Error Handling', () => {
  
  test('should show error state when gateway disconnected', async ({ page }) => {
    // 模擬 Gateway 斷線
    await page.route('**/socket.io/**', route => route.abort());
    await page.goto('/');

    // 應該顯示連線錯誤提示
    await expect(page.getByText(/Disconnected|Connecting/i)).toBeVisible();

    // 截圖：斷線狀態
    await page.screenshot({ 
      path: 'test-results/screenshots/disconnected-state.png' 
    });
  });

});
