/**
 * 指令處理器
 * 解析社群訊息中的指令並執行相應操作
 */

import { IncomingMessage } from '@vsmonster/holography';
import { TaskManager } from '../task/manager';
import { logger } from '../utils/logger';
import { STATUS_EMOJI } from '../utils/constants';

export interface CommandContext {
  message: IncomingMessage;
  args: string[];
  rawArgs: string;
}

export interface CommandResult {
  success: boolean;
  response?: string;
  data?: any;
  error?: string;
}

export type CommandHandler = (context: CommandContext) => Promise<CommandResult>;

/**
 * 指令定義
 */
export interface CommandDefinition {
  name: string;
  aliases: string[];
  description: string;
  usage: string;
  handler: CommandHandler;
}

/**
 * 指令處理器
 */
export class CommandProcessor {
  private commands: Map<string, CommandDefinition> = new Map();
  private taskManager: TaskManager;
  private tunnelUrl?: string;
  
  // 回調函數
  private sendToVSCode?: (type: string, data: any) => void;
  private replyToChannel?: (message: IncomingMessage, text: string) => Promise<void>;

  constructor(taskManager: TaskManager) {
    this.taskManager = taskManager;
    this.registerBuiltinCommands();
  }

  /**
   * 設定回調函數
   */
  setCallbacks(callbacks: {
    sendToVSCode?: (type: string, data: any) => void;
    replyToChannel?: (message: IncomingMessage, text: string) => Promise<void>;
  }): void {
    this.sendToVSCode = callbacks.sendToVSCode;
    this.replyToChannel = callbacks.replyToChannel;
  }

  /**
   * 設定 Tunnel URL
   */
  setTunnelUrl(url: string): void {
    this.tunnelUrl = url;
  }

