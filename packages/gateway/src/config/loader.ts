import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { ChannelsConfig } from '../channels/base';
import { TunnelConfig } from '../tunnel/service';
import { MCPConfig } from '../mcp/controller';

export interface VSMONSTERConfig {
  port: number;
  channels: ChannelsConfig;
  tunnel?: TunnelConfig;
  mcp?: MCPConfig;
  moltbotGatewayUrl?: string;
  publicUrl?: string;
  mediaUrl?: string;
}

const DEFAULT_CONFIG: VSMONSTERConfig = {
  port: 3000,
  channels: {},
};

function loadDotEnv(): void {
  const candidates = [
    path.join(process.cwd(), '.env'),
    path.join(process.cwd(), '..', '.env'),
    path.join(process.cwd(), '..', '..', '.env'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      dotenv.config({ path: candidate });
      return;
    }
  }
}

function isPlaceholder(value: string | undefined): boolean {
  if (!value) {
    return true;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return true;
  }
  const upper = trimmed.toUpperCase();
  return upper.startsWith('YOUR_') || upper === 'CHANGEME';
}

/**
 * 載入配置文件
 */
export function loadConfig(): VSMONSTERConfig {
  loadDotEnv();

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

  let fileConfig: VSMONSTERConfig | null = null;
  for (const configPath of configPaths) {
    if (fs.existsSync(configPath)) {
      try {
        const content = fs.readFileSync(configPath, 'utf-8');
        const config = JSON.parse(content);
        fileConfig = mergeConfig(DEFAULT_CONFIG, config);
        break;
      } catch (error) {
        console.error(`Failed to load config from ${configPath}:`, error);
      }
    }
  }

  if (!fileConfig) {
    fileConfig = { ...DEFAULT_CONFIG };
  }

  return applyConfigFromEnv(fileConfig);
}

/**
 * 從環境變數載入配置
 */
function applyConfigFromEnv(config: VSMONSTERConfig): VSMONSTERConfig {
  const merged: VSMONSTERConfig = {
    ...config,
    channels: { ...config.channels },
    tunnel: config.tunnel ? { ...config.tunnel } : config.tunnel,
    mcp: config.mcp ? { ...config.mcp } : config.mcp,
  };

  // Port
  if (process.env.VSMONSTER_PORT) {
    merged.port = parseInt(process.env.VSMONSTER_PORT, 10);
  }

  if (!isPlaceholder(process.env.VSMONSTER_PUBLIC_URL)) {
    merged.publicUrl = process.env.VSMONSTER_PUBLIC_URL as string;
  }

  if (!isPlaceholder(process.env.VSMONSTER_MEDIA_URL)) {
    merged.mediaUrl = process.env.VSMONSTER_MEDIA_URL as string;
  }

  // LINE
  if (!isPlaceholder(process.env.LINE_CHANNEL_ACCESS_TOKEN) && !isPlaceholder(process.env.LINE_CHANNEL_SECRET)) {
    merged.channels.line = {
      ...(merged.channels.line || {}),
      channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN as string,
      channelSecret: process.env.LINE_CHANNEL_SECRET as string,
    } as any;
  }
  if (!isPlaceholder(process.env.LINE_WEBHOOK_SECRET)) {
    merged.channels.line = {
      ...(merged.channels.line || {}),
      webhookSecret: process.env.LINE_WEBHOOK_SECRET as string,
    } as any;
  }

  // Telegram
  if (!isPlaceholder(process.env.TELEGRAM_BOT_TOKEN)) {
    merged.channels.telegram = {
      ...(merged.channels.telegram || {}),
      botToken: process.env.TELEGRAM_BOT_TOKEN as string,
      webhookUrl: process.env.TELEGRAM_WEBHOOK_URL,
    };
  }

  // Discord
  if (
    !isPlaceholder(process.env.DISCORD_BOT_TOKEN) &&
    !isPlaceholder(process.env.DISCORD_APPLICATION_ID)
  ) {
    merged.channels.discord = {
      ...(merged.channels.discord || {}),
      botToken: process.env.DISCORD_BOT_TOKEN as string,
      applicationId: process.env.DISCORD_APPLICATION_ID as string,
      publicKey: process.env.DISCORD_PUBLIC_KEY || '',
    };
  }

  // Tunnel
  if (process.env.NGROK_AUTHTOKEN) {
    merged.tunnel = {
      ...(merged.tunnel || {}),
      enabled: process.env.NGROK_ENABLED !== 'false',
      authtoken: process.env.NGROK_AUTHTOKEN,
      region: (process.env.NGROK_REGION as any) || 'ap',
    };
  }

  return merged;
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
