import fs from 'fs';
import path from 'path';
import { ChannelsConfig } from '../channels/base';
import { TunnelConfig } from '../tunnel/service';
import { MCPConfig } from '../mcp/controller';

export interface VSMONSTERConfig {
  port: number;
  channels: ChannelsConfig;
  tunnel?: TunnelConfig;
  mcp?: MCPConfig;
  moltbotGatewayUrl?: string;
}

const DEFAULT_CONFIG: VSMONSTERConfig = {
  port: 3000,
  channels: {},
};

/**
 * 載入配置文件
 */
export function loadConfig(): VSMONSTERConfig {
  // 嘗試多個可能的配置路徑
  const configPaths = [
    // 當前工作目錄
    path.join(process.cwd(), 'configs', 'config.json'),
    path.join(process.cwd(), 'config.json'),
    // 專案根目錄（從 packages/gateway 往上兩層）
    path.join(process.cwd(), '..', '..', 'configs', 'config.json'),
    path.join(process.cwd(), '..', '..', 'config.json'),
    // 使用 __dirname（編譯後的位置）
    path.join(__dirname, '..', '..', 'configs', 'config.json'),
    path.join(__dirname, '..', '..', '..', '..', 'configs', 'config.json'),
    // 用戶主目錄
    path.join(process.env.HOME || '', '.vsmonster', 'config.json'),
  ];

  for (const configPath of configPaths) {
    if (fs.existsSync(configPath)) {
      try {
        const content = fs.readFileSync(configPath, 'utf-8');
        const config = JSON.parse(content);
        return mergeConfig(DEFAULT_CONFIG, config);
      } catch (error) {
        console.error(`Failed to load config from ${configPath}:`, error);
      }
    }
  }

  // 嘗試從環境變數載入
  return loadConfigFromEnv();
}

/**
 * 從環境變數載入配置
 */
function loadConfigFromEnv(): VSMONSTERConfig {
  const config: VSMONSTERConfig = { ...DEFAULT_CONFIG };

  // Port
  if (process.env.VSMONSTER_PORT) {
    config.port = parseInt(process.env.VSMONSTER_PORT, 10);
  }

  // LINE
  if (process.env.LINE_CHANNEL_ACCESS_TOKEN && process.env.LINE_CHANNEL_SECRET) {
    config.channels.line = {
      channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
      channelSecret: process.env.LINE_CHANNEL_SECRET,
    };
  }

  // Telegram
  if (process.env.TELEGRAM_BOT_TOKEN) {
    config.channels.telegram = {
      botToken: process.env.TELEGRAM_BOT_TOKEN,
      webhookUrl: process.env.TELEGRAM_WEBHOOK_URL,
    };
  }

  // Discord
  if (process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_APPLICATION_ID) {
    config.channels.discord = {
      botToken: process.env.DISCORD_BOT_TOKEN,
      applicationId: process.env.DISCORD_APPLICATION_ID,
      publicKey: process.env.DISCORD_PUBLIC_KEY || undefined,
    };
  }

  // Tunnel
  if (process.env.NGROK_AUTHTOKEN) {
    config.tunnel = {
      enabled: process.env.NGROK_ENABLED !== 'false',
      authtoken: process.env.NGROK_AUTHTOKEN,
      region: (process.env.NGROK_REGION as any) || 'ap',
    };
  }

  return config;
}

/**
 * 合併配置
 */
function mergeConfig(base: VSMONSTERConfig, override: Partial<VSMONSTERConfig>): VSMONSTERConfig {
  return {
    ...base,
    ...override,
    channels: {
      ...base.channels,
      ...override.channels,
    },
    tunnel: override.tunnel ? { ...base.tunnel, ...override.tunnel } : base.tunnel,
    mcp: override.mcp ? { ...base.mcp, ...override.mcp } : base.mcp,
  };
}

/**
 * 驗證配置
 */
export function validateConfig(config: VSMONSTERConfig): string[] {
  const errors: string[] = [];

  // 至少需要一個頻道
  const hasChannels = Object.values(config.channels).some(c => c !== undefined);
  if (!hasChannels) {
    errors.push('至少需要配置一個頻道 (LINE, Telegram, Discord 等)');
  }

  // 驗證 LINE 配置
  if (config.channels.line) {
    if (!config.channels.line.channelAccessToken) {
      errors.push('LINE: 缺少 channelAccessToken');
    }
    if (!config.channels.line.channelSecret) {
      errors.push('LINE: 缺少 channelSecret');
    }
  }

  // 驗證 Telegram 配置
  if (config.channels.telegram) {
    if (!config.channels.telegram.botToken) {
      errors.push('Telegram: 缺少 botToken');
    }
  }

  // 驗證 Discord 配置
  if (config.channels.discord) {
    if (!config.channels.discord.botToken) {
      errors.push('Discord: 缺少 botToken');
    }
    if (!config.channels.discord.applicationId) {
      errors.push('Discord: 缺少 applicationId');
    }
  }

  return errors;
}
