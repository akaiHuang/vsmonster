/**
 * Holography - VSMonster 獨立通訊模組
 * 完全移除 Moltbot/Clawdbot 依賴
 */

// Core
export { HolographyServer, HolographyServerConfig } from './core/server';
export { ChannelManager, ChannelManagerConfig } from './core/manager';
export * from './core/types';

// Channels
export { HologramChannel } from './channels/base';
export { LineChannel } from './channels/line';
export { TelegramChannel } from './channels/telegram';
export { DiscordChannel } from './channels/discord';

// Security
export { WhitelistManager, WhitelistConfig } from './security/whitelist';
export { HandshakeManager, HandshakeConfig } from './security/handshake';
export { WhitelistStorage } from './security/storage';

// Transports
export { WebSocketTransport, WebSocketTransportConfig } from './transports/websocket';
export { WebhookTransport, WebhookTransportConfig, WebhookRoute } from './transports/webhook';

// Client (for VS Code Extension)
export { HolographyClient, HolographyClientConfig } from './client';

// API (UFO ↔ BlueMonster)
export * from './api/types';
export { BlueMonsterAPI, BlueMonsterAPIConfig } from './api/client';