  /**
   * 註冊內建指令
   */
  private registerBuiltinCommands(): void {
    // /task - 建立任務
    this.registerCommand({
      name: 'task',
      aliases: ['t', '任務'],
      description: '建立新任務給 VS Code Copilot',
      usage: '/task <任務描述>',
      handler: async (ctx) => {
        if (!ctx.rawArgs) {
          return {
            success: false,
            error: '請提供任務描述，例如: /task 建立登入頁面',
          };
        }

        if (ctx.rawArgs.length > 10000) {
          return {
            success: false,
            error: 'Task instruction too long (max 10,000 characters)',
          };
        }

        const task = this.taskManager.createTask({
          channel: ctx.message.channel,
          userId: ctx.message.userId,
          instruction: ctx.rawArgs,
          media: ctx.message.media,
        });

        // 發送到 VS Code
        this.sendToVSCode?.('new_task', {
          task,
          instruction: ctx.rawArgs,
          media: ctx.message.media,
        });

        return {
          success: true,
          response: this.formatTaskCreated(task),
          data: task,
        };
      },
    });

    // /status - 查看狀態
    this.registerCommand({
      name: 'status',
      aliases: ['s', '狀態'],
      description: '查看任務狀態',
      usage: '/status [任務ID]',
      handler: async (ctx) => {
        const taskId = ctx.args[0];
        
        if (taskId) {
          const task = this.taskManager.getTask(taskId);
          if (!task) {
            return { success: false, error: `找不到任務: ${taskId}` };
          }
          return {
            success: true,
            response: this.formatTaskStatus(task),
            data: task,
          };
        }

        // 列出用戶的所有任務
        const tasks = this.taskManager.getUserTasks(ctx.message.userId);
        if (tasks.length === 0) {
          return { success: true, response: '📋 目前沒有進行中的任務' };
        }

        return {
          success: true,
          response: this.formatTaskList(tasks),
          data: tasks,
        };
      },
    });

    // /model - 切換模型
    this.registerCommand({
      name: 'model',
      aliases: ['m', '模型'],
      description: '切換 AI 模型',
      usage: '/model <模型名稱>',
      handler: async (ctx) => {
        const availableModels = ['gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo', 'claude-3-opus', 'claude-3-sonnet'];
        
        if (!ctx.rawArgs) {
          return {
            success: true,
            response: `可用模型:\n${availableModels.map(m => `• ${m}`).join('\n')}\n\n使用 /model <名稱> 切換`,
          };
        }

        const model = ctx.rawArgs.toLowerCase().trim();
        if (!availableModels.includes(model)) {
          return {
            success: false,
            error: `未知模型: ${model}\n可用: ${availableModels.join(', ')}`,
          };
        }

        this.sendToVSCode?.('switch_model', { model });

        return {
          success: true,
          response: `✅ 已切換模型至: ${model}`,
        };
      },
    });

    // /preview - 預覽連結
    this.registerCommand({
      name: 'preview',
      aliases: ['p', '預覽'],
      description: '取得 ngrok 預覽連結',
      usage: '/preview',
      handler: async (ctx) => {
        if (!this.tunnelUrl) {
          return {
            success: false,
            error: '❌ ngrok 隧道未啟用\n請在 config.json 中啟用 tunnel',
          };
        }

        return {
          success: true,
          response: `🌐 預覽連結:\n${this.tunnelUrl}`,
          data: { url: this.tunnelUrl },
        };
      },
    });

    // /cancel - 取消任務
    this.registerCommand({
      name: 'cancel',
      aliases: ['c', '取消'],
      description: '取消進行中的任務',
      usage: '/cancel <任務ID>',
      handler: async (ctx) => {
        const taskId = ctx.args[0];
        
        if (!taskId) {
          return { success: false, error: '請提供任務 ID，例如: /cancel task-001' };
        }

        const task = this.taskManager.getTask(taskId);
        if (!task) {
          return { success: false, error: `找不到任務: ${taskId}` };
        }

        this.taskManager.updateTaskStatus(taskId, 'cancelled');
        this.sendToVSCode?.('cancel_task', { taskId });

        return {
          success: true,
          response: `✅ 已取消任務: ${taskId}`,
        };
      },
    });

    // /help - 顯示說明
    this.registerCommand({
      name: 'help',
      aliases: ['h', '說明', '幫助'],
      description: '顯示可用指令',
      usage: '/help [指令名稱]',
      handler: async (ctx) => {
        const cmdName = ctx.args[0];
        
        if (cmdName) {
          const cmd = this.findCommand(cmdName);
          if (!cmd) {
            return { success: false, error: `未知指令: ${cmdName}` };
          }
          return {
            success: true,
            response: `📖 ${cmd.name}\n\n${cmd.description}\n\n用法: ${cmd.usage}`,
          };
        }

        return {
          success: true,
          response: this.formatHelpMessage(),
        };
      },
    });

    // /mcp - MCP 功能
    this.registerCommand({
      name: 'mcp',
      aliases: [],
      description: '使用 MCP 服務',
      usage: '/mcp <服務> <操作> [參數]',
      handler: async (ctx) => {
        const [service, action, ...params] = ctx.args;
        
        if (!service || !action) {
          return {
            success: true,
            response: `MCP 服務使用方式:\n/mcp email send <收件人> <主題>\n/mcp browser open <URL>\n/mcp file read <路徑>`,
          };
        }

        this.sendToVSCode?.('mcp_request', {
          service,
          action,
          params: params.join(' '),
        });

        return {
          success: true,
          response: `🔧 已發送 MCP 請求: ${service}.${action}`,
        };
      },
    });
  }

  /**
   * 註冊指令
   */
  registerCommand(definition: CommandDefinition): void {
    this.commands.set(definition.name, definition);
    for (const alias of definition.aliases) {
      this.commands.set(alias, definition);
    }
  }

  /**
   * 尋找指令
   */
  private findCommand(name: string): CommandDefinition | undefined {
    return this.commands.get(name.toLowerCase());
  }

  /**
   * 處理訊息
   */
  async processMessage(message: IncomingMessage): Promise<CommandResult | null> {
    const text = message.text?.trim();
    if (!text) return null;

    // 檢查是否為指令
    if (text.startsWith('/')) {
      return this.processCommand(message, text);
    }

    // 非指令文字，視為直接任務
    if (text.length > 10000) {
      return {
        success: false,
        error: 'Task instruction too long (max 10,000 characters)',
      };
    }

    // 建立任務
    const task = this.taskManager.createTask({
      channel: message.channel,
      userId: message.userId,
      instruction: text,
      media: message.media,
    });

    this.sendToVSCode?.('new_task', {
      task,
      instruction: text,
      media: message.media,
    });

    return {
      success: true,
      response: this.formatTaskCreated(task),
      data: task,
    };
  }

