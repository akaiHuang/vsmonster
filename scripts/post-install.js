#!/usr/bin/env node
/**
 * VSMONSTER 👾 Post-Install Script
 * 
 * 1. 顯示歡迎訊息
 * 2. 檢查並安裝 moltbot
 * 3. 引導用戶進行設定
 */

const { execSync, spawn } = require('child_process');
const readline = require('readline');

// ANSI 顏色
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

const c = colors;

function printBanner() {
  console.log(`
${c.magenta}${c.bright}
  ██╗   ██╗███████╗███╗   ███╗ ██████╗ ███╗   ██╗███████╗████████╗███████╗██████╗ 
  ██║   ██║██╔════╝████╗ ████║██╔═══██╗████╗  ██║██╔════╝╚══██╔══╝██╔════╝██╔══██╗
  ██║   ██║███████╗██╔████╔██║██║   ██║██╔██╗ ██║███████╗   ██║   █████╗  ██████╔╝
  ╚██╗ ██╔╝╚════██║██║╚██╔╝██║██║   ██║██║╚██╗██║╚════██║   ██║   ██╔══╝  ██╔══██╗
   ╚████╔╝ ███████║██║ ╚═╝ ██║╚██████╔╝██║ ╚████║███████║   ██║   ███████╗██║  ██║
    ╚═══╝  ╚══════╝╚═╝     ╚═╝ ╚═════╝ ╚═╝  ╚═══╝╚══════╝   ╚═╝   ╚══════╝╚═╝  ╚═╝
${c.reset}
  ${c.bright}👾 VSMONSTER${c.reset} - 將社群軟體連接到 VS Code Copilot
  
  ${c.cyan}Powered by 🦞 Moltbot${c.reset} - https://github.com/moltbot/moltbot
  ${c.yellow}感謝 Moltbot 團隊的開源貢獻！${c.reset}
`);
}

function checkMoltbot() {
  try {
    const version = execSync('moltbot --version', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    return { installed: true, version };
  } catch {
    return { installed: false };
  }
}

async function installMoltbot() {
  console.log(`\n${c.yellow}📦 正在安裝 Moltbot...${c.reset}\n`);
  
  return new Promise((resolve, reject) => {
    const install = spawn('npm', ['install', '-g', 'moltbot@latest'], {
      stdio: 'inherit',
      shell: true
    });
    
    install.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Installation failed with code ${code}`));
      }
    });
  });
}

async function askQuestion(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase().trim());
    });
  });
}

async function main() {
  printBanner();

  // 檢查 moltbot
  console.log(`${c.cyan}🔍 檢查 Moltbot 安裝狀態...${c.reset}`);
  const moltbotStatus = checkMoltbot();

  if (moltbotStatus.installed) {
    console.log(`${c.green}✅ Moltbot 已安裝 (${moltbotStatus.version})${c.reset}`);
  } else {
    console.log(`${c.yellow}⚠️  Moltbot 尚未安裝${c.reset}`);
    
    // 在 CI 環境中跳過互動式安裝
    if (process.env.CI || process.env.VSMONSTER_SKIP_MOLTBOT) {
      console.log(`${c.yellow}   跳過自動安裝（CI 環境）${c.reset}`);
    } else {
      try {
        await installMoltbot();
        console.log(`${c.green}✅ Moltbot 安裝完成！${c.reset}`);
      } catch (error) {
        console.log(`${c.yellow}⚠️  自動安裝失敗，請手動執行: npm install -g moltbot@latest${c.reset}`);
      }
    }
  }

  // 顯示下一步
  console.log(`
${c.bright}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}

${c.green}${c.bright}🎉 VSMONSTER 安裝完成！${c.reset}

${c.bright}下一步：${c.reset}

  ${c.cyan}1.${c.reset} 設定社群軟體（LINE/Telegram/Discord）：
     ${c.yellow}moltbot onboard${c.reset}

  ${c.cyan}2.${c.reset} 啟動 VSMONSTER：
     ${c.yellow}pnpm dev${c.reset}

  ${c.cyan}3.${c.reset} 在 VS Code 中安裝擴展：
     按 ${c.yellow}Cmd+Shift+P${c.reset} → 輸入 "VSMONSTER"

${c.bright}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}

${c.magenta}👾 VSMONSTER${c.reset} + ${c.cyan}🦞 Moltbot${c.reset} = ${c.green}❤️${c.reset}

${c.bright}文件：${c.reset} https://github.com/your-username/vsmonster
${c.bright}Moltbot：${c.reset} https://github.com/moltbot/moltbot

`);
}

// 執行
main().catch(console.error);
