import * as vscode from 'vscode';
import { SubTask } from '../../shared/types/task';

/**
 * Copilot 橋接器
 * 負責將社群訊息轉換為 Copilot 指令並執行
 */
export class CopilotBridge {
  private context: vscode.ExtensionContext;
  private currentModel: string = 'gpt-4';

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
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

    // 使用 VS Code 內建的聊天 API
    const chatModels = await vscode.lm.selectChatModels({
      vendor: 'copilot',
      family: this.currentModel.includes('gpt-4') ? 'gpt-4' : 'gpt-3.5-turbo'
    });

    if (chatModels.length === 0) {
      throw new Error('No chat models available');
    }

    const model = chatModels[0];
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