  /**
   * 處理指令
   */
  private async processCommand(message: IncomingMessage, text: string): Promise<CommandResult> {
    // 解析指令
    const match = text.match(/^\/(\S+)(?:\s+(.*))?$/);
    if (!match) {
      return { success: false, error: '無效的指令格式' };
    }

    const [, cmdName, rawArgs = ''] = match;
    const args = rawArgs.split(/\s+/).filter(Boolean);

    const command = this.findCommand(cmdName);
    if (!command) {
      return {
        success: false,
        error: `未知指令: /${cmdName}\n輸入 /help 查看可用指令`,
      };
    }

    const context: CommandContext = {
      message,
      args,
      rawArgs: rawArgs.trim(),
    };

    try {
      logger.debug(`Processing command: /${command.name}`, { args, userId: message.userId });
      const result = await command.handler(context);
      
      // 自動回覆
      if (result.response && this.replyToChannel) {
        await this.replyToChannel(message, result.response);
      }

      return result;
    } catch (error) {
      logger.error(`Command error: /${command.name}`, error);
      return {
        success: false,
        error: `執行指令時發生錯誤: ${error}`,
      };
    }
  }

  /**
   * 格式化任務建立訊息
   */
  private formatTaskCreated(task: any): string {
    const subtaskCount = task.subtasks?.length || 0;
    let msg = `📋 任務已建立 #${task.id}\n\n`;
    msg += `指令: ${task.instruction.slice(0, 50)}${task.instruction.length > 50 ? '...' : ''}\n`;
    
    if (subtaskCount > 0) {
      msg += `\n已拆分為 ${subtaskCount} 個子任務:\n`;
      task.subtasks?.slice(0, 5).forEach((st: any, i: number) => {
        msg += `  ${i + 1}. ${st.description}\n`;
      });
      if (subtaskCount > 5) {
        msg += `  ... 還有 ${subtaskCount - 5} 個\n`;
      }
    }

    msg += '\n⏳ 正在處理中...';
    return msg;
  }

  /**
   * 格式化任務狀態
   */
  private formatTaskStatus(task: any): string {
    let msg = `📋 任務 #${task.id}\n\n`;
    msg += `狀態: ${STATUS_EMOJI[task.status] || '❓'} ${task.status}\n`;
    msg += `進度: ${task.progress}%\n`;

    if (task.subtasks?.length > 0) {
      msg += '\n子任務:\n';
      task.subtasks.forEach((st: any) => {
        const emoji = STATUS_EMOJI[st.status] || '⏳';
        msg += `  ${emoji} ${st.description}\n`;
      });
    }

    if (task.error) {
      msg += `\n❌ 錯誤: ${task.error}`;
    }

    return msg;
  }

  /**
   * 格式化任務列表
   */
  private formatTaskList(tasks: any[]): string {
    let msg = '📋 你的任務列表:\n\n';

    tasks.forEach((task, i) => {
      const emoji = STATUS_EMOJI[task.status] || '❓';
      const shortInstruction = task.instruction.slice(0, 30);
      msg += `${i + 1}. ${emoji} #${task.id}\n`;
      msg += `   ${shortInstruction}${task.instruction.length > 30 ? '...' : ''}\n`;
      msg += `   進度: ${task.progress}%\n\n`;
    });

    return msg.trim();
  }

  /**
   * 格式化說明訊息
   */
  private formatHelpMessage(): string {
    const commandList = Array.from(new Set(this.commands.values()));
    
    let msg = '🦞 VSMONSTER 指令說明\n\n';
    msg += '透過 VSMONSTER，你可以用手機遠端控制 VS Code Copilot\n\n';
    msg += '📌 可用指令:\n\n';

    commandList.forEach(cmd => {
      msg += `/${cmd.name} - ${cmd.description}\n`;
    });

    msg += '\n💡 提示: 直接發送文字也會建立任務\n';
    msg += '\n範例:\n';
    msg += '• /task 建立一個 React 登入頁面\n';
    msg += '• /status\n';
    msg += '• /model gpt-4-turbo\n';

    return msg;
  }
}
