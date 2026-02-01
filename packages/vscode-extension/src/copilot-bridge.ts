import * as vscode from 'vscode';

// 本地定義 SubTask 類型，避免跨 package 引用問題
interface SubTask {
  id: string;
  title: string;
  description?: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: string;
}

/**
 * 可用模型資訊
 */
export interface AvailableModel {
  id: string;
  name: string;
  family: string;
  vendor: string;
  version: string;
  maxInputTokens: number;
}

/**
 * Copilot 橋接器
 * 負責將社群訊息轉換為 Copilot 指令並執行
 */
export class CopilotBridge {
  private context: vscode.ExtensionContext;
  private currentModel: string = 'gpt-4';
  private availableModels: AvailableModel[] = [];
  private refreshPromise?: Promise<AvailableModel[]>;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  /**
   * 獲取所有可用的 Copilot 模型
   */
  async refreshAvailableModels(): Promise<AvailableModel[]> {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this.fetchAvailableModels();
    try {
      return await this.refreshPromise;
    } finally {
      this.refreshPromise = undefined;
    }
  }

  private async fetchAvailableModels(): Promise<AvailableModel[]> {
    try {
      console.log('[VSMONSTER] Fetching available Copilot models...');
      
      // 檢查 API 是否可用
      if (!vscode.lm || !vscode.lm.selectChatModels) {
        console.error('[VSMONSTER] vscode.lm API is not available');
        vscode.window.showErrorMessage('Language Model API 不可用，請確認 VS Code 版本 >= 1.90');
        return [];
      }

      // 優先獲取 Copilot 提供的模型
      const models = await vscode.lm.selectChatModels({ vendor: 'copilot' });
      
      if (models.length > 0) {
        this.availableModels = models.map(model => ({
          id: model.id,
          name: model.name,
          family: model.family,
          vendor: model.vendor,
          version: model.version,
          maxInputTokens: model.maxInputTokens
        }));
        console.log(`[VSMONSTER] Found ${this.availableModels.length} Copilot models:`, 
          this.availableModels.map(m => m.name).join(', '));
        return this.availableModels;
      }

      // 如果沒有 Copilot 模型，獲取所有模型作為退路
      const allModels = await vscode.lm.selectChatModels();
      console.log(`[VSMONSTER] Total models available: ${allModels.length}`);
      
      if (allModels.length > 0) {
        console.log('[VSMONSTER] All models:', allModels.map(m => `${m.name} (${m.vendor})`).join(', '));
      }

      this.availableModels = allModels.map(model => ({
        id: model.id,
        name: model.name,
        family: model.family,
        vendor: model.vendor,
        version: model.version,
        maxInputTokens: model.maxInputTokens
      }));

      if (this.availableModels.length > 0) {
        console.log('[VSMONSTER] No Copilot models, using all available models');
      }

      return this.availableModels;
    } catch (error) {
      console.error('[VSMONSTER] Failed to get available models:', error);
      vscode.window.showErrorMessage(`獲取模型失敗: ${error}`);
      return [];
    }
  }

  /**
   * 獲取可用模型列表
   */
  getAvailableModels(): AvailableModel[] {
    return this.availableModels;
  }

  /**
   * 獲取可用模型 ID 列表（用於設定選項）
   */
  getAvailableModelIds(): string[] {
    return this.availableModels.map(m => m.id);
  }

  /**
   * 進行一般對話（不創建任務）
   * @param message 用戶的訊息
   * @param userId 用戶 ID（可選，用於追蹤對話）
   */
  async chat(message: string, userId?: string): Promise<string> {
    try {
      const result = await this.sendToCopilotChat(message);
      return result.response || '抱歉，我無法處理這個訊息。';
    } catch (error) {
      console.error('[VSMONSTER] Chat error:', error);
      throw error;
    }
  }

  /**
   * 執行子任務
   */
  async executeSubtask(subtask: SubTask, fullInstruction: string): Promise<any> {
    // 構建 Copilot 指令
    const prompt = this.buildPrompt(subtask, fullInstruction);
    
    try {
      // 方法 1: 使用 Copilot Chat API (如果可用)
      const result = await this.sendToCopilotChat(prompt);
      return result;
    } catch {
      // 方法 2: 使用 Inline Suggest
      return this.useInlineSuggest(prompt);
    }
  }

  /**
   * 構建 Copilot 提示詞
   */
  private buildPrompt(subtask: SubTask, fullInstruction: string): string {
    return `
## 任務背景
${fullInstruction}

## 當前子任務
${subtask.description}

## 要求
1. 分析當前子任務需求
2. 執行必要的操作 (建立檔案、編寫程式碼等)
3. 確保程式碼品質和最佳實踐

請開始執行此子任務。
`.trim();
  }

