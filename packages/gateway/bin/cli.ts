#!/usr/bin/env node

/**
 * VSMONSTER CLI
 * 命令列工具
 */

import { Command } from 'commander';
import { VSMONSTERGateway } from '../src/server';
import { loadConfig, validateConfig } from '../src/config/loader';
import { SetupWizard } from '../src/setup/wizard';
import { logger } from '../src/utils/logger';

const program = new Command();

program
  .name('vsmonster')
  .description('VSMONSTER - 將社群軟體連接到 VS Code Copilot')
  .version('0.0.1');

// 啟動 Gateway
program
  .command('start')
  .description('啟動 VSMONSTER Gateway')
  .option('-p, --port <port>', '監聽端口', '3000')
  .option('-v, --verbose', '詳細日誌')
  .option('--skip-setup', '跳過首次設定檢查')
  .action(async (options) => {
    if (options.verbose) {
      logger.setLevel('debug');
    }

    // 檢查是否首次啟動（未設定）
    if (!options.skipSetup && !SetupWizard.isConfigured()) {
      console.log('🆕 偵測到首次啟動，將執行設定向導...\n');
      const wizard = new SetupWizard();
      const result = await wizard.run();
      
      if (!result.success) {
        console.error('\n設定失敗，請重新執行 vsmonster init');
        process.exit(1);
      }
      
      console.log('\n設定完成！正在啟動 Gateway...\n');
    }

    const config = loadConfig();
    const errors = validateConfig(config);

    if (errors.length > 0) {
      console.error('配置錯誤:');
      errors.forEach(err => console.error(`  - ${err}`));
      console.error('\n請執行 vsmonster init 重新設定');
      process.exit(1);
    }

    if (options.port) {
      config.port = parseInt(options.port, 10);
    }

    const gateway = new VSMONSTERGateway();
    await gateway.start();
  });

// 初始化配置 (互動式設定向導)
program
  .command('init')
  .description('初始化 VSMONSTER 配置（互動式設定向導）')
  .option('--skip-vscode', '跳過 VS Code 檢查')
  .option('--skip-channel', '跳過頻道設定')
  .option('--force', '強制重新設定')
  .action(async (options) => {
    // 檢查是否已設定
    if (!options.force && SetupWizard.isConfigured()) {
      console.log('📋 VSMONSTER 已經設定過了');
      console.log('');
      console.log('如果要重新設定，請使用 --force 選項:');
      console.log('  vsmonster init --force');
      console.log('');
      console.log('或者直接編輯配置檔:');
      console.log('  configs/config.json');
      return;
    }

    const wizard = new SetupWizard();
    await wizard.run({
      skipVscode: options.skipVscode,
      skipChannel: options.skipChannel,
    });
  });

// 添加頻道
program
  .command('channel')
  .description('管理社群頻道')
  .argument('<action>', '操作: add, remove, list')
  .argument('[name]', '頻道名稱')
  .action((action, name) => {
    switch (action) {
      case 'list':
        const config = loadConfig();
        console.log('已配置的頻道:');
        Object.entries(config.channels).forEach(([channel, cfg]) => {
          if (cfg) {
            console.log(`  - ${channel}: ✓`);
          }
        });
        break;
      case 'add':
        console.log(`請參考 docs/setup-${name}.md 設定 ${name} 頻道`);
        break;
      case 'remove':
        console.log(`請編輯 configs/config.json 移除 ${name} 配置`);
        break;
      default:
        console.error(`未知操作: ${action}`);
    }
  });

// 檢查配置
program
  .command('doctor')
  .description('檢查配置和連線狀態')
  .action(() => {
    console.log('🏥 VSMONSTER 健康檢查');
    console.log('');

    const config = loadConfig();
    const errors = validateConfig(config);

    if (errors.length === 0) {
      console.log('✓ 配置檔案正確');
    } else {
      console.log('✗ 配置問題:');
      errors.forEach(err => console.log(`  - ${err}`));
    }

    // 檢查各頻道
    console.log('');
    console.log('頻道狀態:');
    
    if (config.channels.line) {
      console.log('  LINE: ✓ 已配置');
    } else {
      console.log('  LINE: - 未配置');
    }

    if (config.channels.telegram) {
      console.log('  Telegram: ✓ 已配置');
    } else {
      console.log('  Telegram: - 未配置');
    }

    if (config.channels.discord) {
      console.log('  Discord: ✓ 已配置');
    } else {
      console.log('  Discord: - 未配置');
    }

    // 檢查 ngrok
    console.log('');
    if (config.tunnel?.enabled) {
      console.log('Tunnel: ✓ ngrok 已啟用');
    } else {
      console.log('Tunnel: - ngrok 未啟用');
    }
  });

program.parse();
