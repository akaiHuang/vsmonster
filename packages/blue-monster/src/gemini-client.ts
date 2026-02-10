/**
 * Gemini API Client for BlueMonster Extension
 * Provides concurrent session management similar to CopilotSDKManager
 */

import { GoogleGenerativeAI, GenerativeModel, ChatSession, Content, GenerateContentResult } from "@google/generative-ai";
import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

const CONFIG_SECTION = 'blueMonster';

/**
 * Try to load API key from workspace .env file
 */
function loadApiKeyFromEnv(): string {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    return "";
  }

  // Check both workspace root and parent directories for .env
  const searchPaths = [
    path.join(workspaceFolders[0].uri.fsPath, ".env"),
    path.join(workspaceFolders[0].uri.fsPath, "..", ".env"),
    path.join(workspaceFolders[0].uri.fsPath, "..", "..", ".env"),
  ];

  for (const envPath of searchPaths) {
    try {
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, "utf8");
        const match = content.match(/^\s*GOOGLE_GEMINI_API_KEY\s*=\s*(.+)$/m);
        if (match && match[1]) {
          return match[1].trim().replace(/^["']|["']$/g, ""); // Remove quotes if present
        }
      }
    } catch {
      // Ignore errors
    }
  }
  return "";
}

function normalizeGeminiModelId(modelId: string): string {
  const raw = String(modelId || '').trim();
  if (!raw) return raw;

  const stripped = raw.startsWith('models/') ? raw.slice('models/'.length) : raw;

  // Backward compatible aliases (avoid breaking existing user settings / docs).
  const aliases: Record<string, string> = {
    'gemini-2.5-pro-preview-05-06': 'gemini-2.5-pro',
    'gemini-3-pro': 'gemini-3-pro-preview',
    'gemini-3-flash': 'gemini-3-flash-preview',
  };

  return aliases[stripped] || stripped;
}

function getMaxConcurrentTasks(): number {
  return vscode.workspace.getConfiguration(CONFIG_SECTION).get<number>('maxConcurrentTasks', 3);
}

function getRequestBudget(): number {
  return vscode.workspace.getConfiguration(CONFIG_SECTION).get<number>('requestBudget', 0);
}

/**
 * A session wrapper that mimics the CopilotSession interface
 */
export class GeminiSession {
  private chat: ChatSession;
  private model: GenerativeModel;
  private history: Content[] = [];
  private eventHandlers: Array<(event: any) => void> = [];
  public readonly sessionId: string;

  constructor(
    private genAI: GoogleGenerativeAI,
    sessionId: string,
    modelId: string,
    private systemPrompt?: string
  ) {
    this.sessionId = sessionId;
    this.model = genAI.getGenerativeModel({
      model: modelId,
      systemInstruction: systemPrompt,
      generationConfig: {
        maxOutputTokens: 8192,
        temperature: 0.7,
      }
    });
    this.chat = this.model.startChat({ history: [] });
  }

  /**
   * Register event handler (for compatibility)
   */
  on(handler: (event: any) => void): void {
    this.eventHandlers.push(handler);
  }

  private emit(event: any): void {
    this.eventHandlers.forEach(h => h(event));
  }