  /**
   * 發送到 Copilot Chat
   */
  private async sendToCopilotChat(prompt: string): Promise<any> {
    // 嘗試使用 Copilot Chat API
    // 注意: 這需要 Copilot Chat 擴展
    
    const copilotExtension = vscode.extensions.getExtension('GitHub.copilot-chat');
    
    if (!copilotExtension) {
      throw new Error('Copilot Chat extension not found');
    }

    // 優先使用設定的模型 ID 直接匹配
    let chatModels = await vscode.lm.selectChatModels({
      vendor: 'copilot',
      id: this.currentModel
    });

    // 如果找不到，嘗試用 family 匹配
    if (chatModels.length === 0) {
      chatModels = await vscode.lm.selectChatModels({
        vendor: 'copilot',
        family: this.currentModel.includes('gpt-4') ? 'gpt-4' : 
                this.currentModel.includes('gpt-3.5') ? 'gpt-3.5-turbo' :
                this.currentModel.includes('claude') ? 'claude-3.5-sonnet' : undefined
      });
    }

    // 還是找不到，獲取所有可用模型並使用第一個
    if (chatModels.length === 0) {
      chatModels = await vscode.lm.selectChatModels({ vendor: 'copilot' });
    }

    if (chatModels.length === 0) {
      throw new Error('No chat models available');
    }

    const model = chatModels[0];
    console.log(`[VSMONSTER] Using model: ${model.name} (${model.id})`);
    
    const messages = [
      vscode.LanguageModelChatMessage.User(prompt)
    ];

    const response = await model.sendRequest(messages, {}, new vscode.CancellationTokenSource().token);
    
    let result = '';
    for await (const fragment of response.text) {
      result += fragment;
    }

    return { response: result };
  }

  /**
   * 使用 Inline Suggest (備用方案)
   */
  private async useInlineSuggest(prompt: string): Promise<any> {
    // 建立暫時檔案並觸發 Copilot 建議
    const document = await vscode.workspace.openTextDocument({
      content: `// ${prompt}\n\n`,
      language: 'typescript',
    });

    await vscode.window.showTextDocument(document);
    
    // 等待 Copilot 建議
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 觸發 Copilot 建議
    await vscode.commands.executeCommand('editor.action.inlineSuggest.trigger');
    
    return { method: 'inline-suggest' };
  }

  /**
   * 切換模型
   */
  async switchModel(model: string): Promise<void> {
    this.currentModel = model;
    vscode.window.showInformationMessage(`已切換模型至: ${model}`);
  }

  /**
   * 執行程式碼
   */
  async executeCode(code: string, language: string): Promise<any> {
    // 建立新檔案
    const document = await vscode.workspace.openTextDocument({
      content: code,
      language,
    });

    await vscode.window.showTextDocument(document);
    
    // 如果是可執行的語言，嘗試執行
    if (language === 'javascript' || language === 'typescript') {
      const terminal = vscode.window.createTerminal('VSMONSTER Execution');
      terminal.show();
      
      // 儲存到暫時檔案並執行
      const tempFile = `/tmp/vsmonster_exec.${language === 'typescript' ? 'ts' : 'js'}`;
      const fs = await import('fs').then(m => m.promises);
      await fs.writeFile(tempFile, code);
      
      if (language === 'typescript') {
        terminal.sendText(`npx ts-node ${tempFile}`);
      } else {
        terminal.sendText(`node ${tempFile}`);
      }
    }

    return { executed: true };
  }

  /**
   * 建立檔案
   */
  async createFile(path: string, content: string): Promise<void> {
    const uri = vscode.Uri.file(path);
    const workspaceEdit = new vscode.WorkspaceEdit();
    
    workspaceEdit.createFile(uri, { 
      overwrite: true,
      contents: Buffer.from(content, 'utf-8')
    });
    
    await vscode.workspace.applyEdit(workspaceEdit);
    
    // 開啟檔案
    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document);
  }

  /**
   * 建立資料夾
   */
  async createFolder(path: string): Promise<void> {
    const uri = vscode.Uri.file(path);
    await vscode.workspace.fs.createDirectory(uri);
  }

  /**
   * 在終端機執行命令
   */
  async runCommand(command: string): Promise<void> {
    const terminal = vscode.window.createTerminal('VSMONSTER');
    terminal.show();
    terminal.sendText(command);
  }
}
