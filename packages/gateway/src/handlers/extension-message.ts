/**
 * Extension Message Handler
 * Processes WebSocket messages received from VS Code extensions (UFO).
 * Extracted from server.ts for improved maintainability.
 */

import {
  HolographyServer,
  ChannelType,
  TelegramChannel,
  LineChannel,
  OutgoingMessage,
} from '@vsmonster/holography';
import { TaskManager } from '../task/manager';
import { MCPController } from '../mcp/controller';
import { TunnelService } from '../tunnel/service';
import { logger } from '../utils/logger';
import { withRetry } from '../utils/retry';
import { createResultReadyBubble } from '../line/flex-templates';

/**
 * Send message with retry logic for rate limiting (429 errors)
 */
async function sendWithRetry(
  holography: HolographyServer,
  channel: ChannelType,
  userId: string,
  message: OutgoingMessage
): Promise<void> {
  await withRetry(() => holography.sendMessage(channel, userId, message));
}

function splitTextIntoChunks(text: string, maxLen: number): string[] {
  const s = String(text ?? '');
  if (!s) return [''];
  const out: string[] = [];
  for (let i = 0; i < s.length; i += maxLen) {
    out.push(s.slice(i, i + maxLen));
  }
  return out.length > 0 ? out : [''];
}

async function sendLineText(
  holography: HolographyServer,
  targetId: string,
  text: string,
  options: { replyToken?: string; chatId?: string } = {}
): Promise<void> {
  const maxLen = 4500; // LINE limit is 5000; keep a safe margin.
  const chunks = splitTextIntoChunks(text, maxLen);
  for (let i = 0; i < chunks.length; i++) {
    const replyToken = i === 0 ? options.replyToken : undefined;
    await sendWithRetry(holography, 'line', targetId, { text: chunks[i], chatId: options.chatId, replyToken });
  }
}

export interface ExtensionHandlerDependencies {
  holography: HolographyServer;
  taskManager: TaskManager;
  mcpController: MCPController;
  tunnelService: TunnelService;
  config: { port?: number };
  // server.ts maintains this map; we clear timers when a result arrives.
  lineTaskTimers?: Map<string, ReturnType<typeof setTimeout>>;
}

/**
 * Handle a message received from a VS Code extension client.
 */
