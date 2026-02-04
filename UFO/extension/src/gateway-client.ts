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
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);

        this.ws.on("open", () => {
          this.reconnectAttempts = 0;
          this.isReconnecting = false;
          this.startPingInterval();
          this.emit("connected");
          resolve();
        });

        this.ws.on("message", (data: WebSocket.Data) => {
          try {
            const message = JSON.parse(data.toString());
            this.emit("message", message);
          } catch (error) {
            this.emit("error", error);
          }
        });

        this.ws.on("close", () => {
          this.stopPingInterval();
          this.emit("disconnected");
          this.attemptReconnect().catch(() => undefined);
        });

        this.ws.on("error", (error) => {
          this.emit("error", error);
          this.attemptReconnect().catch(() => undefined);
          reject(error);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  disconnect(): void {
    this.stopPingInterval();
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

  send(message: object): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  private startPingInterval(): void {
    this.pingInterval = setInterval(() => {
      if (this.isConnected()) {
        this.send({ type: "ping" });
      }
    }, 30000);
  }

  private stopPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval as any);
      this.pingInterval = null;
    }
  }

  private async attemptReconnect(): Promise<void> {
    if (!this.shouldReconnect) {
      return;
    }
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.emit("reconnect_failed");
      return;
    }

    this.reconnectAttempts += 1;
    const delay = this.computeReconnectDelayMs(this.reconnectAttempts);
    this.isReconnecting = true;
    this.emit("reconnecting", { attempt: this.reconnectAttempts, delayMs: delay });
    await new Promise((resolve) => setTimeout(resolve, delay));

    try {
      await this.connect();
    } catch {
      // Retry again on next close event.
    }
  }

  private computeReconnectDelayMs(attempt: number): number {
    const exponential = this.baseReconnectDelayMs * Math.pow(2, Math.max(0, attempt - 1));
    const jitter = Math.random() * 500;
    return Math.min(this.maxReconnectDelayMs, exponential + jitter);
  }
}
