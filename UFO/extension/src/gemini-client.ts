/**
 * Gemini API Client for UFO Extension
 * Replaces the GitHub Copilot SDK with Google's Generative AI
 */

import { GoogleGenerativeAI, GenerativeModel, ChatSession, Content } from "@google/generative-ai";
import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

/**
 * Try to load API key from .env file
 * Searches in workspace folders and extension's parent directories
 */
function loadApiKeyFromEnv(): string {
  const searchPaths: string[] = [];

  // 1. Check workspace folders
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (workspaceFolders && workspaceFolders.length > 0) {
    searchPaths.push(
      path.join(workspaceFolders[0].uri.fsPath, ".env"),
      path.join(workspaceFolders[0].uri.fsPath, "..", ".env"),
      path.join(workspaceFolders[0].uri.fsPath, "..", "..", ".env"),
    );
  }

  // 2. Check from extension's location (UFO/extension/dist -> UFO/extension -> UFO -> vsmonster)
  // __dirname in bundled code is the dist folder
  const extDir = __dirname; // UFO/extension/dist
  searchPaths.push(
    path.join(extDir, "..", ".env"),           // UFO/extension/.env
    path.join(extDir, "..", "..", ".env"),     // UFO/.env
    path.join(extDir, "..", "..", "..", ".env"), // vsmonster/.env
  );

  // 3. Check common project root locations
  const homeDir = process.env.HOME || process.env.USERPROFILE || "";
  if (homeDir) {
    searchPaths.push(
      path.join(homeDir, "Desktop", "vsmonster", ".env"),
    );
  }

  console.log("[Gemini] Searching .env in paths:", searchPaths);

  for (const envPath of searchPaths) {
    try {
      const resolved = path.resolve(envPath);
      const exists = fs.existsSync(resolved);
      if (exists) {
        console.log(`[Gemini] Found .env at ${resolved}`);
        const content = fs.readFileSync(resolved, "utf8");
        const match = content.match(/^\s*GOOGLE_GEMINI_API_KEY\s*=\s*(.+)$/m);
        if (match && match[1]) {
          const key = match[1].trim().replace(/^["']|["']$/g, "");
          console.log(`[Gemini] API key found, length: ${key.length}`);
          return key;
        } else {
          console.log(`[Gemini] .env found but no GOOGLE_GEMINI_API_KEY`);
        }
      }
    } catch (err) {
      // Ignore errors
    }
  }
  console.log("[Gemini] No API key found in any .env file");
  return "";
}

function normalizeGeminiModelId(modelId: string): string {
  const raw = String(modelId || "").trim();
  if (!raw) return raw;

  const stripped = raw.startsWith("models/") ? raw.slice("models/".length) : raw;
  const lower = stripped.toLowerCase();

  // Backward-compatible aliases (avoid breaking existing configs).
  const aliases: Record<string, string> = {
    "gemini-2.5-pro-preview-05-06": "gemini-2.5-pro",
    "gemini-3-pro": "gemini-3-pro-preview",
    "gemini-3-flash": "gemini-3-flash-preview",
    "gemini-pro": "gemini-pro-latest",
    "gemini-flash": "gemini-flash-latest",
  };

  return aliases[lower] || stripped;
}

export interface GeminiMessage {
  role: "user" | "model";
  content: string;
}

export class GeminiManager {
  private genAI: GoogleGenerativeAI | null = null;
  private sessions = new Map<string, { chat: ChatSession; model: string; history: Content[] }>();
  private output: vscode.OutputChannel | null = null;
  private dashboardLog: ((tag: string, message: string, tagClass: string) => void) | null = null;
  private apiKey: string = "";

  setOutput(output: vscode.OutputChannel): void {
    this.output = output;
  }

  setDashboardLog(fn: (tag: string, message: string, tagClass: string) => void): void {
    this.dashboardLog = fn;
  }

  private log(message: string): void {
    this.output?.appendLine(`[Gemini] ${message}`);
  }

  /**
   * Initialize the Gemini client with API key from settings
   * Priority: VS Code settings > Environment variable > .env file
   */
  async initialize(): Promise<void> {
    const config = vscode.workspace.getConfiguration("ufo");
    const fromSettings = config.get<string>("gemini.apiKey") || "";
    const fromEnvVar = process.env.GOOGLE_GEMINI_API_KEY || "";
    const fromEnvFile = loadApiKeyFromEnv();

    console.log("[Gemini] API key sources:");
    console.log(`  - VS Code settings (ufo.gemini.apiKey): ${fromSettings ? `found (${fromSettings.length} chars)` : "not set"}`);
    console.log(`  - process.env.GOOGLE_GEMINI_API_KEY: ${fromEnvVar ? `found (${fromEnvVar.length} chars)` : "not set"}`);
    console.log(`  - .env file: ${fromEnvFile ? `found (${fromEnvFile.length} chars)` : "not found"}`);

    this.apiKey = fromSettings || fromEnvVar || fromEnvFile || "";

    if (!this.apiKey) {
      const msg = "Gemini API Key not configured. Set it in VS Code settings (ufo.gemini.apiKey), GOOGLE_GEMINI_API_KEY env var, or .env file.";
      this.log(`❌ ${msg}`);
      throw new Error(msg);
    }

    console.log(`[Gemini] Using API key (${this.apiKey.length} chars)`);
    this.genAI = new GoogleGenerativeAI(this.apiKey);
    this.log("✅ Gemini client initialized");
  }

  /**
   * Ensure the client is initialized
   */
  private async ensureInitialized(): Promise<GoogleGenerativeAI> {
    if (!this.genAI) {
      await this.initialize();
    }
    if (!this.genAI) {
      throw new Error("Failed to initialize Gemini client");
    }
    return this.genAI;
  }

  /**
   * Get or create a chat session for a given session key
   */
  async getSession(sessionKey: string, modelId: string): Promise<ChatSession> {
    const genAI = await this.ensureInitialized();
    modelId = normalizeGeminiModelId(modelId);

    const existing = this.sessions.get(sessionKey);
    if (existing && existing.model === modelId) {
      return existing.chat;
    }

    // Create new session
    const model = genAI.getGenerativeModel({
      model: modelId,
      generationConfig: {
        maxOutputTokens: 8192,
        temperature: 0.7,
      }
    });

    const chat = model.startChat({
      history: [],
    });

    this.sessions.set(sessionKey, { chat, model: modelId, history: [] });
    this.log(`📝 Created new session: ${sessionKey} (model: ${modelId})`);

    return chat;
  }

  /**
   * Get the model instance for non-chat operations
   */
  async getModel(modelId: string): Promise<GenerativeModel> {
    const genAI = await this.ensureInitialized();
    modelId = normalizeGeminiModelId(modelId);
    return genAI.getGenerativeModel({
      model: modelId,
      generationConfig: {
        maxOutputTokens: 8192,
        temperature: 0.7,
      }
    });
  }

  /**
   * Clear a session's history
   */
  clearSession(sessionKey: string): void {
    const session = this.sessions.get(sessionKey);
    if (session) {
      // Create a fresh chat session with the same model
      this.sessions.delete(sessionKey);
      this.log(`🗑️ Cleared session: ${sessionKey}`);
    }
  }

  /**
   * Handle known Gemini API errors
   */
  private handleError(err: any): void {
    const errStr = String(err);

    if (errStr.includes("API_KEY_INVALID") || errStr.includes("INVALID_ARGUMENT")) {
      this.dashboardLog?.("error", "Invalid Gemini API Key. Please check your settings.", "error");
    } else if (errStr.includes("RESOURCE_EXHAUSTED") || errStr.includes("429")) {
      this.dashboardLog?.("warning", "Gemini rate limit reached. Please wait a moment.", "warning");
    } else if (errStr.includes("SAFETY")) {
      this.dashboardLog?.("warning", "Response blocked by Gemini safety filters.", "warning");
    } else {
      this.dashboardLog?.("error", `Gemini error: ${errStr.slice(0, 200)}`, "error");
    }
  }

  /**
   * Send a prompt and get a response (main API for UFO)
   */
  async sendPrompt(
    sessionKey: string,
    modelId: string,
    prompt: string,
    timeoutMs = 300000
  ): Promise<string> {
    modelId = normalizeGeminiModelId(modelId);
    this.log(`📤 [${sessionKey}] Sending prompt (${prompt.length} chars)...`);
    this.dashboardLog?.("info", `[${sessionKey}] Sending prompt (${prompt.length} chars)`, "info");

    const model = await this.getModel(modelId);

    try {
      // Use generateContent for single-turn requests (simpler, no session state)
      const result = await Promise.race([
        model.generateContent(prompt),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Gemini request timed out after ${timeoutMs}ms`)), timeoutMs)
        )
      ]);

      const response = result.response;
      const text = response.text();

      this.log(`📥 [${sessionKey}] Response received (${text.length} chars)`);
      this.dashboardLog?.("success", `[${sessionKey}] Response received (${text.length} chars)`, "success");

      return text;
    } catch (err: any) {
      this.log(`❌ [${sessionKey}] Error: ${err}`);
      this.handleError(err);
      throw err;
    }
  }

  /**
   * Send a chat message with history (for multi-turn conversations)
   */
  async sendChatMessage(
    sessionKey: string,
    modelId: string,
    message: string,
    systemPrompt?: string,
    timeoutMs = 300000
  ): Promise<string> {
    modelId = normalizeGeminiModelId(modelId);
    this.log(`📤 [${sessionKey}] Sending chat message (${message.length} chars)...`);

    const genAI = await this.ensureInitialized();

    // Get or create session
    let sessionData = this.sessions.get(sessionKey);
    if (!sessionData || sessionData.model !== modelId) {
      const model = genAI.getGenerativeModel({
        model: modelId,
        systemInstruction: systemPrompt,
        generationConfig: {
          maxOutputTokens: 8192,
          temperature: 0.7,
        }
      });

      const chat = model.startChat({
        history: sessionData?.history || [],
      });

      sessionData = { chat, model: modelId, history: sessionData?.history || [] };
      this.sessions.set(sessionKey, sessionData);
    }

    try {
      const result = await Promise.race([
        sessionData.chat.sendMessage(message),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Gemini request timed out after ${timeoutMs}ms`)), timeoutMs)
        )
      ]);

      const response = result.response;
      const text = response.text();

      // Update history
      sessionData.history.push({ role: "user", parts: [{ text: message }] });
      sessionData.history.push({ role: "model", parts: [{ text }] });

      this.log(`📥 [${sessionKey}] Response received (${text.length} chars)`);
      return text;
    } catch (err: any) {
      this.log(`❌ [${sessionKey}] Error: ${err}`);
      this.handleError(err);
      throw err;
    }
  }

  /**
   * Shutdown and cleanup
   */
  async shutdown(): Promise<void> {
    this.sessions.clear();
    this.genAI = null;
    this.log("🛑 Gemini client shut down");
  }

  /**
   * Check if API key is configured
   */
  isConfigured(): boolean {
    const config = vscode.workspace.getConfiguration("ufo");
    const apiKey = config.get<string>("gemini.apiKey") || process.env.GOOGLE_GEMINI_API_KEY || loadApiKeyFromEnv() || "";
    return !!apiKey;
  }
}

// Singleton instance
export const geminiClient = new GeminiManager();
