import WebSocket from "ws";
import { EventEmitter } from "events";

export class GatewayClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = Number.POSITIVE_INFINITY;
  private readonly baseReconnectDelayMs = 1500;
  private readonly maxReconnectDelayMs = 30000;
  private pingInterval: NodeJS.Timer | null = null;
  private healthCheckTimer: NodeJS.Timer | null = null;
  private shouldReconnect = true;
  private isReconnecting = false;

  constructor(baseUrl: string) {
    super();
    const normalized = baseUrl.startsWith("ws")
      ? baseUrl
      : baseUrl.replace(/^http/, "ws");
    const trimmed = normalized.replace(/\/+$/, "");
    this.url = `${trimmed}/vscode?client=ufo`;
  }

  async connect(): Promise<void> {
    this.shouldReconnect = true;

    // Close any existing connection before creating a new one
    if (this.ws) {
      try {
        this.ws.removeAllListeners();
        this.ws.close();
      } catch {}
      this.ws = null;
    }

    return new Promise((resolve, reject) => {
      try {
        const ws = new WebSocket(this.url);
        this.ws = ws;
        let settled = false;

        ws.on("open", () => {
          this.reconnectAttempts = 0;
          this.isReconnecting = false;
          this.startPingInterval();
          this.startHealthCheck();
          this.emit("connected");
          if (!settled) { settled = true; resolve(); }
        });

        ws.on("message", (data: WebSocket.Data) => {
          try {
            const message = JSON.parse(data.toString());
            this.emit("message", message);
          } catch (error) {
            this.emit("error", error);
          }
        });

        // Respond to server's protocol-level pings explicitly (belt and suspenders)
        ws.on("ping", () => {
          try { ws.pong(); } catch {}
        });

        ws.on("close", (code: number, reason: Buffer) => {
          this.stopPingInterval();
          this.stopHealthCheck();
          const reasonStr = reason?.toString() || "";
          this.emit("disconnected", { code, reason: reasonStr });
          // Only reconnect from close, not from error (avoid double reconnect)
          this.attemptReconnect().catch(() => undefined);
        });

        ws.on("error", (error) => {
          this.emit("error", error);
          if (!settled) { settled = true; reject(error); }
          // For initial connection failures, "close" isn't guaranteed to fire promptly.
          // Trigger reconnect here too; isReconnecting guards against double attempts.
          this.attemptReconnect().catch(() => undefined);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  disconnect(): void {
    this.stopPingInterval();
    this.stopHealthCheck();
    this.reconnectAttempts = this.maxReconnectAttempts;
    this.shouldReconnect = false;

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * Force disconnect and immediately reconnect.
   * Used when user manually triggers a refresh/reconnect.
   */
  async forceReconnect(): Promise<void> {
    // Reset state
    this.stopPingInterval();
    this.stopHealthCheck();
    this.reconnectAttempts = 0;
    this.isReconnecting = false;
    this.shouldReconnect = true;

    // Close existing connection
    if (this.ws) {
      try {
        this.ws.removeAllListeners();
        this.ws.close();
      } catch {}
      this.ws = null;
    }

    // Reconnect immediately
    await this.connect();
  }

  send(message: object): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  private startPingInterval(): void {
    this.stopPingInterval();
    this.pingInterval = setInterval(() => {
      if (this.isConnected()) {
        this.send({ type: "ping" });
      }
    }, 25000); // 25s — shorter than server's 30s heartbeat
  }

  private stopPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval as any);
      this.pingInterval = null;
    }
  }

  /**
   * Periodic check: if ws exists but isn't OPEN, force cleanup and reconnect.
   * Catches zombie connections that lost TCP without a close event.
   */
  private startHealthCheck(): void {
    this.stopHealthCheck();
    this.healthCheckTimer = setInterval(() => {
      if (!this.ws) { return; }
      if (this.ws.readyState === WebSocket.CLOSING || this.ws.readyState === WebSocket.CLOSED) {
        this.emit("health_check_failed", { readyState: this.ws.readyState });
        try { this.ws.removeAllListeners(); this.ws.terminate(); } catch {}
        this.ws = null;
        this.stopPingInterval();
        this.stopHealthCheck();
        this.attemptReconnect().catch(() => undefined);
      }
    }, 10000);
  }

  private stopHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer as any);
      this.healthCheckTimer = null;
    }
  }

  private async attemptReconnect(): Promise<void> {
    if (!this.shouldReconnect) {
      return;
    }
    if (this.isReconnecting) {
      return; // Already reconnecting, skip duplicate attempts
    }
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.emit("reconnect_failed");
      return;
    }

    this.isReconnecting = true;
    this.reconnectAttempts += 1;
    const delay = this.computeReconnectDelayMs(this.reconnectAttempts);
    this.emit("reconnecting", { attempt: this.reconnectAttempts, delayMs: delay });
    await new Promise((resolve) => setTimeout(resolve, delay));

    try {
      await this.connect();
    } catch {
      this.isReconnecting = false; // Allow next close event to trigger reconnect
    }
  }

  private computeReconnectDelayMs(attempt: number): number {
    const exponential = this.baseReconnectDelayMs * Math.pow(2, Math.max(0, attempt - 1));
    const jitter = Math.random() * 500;
    return Math.min(this.maxReconnectDelayMs, exponential + jitter);
  }
}
