#!/usr/bin/env node
/**
 * VSMONSTER Post-Install Script
 * 
 * 1. Language selection (English/中文)
 * 2. Display welcome message
 * 3. Check and install moltbot
 * 4. Guide user through setup
 */

const { execSync, spawn } = require('child_process');
const readline = require('readline');
const fs = require('fs');
const path = require('path');

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  monsterBlue: '\x1b[38;2;28;75;180m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

const c = colors;

// Internationalization strings
const i18n = {
  en: {
    subtitle: 'Connect messaging platforms to VS Code Copilot',
    inspired: 'Inspired by 🦞 Moltbot',
    thanks: 'Thanks to the Moltbot team for their open source contribution!',
    checkingMoltbot: '🔍 Checking Moltbot installation...',
    moltbotInstalled: '✅ Moltbot installed',
    moltbotNotInstalled: '⚠️  Moltbot not installed',
    skipCi: '   Skipping auto-install (CI environment)',
    installing: '📦 Installing Moltbot...',
    installSuccess: '✅ Moltbot installation complete!',
    installFailed: '⚠️  Auto-install failed, please run manually: npm install -g moltbot@latest',
    complete: '🎉 VSMONSTER installation complete!',
    nextSteps: 'Next Steps:',
    step1: 'Set up messaging platform (LINE/Telegram/Discord):',
    step2: 'Start VSMONSTER:',
    step3: 'Install VS Code extension:',
    step3detail: 'Press',
    step3detail2: '→ Type "VSMONSTER"',
    docs: 'Documentation:',
    moltbot: 'Moltbot:',
    selectLang: '🌐 Select language / 選擇語言:',
    langOption1: '  [1] English',
    langOption2: '  [2] 中文',
    langPrompt: 'Enter 1 or 2 (default: 1): ',
  },
  'zh-TW': {
    subtitle: '將社群軟體連接到 VS Code Copilot',
    inspired: 'Inspired by 🦞 Moltbot',
    thanks: '感謝 Moltbot 團隊的開源貢獻！',
    checkingMoltbot: '🔍 檢查 Moltbot 安裝狀態...',
    moltbotInstalled: '✅ Moltbot 已安裝',
    moltbotNotInstalled: '⚠️  Moltbot 尚未安裝',
    skipCi: '   跳過自動安裝（CI 環境）',
    installing: '📦 正在安裝 Moltbot...',
    installSuccess: '✅ Moltbot 安裝完成！',
    installFailed: '⚠️  自動安裝失敗，請手動執行: npm install -g moltbot@latest',
    complete: '🎉 VSMONSTER 安裝完成！',
    nextSteps: '下一步：',
    step1: '設定社群軟體（LINE/Telegram/Discord）：',
    step2: '啟動 VSMONSTER：',
    step3: '在 VS Code 中安裝擴展：',
    step3detail: '按',
    step3detail2: '→ 輸入 "VSMONSTER"',
    docs: '文件：',
    moltbot: 'Moltbot：',
    selectLang: '🌐 Select language / 選擇語言:',
    langOption1: '  [1] English',
    langOption2: '  [2] 中文',
    langPrompt: 'Enter 1 or 2 (default: 1): ',
    setupMediaCdn: '⚙️  媒體 CDN 設定（用於安全共享照片）：',
    mediaStep1: '   1. 在 Cloudflare 創建獨立隧道用於媒體',
    mediaStep2: '   2. 配置 VSMONSTER_MEDIA_URL 到 .env',
    mediaStep3: '   📖 詳細步驟：docs/MEDIA-CDN-SETUP.md',
  }
};

let currentLang = 'en';
let t = i18n.en;

