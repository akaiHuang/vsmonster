import WebSocket from "ws";
import { EventEmitter } from "events";

export class GatewayClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;
  private readonly reconnectDelayMs = 3000;
  private pingInterval: NodeJS.Timer | null = null;

  constructor(baseUrl: string) {
    super();
    const normalized = baseUrl.startsWith("ws")
      ? baseUrl
      : baseUrl.replace(/^http/, "ws");
    const trimmed = normalized.replace(/\/+$/, "");
    this.url = `${trimmed}/vscode?client=ufo`;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);

        this.ws.on("open", () => {
          this.reconnectAttempts = 0;
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
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.emit("reconnect_failed");
      return;
    }

    this.reconnectAttempts += 1;
    await new Promise((resolve) => setTimeout(resolve, this.reconnectDelayMs));

    try {
      await this.connect();
    } catch {
      // Retry again on next close event.
    }
  }
}
