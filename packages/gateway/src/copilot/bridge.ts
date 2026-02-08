// TODO: Implement actual Copilot WebSocket bridge
import { logger } from '../utils/logger';

/**
 * Copilot 橋接器 (Gateway 端)
 * 負責將指令傳送到 VS Code Extension
 */
export class CopilotBridge {
  private connected: boolean = false;
  private conversations: Map<string, Array<{ role: 'user' | 'assistant'; content: string }>> = new Map();

  constructor() {
    logger.info('CopilotBridge initialized');
  }

  /**
   * 檢查是否已連接到 VS Code
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * 設定連接狀態
   */
  setConnected(connected: boolean): void {
    this.connected = connected;
    logger.info(`Copilot connection status: ${connected ? 'connected' : 'disconnected'}`);
  }

  /**
   * Send a chat message to Copilot (placeholder implementation).
   */
  async chat(message: string, conversationId: string = 'default'): Promise<string> {
    const history = this.conversations.get(conversationId) || [];
    history.push({ role: 'user', content: message });

    let response = 'Copilot is not connected.';
    if (this.connected) {
      response = 'Message forwarded to Copilot (placeholder).';
    }

    history.push({ role: 'assistant', content: response });
    this.conversations.set(conversationId, history);
    return response;
  }

  /**
   * Get conversation history for Web UI.
   */
  getConversationHistory(conversationId: string): Array<{ role: 'user' | 'assistant'; content: string }> {
    return this.conversations.get(conversationId) || [];
  }

  /**
   * Clear a conversation.
   */
  clearConversation(conversationId: string): void {
    this.conversations.delete(conversationId);
  }
}