export async function handleExtensionMessage(
  clientId: string,
  message: any,
  deps: ExtensionHandlerDependencies
): Promise<void> {
  const { holography, taskManager, mcpController, tunnelService, config } = deps;

  logger.debug(`Extension message from ${clientId}:`, message);

  switch (message.type) {
    case 'chat_action': {
      if (message.channel === 'telegram' && message.action === 'typing') {
        const chatId = String(message.chatId || message.userId || '');
        if (chatId) {
          const tg = holography.getChannelManager().getChannel<TelegramChannel>('telegram');
          try {
            await tg?.sendTypingAction(chatId);
          } catch (err) {
            logger.debug(`Failed to send typing action: ${String(err)}`);
          }
        }
      }
      break;
    }

    case 'copilot_response': {
      const text = message.text || message.content;
      if (message.channel && message.userId && text) {
        // LINE long-task flow: store result, reply if still within replyToken window,
        // otherwise push a "result ready" notify and let the user click to fetch via postback.
        if (message.channel === 'line' && typeof message.taskId === 'string' && message.taskId.trim()) {
          const enabledChannels = holography.getChannelManager().getEnabledChannels();
          const canNotify = enabledChannels.includes('line');
          if (!canNotify) {
            holography.broadcastRawToExtensions({
              type: 'copilot_response',
              channel: message.channel,
              userId: message.userId,
              chatId: message.chatId,
              text,
              source: 'extension',
            });
            break;
          }

          const taskId = message.taskId.trim();

          // Cancel timeout (if still pending).
          const timer = deps.lineTaskTimers?.get(taskId);
          if (timer) {
            clearTimeout(timer);
            deps.lineTaskTimers?.delete(taskId);
          }

          // Persist final content for postback retrieval.
          taskManager.setLLMResult(taskId, text, {
            model: typeof message.model === 'string' ? message.model : undefined,
            tokensUsed: typeof message.tokensUsed === 'number' ? message.tokensUsed : undefined,
          });

          const lineMeta = taskManager.getLineMetadata(taskId);
          const targetId = lineMeta?.targetId || lineMeta?.chatId || String(message.chatId || message.userId || '');
          if (!targetId) break;

          const lineChannel = holography.getChannelManager().getChannel<LineChannel>('line');
          if (!lineChannel) break;

          if (lineMeta?.timeoutHandled) {
            // Push notify when ready (only once).
            if (!lineMeta.notifySentAt) {
              const bubble = createResultReadyBubble(taskId);
              try {
                await lineChannel.sendFlexMessage(targetId, '✅ 已完成', bubble);
                taskManager.setLineMetadata(taskId, { notifySentAt: new Date() });
              } catch (err) {
                logger.warn(`Failed to push LINE result-ready notify: ${String(err)}`);
              }
            }
          } else {
            // Reply the answer (before replyToken expires). Remaining chunks are pushed.
            try {
              await sendLineText(holography, targetId, text, { replyToken: lineMeta?.originalReplyToken, chatId: lineMeta?.chatId });
            } catch (err) {
              logger.warn(`Failed to send LINE copilot response: ${String(err)}`);
            }
          }

          try {
            taskManager.updateTask(taskId, 'completed', 100);
          } catch {}

          break;
        }

        const enabledChannels = holography.getChannelManager().getEnabledChannels();
        const canNotify = enabledChannels.includes(message.channel as ChannelType);
        if (!canNotify) {
          holography.broadcastRawToExtensions({
            type: 'copilot_response',
            channel: message.channel,
            userId: message.userId,
            chatId: message.chatId,
            text,
            source: 'extension',
          });
          break;
        }
        try {
          // Use replyToken if provided (LINE) for faster response with less rate limiting
          await sendWithRetry(
            holography,
            message.channel as ChannelType,
            message.chatId || message.userId,
            { text, chatId: message.chatId, replyToken: message.replyToken }
          );
        } catch (err) {
          logger.warn(`Failed to send copilot response to ${message.channel}: ${err}`);
        }
      }
      break;
    }

    case 'task_update':
      taskManager.updateTask(message.taskId, message.status, message.progress);
      break;

    case 'task_status_change': {
      const task = taskManager.getTask(message.taskId);
      if (task) {
        taskManager.updateTask(message.taskId, message.status, message.progress);

        const enabledChannels = holography.getChannelManager().getEnabledChannels();
        const canNotify = enabledChannels.includes(task.channel as ChannelType);

        if (message.status === 'completed') {
          if (message.mediaIds || message.summary) {
            taskManager.setTaskDelivery(message.taskId, {
              mediaIds: message.mediaIds,
              summary: message.summary,
              deliveredAt: new Date(),
            });
          }

          if (canNotify) {
            const baseUrl = tunnelService.getStatus().url
              || `http://localhost:${config.port || 3000}`;
            const deliveryUrl = `${baseUrl}/task/${message.taskId}`;

            const statusText = taskManager.formatTaskStatus(
              taskManager.getTask(message.taskId)!
            );
            const deliveryMessage = `${statusText}\n📎 查看結果: ${deliveryUrl}`;

            try {
              await sendWithRetry(
                holography,
                task.channel as ChannelType,
                task.userId,
                { text: deliveryMessage }
              );
            } catch (err) {
              logger.warn(`Failed to send delivery notification: ${err}`);
            }
          }

          taskManager.updateTask(message.taskId, 'delivered');
        } else if (canNotify) {
          const statusText = taskManager.formatTaskStatus(
            taskManager.getTask(message.taskId)!
          );
          try {
            await sendWithRetry(
              holography,
              task.channel as ChannelType,
              task.userId,
              { text: statusText }
            );
          } catch (err) {
            logger.warn(`Failed to send status notification: ${err}`);
          }
        }
      }
      break;
    }

    case 'send_message': {
      if (message.channel && message.userId && (message.text || message.content)) {
        try {
          await sendWithRetry(
            holography,
            message.channel as ChannelType,
            message.chatId || message.userId,
            { text: message.text || message.content, chatId: message.chatId }
          );
        } catch (err) {
          logger.warn(`Failed to send message to ${message.channel}: ${err}`);
        }
      }
      break;
    }

    case 'mcp_invoke': {
      try {
        const result = await mcpController.invoke(
          message.server,
          message.action,
          message.params
        );
        holography.broadcastRawToExtensions({
          type: 'mcp_result',
          requestId: message.requestId,
          result,
        });
      } catch (error) {
        holography.broadcastRawToExtensions({
          type: 'mcp_result',
          requestId: message.requestId,
          error: String(error),
        });
      }
      break;
    }

    default:
      logger.debug(`Unknown extension message type: ${message.type}`);
  }
}
