import { spawn, ChildProcess } from 'child_process';
import { logger } from '../utils/logger';

export interface MCPServerConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  enabled?: boolean;
}

export interface MCPConfig {
  servers: MCPServerConfig[];
}

interface MCPServer {
  name: string;
  config: MCPServerConfig;
  process?: ChildProcess;
  status: 'stopped' | 'running' | 'error';
  lastError?: string;
}

/**
 * MCP (Model Context Protocol) 控制器
 * 用於管理和調用各種 MCP 服務器
 */
export class MCPController {
  private servers: Map<string, MCPServer> = new Map();
  private config: MCPConfig;

  constructor(config?: MCPConfig) {
    this.config = config || { servers: [] };
    
    // 初始化服務器配置
    for (const serverConfig of this.config.servers) {
      this.servers.set(serverConfig.name, {
        name: serverConfig.name,
        config: serverConfig,
        status: 'stopped',
      });
    }
  }

  /**
   * 初始化所有啟用的 MCP 服務器
   */
  async initialize(): Promise<void> {
    const enabledServers = this.config.servers.filter(s => s.enabled !== false);
    
    for (const serverConfig of enabledServers) {
      await this.startServer(serverConfig.name);
    }

    logger.info(`Initialized ${enabledServers.length} MCP server(s)`);
  }

  /**
   * 啟動指定的 MCP 服務器
   */
  async startServer(name: string): Promise<boolean> {
    const server = this.servers.get(name);
    if (!server) {
      logger.error(`MCP server not found: ${name}`);
      return false;
    }

    if (server.status === 'running') {
      logger.warn(`MCP server ${name} is already running`);
      return true;
    }

    try {
      const process = spawn(server.config.command, server.config.args || [], {
        env: { ...process.env, ...server.config.env },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      process.on('error', (err) => {
        server.status = 'error';
        server.lastError = err.message;
        logger.error(`MCP server ${name} error:`, err);
      });

      process.on('exit', (code) => {
        server.status = 'stopped';
        server.process = undefined;
        logger.info(`MCP server ${name} exited with code ${code}`);
      });

      process.stdout?.on('data', (data) => {
        logger.debug(`[MCP:${name}] ${data.toString().trim()}`);
      });

      process.stderr?.on('data', (data) => {
        logger.warn(`[MCP:${name}] ${data.toString().trim()}`);
      });

      server.process = process;
      server.status = 'running';
      logger.info(`MCP server ${name} started`);
      return true;
    } catch (error) {
      server.status = 'error';
      server.lastError = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to start MCP server ${name}:`, error);
      return false;
    }
  }

  /**
   * 停止指定的 MCP 服務器
   */
  async stopServer(name: string): Promise<void> {
    const server = this.servers.get(name);
    if (!server || !server.process) return;

    server.process.kill('SIGTERM');
    server.status = 'stopped';
    server.process = undefined;
    logger.info(`MCP server ${name} stopped`);
  }

  /**
   * 調用 MCP 服務器的功能
   */
  async invoke(serverName: string, action: string, params: any): Promise<any> {
    const server = this.servers.get(serverName);
    if (!server) {
      throw new Error(`MCP server not found: ${serverName}`);
    }

    if (server.status !== 'running') {
      // 嘗試啟動服務器
      const started = await this.startServer(serverName);
      if (!started) {
        throw new Error(`Failed to start MCP server: ${serverName}`);
      }
    }

    // 這裡需要根據 MCP 協議實現實際的調用邏輯
    // 目前使用簡化的 JSON-RPC 風格調用
    return this.sendRequest(server, action, params);
  }

  /**
   * 發送請求到 MCP 服務器
   */
  private async sendRequest(server: MCPServer, action: string, params: any): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!server.process || !server.process.stdin || !server.process.stdout) {
        reject(new Error('MCP server process not available'));
        return;
      }

      const requestId = Date.now().toString(36);
      const request = JSON.stringify({
        jsonrpc: '2.0',
        id: requestId,
        method: action,
        params,
      });

      // 設置超時
      const timeout = setTimeout(() => {
        reject(new Error('MCP request timeout'));
      }, 30000);

      // 監聽回應
      const responseHandler = (data: Buffer) => {
        try {
          const response = JSON.parse(data.toString());
          if (response.id === requestId) {
            clearTimeout(timeout);
            server.process?.stdout?.off('data', responseHandler);
            
            if (response.error) {
              reject(new Error(response.error.message));
            } else {
              resolve(response.result);
            }
          }
        } catch {
          // 忽略非 JSON 輸出
        }
      };

      server.process.stdout.on('data', responseHandler);
      server.process.stdin.write(request + '\n');
    });
  }

  /**
   * 列出所有 MCP 服務器
   */
  listServers(): Array<{ name: string; status: string; enabled: boolean }> {
    return Array.from(this.servers.values()).map(server => ({
      name: server.name,
      status: server.status,
      enabled: server.config.enabled !== false,
    }));
  }

  /**
   * 取得服務器狀態
   */
  getServerStatus(name: string): MCPServer | undefined {
    return this.servers.get(name);
  }

  /**
   * 關閉所有 MCP 服務器
   */
  async shutdown(): Promise<void> {
    const stopPromises = Array.from(this.servers.keys()).map(name => 
      this.stopServer(name)
    );
    await Promise.all(stopPromises);
    logger.info('All MCP servers stopped');
  }

  /**
   * 添加新的 MCP 服務器配置
   */
  addServer(config: MCPServerConfig): void {
    this.servers.set(config.name, {
      name: config.name,
      config,
      status: 'stopped',
    });
    logger.info(`MCP server ${config.name} added`);
  }

  /**
   * 移除 MCP 服務器
   */
  async removeServer(name: string): Promise<void> {
    await this.stopServer(name);
    this.servers.delete(name);
    logger.info(`MCP server ${name} removed`);
  }
}
