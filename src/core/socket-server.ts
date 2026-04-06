import * as net from "node:net";
import * as fs from "node:fs";
import * as path from "node:path";
import { SocketMessageSchema, type SocketMessage } from "../types.js";

export class SocketServer {
  private server: net.Server | null = null;
  private sockPath: string;
  private agentSockets: Map<string, net.Socket> = new Map();

  onRegister: (socket: net.Socket, msg: { task: string; branch?: string }) => string = () => "";
  onOutput: (agentId: string, data: string) => void = () => {};
  onStatus: (agentId: string, status: string, exitCode: number) => void = () => {};
  onDisconnect: (agentId: string) => void = () => {};

  constructor(private projectRoot: string) {
    this.sockPath = path.join(projectRoot, ".orra", "orra.sock");
  }

  async start(): Promise<void> {
    try { fs.unlinkSync(this.sockPath); } catch {}

    this.server = net.createServer((socket) => this.handleConnection(socket));

    return new Promise<void>((resolve, reject) => {
      this.server!.listen(this.sockPath, () => resolve());
      this.server!.on("error", reject);
    });
  }

  async stop(): Promise<void> {
    for (const [, socket] of this.agentSockets) {
      socket.destroy();
    }
    this.agentSockets.clear();

    return new Promise<void>((resolve) => {
      if (!this.server) { resolve(); return; }
      this.server.close(() => {
        try { fs.unlinkSync(this.sockPath); } catch {}
        resolve();
      });
    });
  }

  sendToAgent(agentId: string, message: SocketMessage): boolean {
    const socket = this.agentSockets.get(agentId);
    if (!socket || socket.destroyed) return false;
    socket.write(JSON.stringify(message) + "\n");
    return true;
  }

  isAgentConnected(agentId: string): boolean {
    const socket = this.agentSockets.get(agentId);
    return !!socket && !socket.destroyed;
  }

  private handleConnection(socket: net.Socket): void {
    let agentId: string | null = null;
    let buffer = "";

    socket.on("data", (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop()!;

      for (const line of lines) {
        if (line.trim().length === 0) continue;
        try {
          const msg = SocketMessageSchema.parse(JSON.parse(line));
          this.handleMessage(socket, msg, agentId, (id) => { agentId = id; });
        } catch {}
      }
    });

    socket.on("close", () => {
      if (agentId) {
        this.agentSockets.delete(agentId);
        this.onDisconnect(agentId);
      }
    });

    socket.on("error", () => {
      if (agentId) {
        this.agentSockets.delete(agentId);
        this.onDisconnect(agentId);
      }
    });
  }

  private handleMessage(
    socket: net.Socket, msg: SocketMessage,
    agentId: string | null, setAgentId: (id: string) => void
  ): void {
    switch (msg.type) {
      case "register": {
        const id = this.onRegister(socket, { task: msg.task, branch: msg.branch });
        setAgentId(id);
        this.agentSockets.set(id, socket);
        socket.write(JSON.stringify({ type: "registered", agentId: id }) + "\n");
        break;
      }
      case "output": {
        if (agentId) this.onOutput(agentId, msg.data);
        break;
      }
      case "status": {
        if (agentId) this.onStatus(agentId, msg.status, msg.exitCode);
        break;
      }
      default: break;
    }
  }
}