  /**
   * Send prompt and wait for response
   * Mimics CopilotSession.sendAndWait
   */
  async sendAndWait(
    options: { prompt: string },
    timeoutMs: number = 300000
  ): Promise<{ data: { content: string } }> {
    const { prompt } = options;

    // Emit turn start event
    this.emit({ type: 'assistant.turn_start' });

    try {
      const result = await Promise.race([
        this.chat.sendMessage(prompt),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Request timed out after ${timeoutMs}ms`)), timeoutMs)
        )
      ]);

      const response = result.response;
      const text = response.text();

      // Update history
      this.history.push({ role: "user", parts: [{ text: prompt }] });
      this.history.push({ role: "model", parts: [{ text }] });

      // Emit message event
      this.emit({ type: 'assistant.message', content: text });
      this.emit({ type: 'assistant.turn_end' });

      return { data: { content: text } };
    } catch (err) {
      this.emit({ type: 'error', error: err });
      throw err;
    }
  }

  /**
   * Destroy the session (cleanup)
   */
  async destroy(): Promise<void> {
    this.history = [];
    this.eventHandlers = [];
  }
}

/**
 * GeminiSDKManager - Manages concurrent Gemini sessions
 * Similar to CopilotSDKManager but for Gemini API
 */
export class GeminiSDKManager {
  private genAI: GoogleGenerativeAI | null = null;
  private sessions: Map<string, GeminiSession> = new Map();
  private sessionModels: Map<string, string> = new Map();
  private busySessions: Set<string> = new Set();
  private totalUsedBudget = 0;
  private budgetExceeded = false;
  private listeners: Array<() => void> = [];
  private initPromise: Promise<void> | null = null;
  private apiKey: string = "";

  /**
   * Initialize the Gemini client
   */
  async initialize(): Promise<void> {
    if (this.genAI) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
      this.apiKey = config.get<string>("gemini.apiKey")
        || process.env.GOOGLE_GEMINI_API_KEY
        || loadApiKeyFromEnv()
        || "";

      if (!this.apiKey) {
        const msg = "Gemini API Key not configured. Set it in VS Code settings (blueMonster.gemini.apiKey), GOOGLE_GEMINI_API_KEY env var, or .env file.";
        console.error(`[GeminiSDK] ${msg}`);
        throw new Error(msg);
      }

      this.genAI = new GoogleGenerativeAI(this.apiKey);
      console.log('[GeminiSDK] Client started - TRUE PARALLEL WORKERS enabled!');
    })();

    return this.initPromise;
  }

  /**
   * Create a worker (session) for a task
   */
  async createWorker(
    chatId: string,
    model: string = 'gemini-3-pro-preview',
    reasoningEffort: string = 'medium'
  ): Promise<GeminiSession> {
    await this.initialize();
    if (!this.genAI) {
      throw new Error('Gemini SDK client not initialized');
    }
    model = normalizeGeminiModelId(model);

    // Check budget
    const budget = getRequestBudget();
    if (budget > 0 && this.totalUsedBudget >= budget) {
      this.budgetExceeded = true;
      this.notifyListeners();
      throw new Error(`Budget exceeded (${this.totalUsedBudget.toFixed(2)}/${budget})`);
    }

    // Check for existing session
    const existing = this.sessions.get(chatId);
    const existingModel = this.sessionModels.get(chatId);
    const modelKey = `${model}:${reasoningEffort}`;

    if (existing && existingModel === modelKey) {
      return existing;
    }

    if (existing && existingModel !== modelKey) {
      console.log(`[GeminiSDK] Model changed from ${existingModel} to ${modelKey}, recreating session...`);
      try {
        await existing.destroy();
      } catch (e) {
        console.error('[GeminiSDK] Error destroying old session:', e);
      }
      this.sessions.delete(chatId);
      this.sessionModels.delete(chatId);
    }

    // Create new session
    const sessionId = `${chatId}-${Date.now()}`;
    const session = new GeminiSession(this.genAI, sessionId, model);

    this.sessions.set(chatId, session);
    this.sessionModels.set(chatId, modelKey);
    this.notifyListeners();
    console.log(`[GeminiSDK] Worker CREATED for ${chatId}, model: ${model}`);

    return session;
  }

  /**
   * Get existing worker
   */
  getWorker(chatId: string): GeminiSession | undefined {
    return this.sessions.get(chatId);
  }

  /**
   * Mark session as busy
   */
  markBusy(chatId: string): void {
    this.busySessions.add(chatId);
    this.notifyListeners();
  }

  /**
   * Mark session as idle
   */
  markIdle(chatId: string): void {
    this.busySessions.delete(chatId);
    this.notifyListeners();
  }

  /**
   * Destroy a worker
   */
  async destroyWorker(chatId: string): Promise<void> {
    const session = this.sessions.get(chatId);
    if (session) {
      try {
        await session.destroy();
      } catch (e) {
        console.error(`[GeminiSDK] Error destroying worker ${chatId}:`, e);
      }
      this.sessions.delete(chatId);
      this.sessionModels.delete(chatId);
      this.busySessions.delete(chatId);
      this.notifyListeners();
      console.log(`[GeminiSDK] Worker DESTROYED for ${chatId}`);
    }
  }

  /**
   * Record usage
   */
  recordUsage(amount: number): void {
    this.totalUsedBudget += amount;
    const budget = getRequestBudget();
    if (budget > 0 && this.totalUsedBudget >= budget) {
      this.budgetExceeded = true;
    }
    this.notifyListeners();
  }

  /**
   * Reset budget
   */
  resetBudget(): void {
    this.totalUsedBudget = 0;
    this.budgetExceeded = false;
    this.notifyListeners();
  }

  /**
   * Get status
   */
  getStatus(): {
    running: number;
    total: number;
    maxConcurrent: number;
    usedBudget: number;
    budget: number;
    budgetExceeded: boolean;
  } {
    return {
      running: this.busySessions.size,
      total: this.sessions.size,
      maxConcurrent: getMaxConcurrentTasks(),
      usedBudget: this.totalUsedBudget,
      budget: getRequestBudget(),
      budgetExceeded: this.budgetExceeded
    };
  }

  /**
   * Add status listener
   */
  addListener(listener: () => void): () => void {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index >= 0) this.listeners.splice(index, 1);
    };
  }

  private notifyListeners(): void {
    this.listeners.forEach(l => l());
  }

  /**
   * Shutdown all workers
   */
  async shutdown(): Promise<void> {
    for (const [chatId, session] of this.sessions) {
      try {
        await session.destroy();
      } catch (e) {
        console.error(`[GeminiSDK] Error destroying session ${chatId} during shutdown:`, e);
      }
    }
    this.sessions.clear();
    this.sessionModels.clear();
    this.busySessions.clear();
    this.genAI = null;
    this.initPromise = null;
    console.log('[GeminiSDK] All workers shutdown');
  }

  /**
   * Check if API key is configured
   */
  isConfigured(): boolean {
    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
    const apiKey = config.get<string>("gemini.apiKey") || process.env.GOOGLE_GEMINI_API_KEY || "";
    return !!apiKey;
  }
}

// Singleton instance
export const geminiSDK = new GeminiSDKManager();
