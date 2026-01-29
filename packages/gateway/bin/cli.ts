#!/usr/bin/env node

/**
 * vsMolt CLI
 * 命令列工具
 */

import { Command } from 'commander';
import { VsMoltGateway } from '../src/server';
import { loadConfig, validateConfig } from '../src/config/loader';
import { logger } from '../src/utils/logger';

const program = new Command();

program
  .name('vsmolt')
  .description('vsMolt - 將社群軟體連接到 VS Code Copilot')
  .version('0.0.1');

// 啟動 Gateway
program
  .command('start')
  .description('啟動 vsMolt Gateway')
  .option('-p, --port <port>', '監聽端口', '3000')
  .option('-v, --verbose', '詳細日誌')
  .action(async (options) => {
    if (options.verbose) {
      logger.setLevel('debug');
    }

    const config = loadConfig();
    const errors = validateConfig(config);

    if (errors.length > 0) {
      console.error('配置錯誤:');
      errors.forEach(err => console.error(`  - ${err}`));
      process.exit(1);
    }

    if (options.port) {
      config.port = parseInt(options.port, 10);
    }

    const gateway = new VsMoltGateway();
    await gateway.start();
  });

// 初始化配置
program
  .command('init')
  .description('初始化 vsMolt 配置')
  .action(async () => {
    console.log('🚀 vsMolt 初始化精靈');
    console.log('');
    console.log('請按照以下步驟設定:');
    console.log('1. 複製 configs/config.example.json 到 configs/config.json');
    console.log('2. 填入你的頻道憑證 (LINE, Telegram 等)');
    console.log('3. 執行 vsmolt start 啟動服務');
    console.log('');
    console.log('詳細設定指南:');
    console.log('  LINE: docs/setup-line.md');
    console.log('  Telegram: docs/setup-telegram.md');
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
    console.log('🏥 vsMolt 健康檢查');
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
