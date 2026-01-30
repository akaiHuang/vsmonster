import { defineConfig, devices } from '@playwright/test';

/**
 * VSMONSTER Mission Control E2E Test Configuration
 * 
 * 功能：
 * - 自動截圖（失敗時）
 * - 影片錄製（可選）
 * - 多瀏覽器測試
 * - HTML 報告生成
 */
export default defineConfig({
  testDir: './tests/e2e',
  
  /* 測試超時 */
  timeout: 30 * 1000,
  expect: {
    timeout: 5000
  },

  /* 完整報告 */
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,

  /* 報告器 */
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['json', { outputFile: 'test-results/results.json' }],
    ['list']
  ],

  /* 全域設定 */
  use: {
    /* Base URL */
    baseURL: 'http://localhost:3001',

    /* 截圖設定 */
    screenshot: {
      mode: 'only-on-failure',
      fullPage: true
    },

    /* 影片錄製 - CI 環境開啟 */
    video: process.env.PLAYWRIGHT_VIDEO === 'on' ? 'on' : 'retain-on-failure',

    /* Trace 檔案 - 用於調試 */
    trace: 'retain-on-failure',

    /* 其他 */
    actionTimeout: 10000,
    navigationTimeout: 15000,
  },

  /* 測試專案 */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },

    /* 行動裝置測試 */
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] },
    },
  ],

  /* 啟動開發伺服器 */
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3001',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },

  /* 輸出目錄 */
  outputDir: 'test-results/',
});