function printBanner() {
  console.log(`
${c.monsterBlue}${c.bright}
  ██╗   ██╗███████╗███╗   ███╗ ██████╗ ███╗   ██╗███████╗████████╗███████╗██████╗ 
  ██║   ██║██╔════╝████╗ ████║██╔═══██╗████╗  ██║██╔════╝╚══██╔══╝██╔════╝██╔══██╗
  ██║   ██║███████╗██╔████╔██║██║   ██║██╔██╗ ██║███████╗   ██║   █████╗  ██████╔╝
  ╚██╗ ██╔╝╚════██║██║╚██╔╝██║██║   ██║██║╚██╗██║╚════██║   ██║   ██╔══╝  ██╔══██╗
   ╚████╔╝ ███████║██║ ╚═╝ ██║╚██████╔╝██║ ╚████║███████║   ██║   ███████╗██║  ██║
    ╚═══╝  ╚══════╝╚═╝     ╚═╝ ╚═════╝ ╚═╝  ╚═══╝╚══════╝   ╚═╝   ╚══════╝╚═╝  ╚═╝
${c.reset}
  ${c.bright}VSMONSTER${c.reset} - ${t.subtitle}
  
  ${c.cyan}${t.inspired}${c.reset} - https://github.com/moltbot/moltbot
  ${c.yellow}${t.thanks}${c.reset}
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

function checkNgrok() {
  try {
    const version = execSync('ngrok --version', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    return { installed: true, version };
  } catch {
    return { installed: false };
  }
}

function checkCloudflared() {
  try {
    const version = execSync('cloudflared --version', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    return { installed: true, version };
  } catch {
    return { installed: false };
  }
}

async function installMoltbot() {
  console.log(`\n${c.yellow}${t.installing}${c.reset}\n`);
  
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

async function installCloudflared() {
  console.log(`\n${c.yellow}📦 正在安裝 cloudflared...${c.reset}\n`);
  
  const isAppleSilicon = execSync('uname -m', { encoding: 'utf8' }).trim() === 'arm64';
  const isMac = execSync('uname', { encoding: 'utf8' }).trim() === 'Darwin';
  
  return new Promise((resolve, reject) => {
    let command, args;
    
    if (isMac) {
      command = 'brew';
      args = ['install', 'cloudflare/cloudflare/cloudflared'];
    } else {
      // Linux
      command = 'curl';
      args = ['-L', 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb', '-o', '/tmp/cloudflared.deb'];
    }
    
    const install = spawn(command, args, {
      stdio: 'inherit',
      shell: true
    });
    
    install.on('close', (code) => {
      if (code === 0) {
        if (!isMac) {
          // Install deb on Linux
          try {
            execSync('sudo dpkg -i /tmp/cloudflared.deb', { stdio: 'inherit' });
          } catch (e) {
            reject(e);
            return;
          }
        }
        resolve();
      } else {
        reject(new Error(`Installation failed with code ${code}`));
      }
    });
  });
}

async function installNgrok() {
  console.log(`\n${c.yellow}📦 正在安裝 ngrok...${c.reset}\n`);
  
  const isMac = execSync('uname', { encoding: 'utf8' }).trim() === 'Darwin';
  
  return new Promise((resolve, reject) => {
    const command = isMac ? 'brew' : 'snap';
    const args = isMac ? ['install', 'ngrok'] : ['install', 'ngrok'];
    
    const install = spawn(command, args, {
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

async function selectLanguage() {
  // Check if language is set via environment variable
  if (process.env.VSMONSTER_LANG) {
    const lang = process.env.VSMONSTER_LANG.toLowerCase();
    if (lang === 'zh' || lang === 'zh-tw' || lang === 'chinese') {
      return 'zh-TW';
    }
    return 'en';
  }

  if (process.env.VSMONSTER_LANG_CHOICE) {
    const choice = process.env.VSMONSTER_LANG_CHOICE.trim();
    if (choice === '2') {
      return 'zh-TW';
    }
    if (choice === '1') {
      return 'en';
    }
  }

  // If stdin is not a TTY, fall back to saved preference or English.
  if (!process.stdin.isTTY) {
    try {
      const configPath = path.join(__dirname, '..', '.vsmonster-config.json');
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        if (config.language === 'zh-TW') {
          return 'zh-TW';
        }
      }
    } catch {
      // ignore
    }
    return 'en';
  }

  // In CI environment, default to English
  if (process.env.CI) {
    return 'en';
  }

  console.log(`
${c.bright}${i18n.en.selectLang}${c.reset}
${i18n.en.langOption1}
${i18n.en.langOption2}
`);

  const answer = await askQuestion(`${c.cyan}${i18n.en.langPrompt}${c.reset}`);
  
  if (answer === '2' || answer === 'zh' || answer === '中文') {
    return 'zh-TW';
  }
  return 'en';
}

// Save language preference
function saveLanguagePreference(lang) {
  try {
    const configPath = path.join(__dirname, '..', '.vsmonster-config.json');
    let config = {};
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
    config.language = lang;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  } catch (e) {
    // Ignore errors
  }
}

async function main() {
  // Select language first
  currentLang = await selectLanguage();
  t = i18n[currentLang];
  saveLanguagePreference(currentLang);
  
  console.log(''); // Add spacing
  printBanner();

  // Check moltbot
  console.log(`${c.cyan}${t.checkingMoltbot}${c.reset}`);
  const moltbotStatus = checkMoltbot();

  if (moltbotStatus.installed) {
    console.log(`${c.green}${t.moltbotInstalled} (${moltbotStatus.version})${c.reset}`);
  } else {
    console.log(`${c.yellow}${t.moltbotNotInstalled}${c.reset}`);
    
    // Skip interactive install in CI environment
    if (process.env.CI || process.env.VSMONSTER_SKIP_MOLTBOT) {
      console.log(`${c.yellow}${t.skipCi}${c.reset}`);
    } else {
      try {
        await installMoltbot();
        console.log(`${c.green}${t.installSuccess}${c.reset}`);
      } catch (error) {
        console.log(`${c.yellow}${t.installFailed}${c.reset}`);
      }
    }
  }

  // Check tunnel tools (ngrok & cloudflared)
  console.log(`\n${c.cyan}🚇 檢查隧道工具...${c.reset}`);
  
  const ngrokStatus = checkNgrok();
  const cloudflaredStatus = checkCloudflared();
  
  if (ngrokStatus.installed) {
    console.log(`${c.green}✅ ngrok 已安裝${c.reset}`);
  } else {
    console.log(`${c.yellow}⚠️  ngrok 未安裝 - 開發測試用${c.reset}`);
    
    if (!process.env.CI && !process.env.VSMONSTER_SKIP_TUNNEL_TOOLS) {
      try {
        await installNgrok();
        console.log(`${c.green}✅ ngrok 安裝完成！${c.reset}`);
      } catch (error) {
        console.log(`${c.yellow}⚠️  ngrok 安裝失敗，請手動執行: brew install ngrok${c.reset}`);
      }
    }
  }
  
  if (cloudflaredStatus.installed) {
    console.log(`${c.green}✅ cloudflared 已安裝${c.reset}`);
  } else {
    console.log(`${c.yellow}⚠️  cloudflared 未安裝 - 正式環境用${c.reset}`);
    
    if (!process.env.CI && !process.env.VSMONSTER_SKIP_TUNNEL_TOOLS) {
      try {
        await installCloudflared();
        console.log(`${c.green}✅ cloudflared 安裝完成！${c.reset}`);
      } catch (error) {
        console.log(`${c.yellow}⚠️  cloudflared 安裝失敗，請手動執行: brew install cloudflare/cloudflare/cloudflared${c.reset}`);
      }
    }
  }

  // Show next steps
  console.log(`
${c.bright}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}

${c.green}${c.bright}${t.complete}${c.reset}

${c.bright}${t.nextSteps}${c.reset}

  ${c.cyan}1.${c.reset} ${t.step1}
     ${c.yellow}moltbot onboard${c.reset}

  ${c.cyan}2.${c.reset} ${t.setupMediaCdn}
     ${t.mediaStep1}
     ${t.mediaStep2}
     ${t.mediaStep3}

  ${c.cyan}3.${c.reset} ${t.step2}
     ${c.yellow}pnpm dev${c.reset}

  ${c.cyan}4.${c.reset} ${t.step3}
     ${t.step3detail} ${c.yellow}Cmd+Shift+P${c.reset} ${t.step3detail2}

${c.bright}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}

${c.monsterBlue}VSMONSTER${c.reset} + ${c.cyan}🦞 Moltbot${c.reset} = ${c.green}❤️${c.reset}

${c.bright}${t.docs}${c.reset} https://github.com/akaiHuang/vsmonster
${c.bright}${t.moltbot}${c.reset} https://github.com/moltbot/moltbot

`);
}

// 執行
main().catch(console.error);
