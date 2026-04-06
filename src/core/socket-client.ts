import * as net from "node:net";
import * as path from "node:path";
import { SocketMessageSchema, type SocketMessage } from "../types.js";

export class SocketClient {
  private socket: net.Socket | null = null;
  private sockPath: string;

  onMessage: (msg: SocketMessage) => void = () => {};
  onDisconnect: () => void = () => {};

  constructor(private projectRoot: string) {
    this.sockPath = path.join(projectRoot, ".orra", "orra.sock");
  }

  async connect(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.socket = net.createConnection(this.sockPath, () => {
        resolve();
      });

      this.socket.on("error", (err) => {
        reject(err);
      });

      let buffer = "";
      this.socket.on("data", (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop()!;

        for (const line of lines) {
          if (line.trim().length === 0) continue;
          try {
            const msg = SocketMessageSchema.parse(JSON.parse(line));
            this.onMessage(msg);
          } catch {}
        }
      });

      this.socket.on("close", () => {
        this.socket = null;
        this.onDisconnect();
      });
    });
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
  }

  isConnected(): boolean {
    return this.socket !== null && !this.socket.destroyed;
  }

  sendRegister(task: string, branch?: string): void {
    this.send({ type: "register", task, branch });
  }

  sendOutput(data: string): void {
    this.send({ type: "output", data });
  }

  sendStatus(status: "completed" | "failed", exitCode: number): void {
    this.send({ type: "status", status, exitCode });
  }

  private send(msg: Record<string, unknown>): void {
    if (!this.socket || this.socket.destroyed) {
      throw new Error("Not connected to orchestrator");
    }
    this.socket.write(JSON.stringify(msg) + "\n");
  }
}
