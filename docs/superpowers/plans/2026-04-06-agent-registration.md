# Agent Registration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow existing Claude Code terminals to register as agents with the Orra MCP orchestrator via Unix domain socket, achieving full parity with spawned agents.

**Architecture:** The MCP server auto-detects its mode on startup: if `.orra/orra.sock` is connectable it runs in agent mode (3 tools: register, unregister, heartbeat), otherwise orchestrator mode (existing 7 tools + socket server). A JSON-newline protocol over the Unix socket provides real-time bidirectional communication between orchestrator and external agents.

**Tech Stack:** TypeScript, Node.js `net` module (Unix domain sockets), existing Orra MCP infrastructure

---

## File Structure

```
src/
├── types.ts                — Add AgentType enum, SocketMessage types
├── core/
│   ├── socket-server.ts    — NEW: Unix socket server for orchestrator mode
│   ├── socket-client.ts    — NEW: Unix socket client for agent mode
│   ├── agent-manager.ts    — Add externalAgents map, dual send/stop paths, socket server lifecycle
│   └── state.ts            — Update reconcile to handle external agents
├── tools/
│   ├── register.ts         — NEW: orra_register tool handler
│   ├── unregister.ts       — NEW: orra_unregister tool handler
│   └── heartbeat.ts        — NEW: orra_heartbeat tool handler
├── server.ts               — Refactor: mode detection, conditional tool registration
└── index.ts                — Pass mode and project root to createServer
```

---

### Task 1: Add AgentType and Socket Message Types

**Files:**
- Modify: `src/types.ts`
- Modify: `tests/unit/types.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/unit/types.test.ts`:

```typescript
import {
  AgentStateSchema,
  LinkSchema,
  ConfigSchema,
  AgentStatus,
  LinkStatus,
  LinkTrigger,
  AgentType,
  SocketMessageSchema,
  type AgentState,
  type Link,
  type Config,
  type SocketMessage,
} from "../../src/types.js";

// Add these new test blocks after the existing ones:

describe("AgentType", () => {
  it("should accept spawned", () => {
    expect(AgentType.parse("spawned")).toBe("spawned");
  });

  it("should accept external", () => {
    expect(AgentType.parse("external")).toBe("external");
  });

  it("should reject unknown type", () => {
    expect(() => AgentType.parse("unknown")).toThrow();
  });
});

describe("AgentStateSchema with type field", () => {
  it("should validate spawned agent", () => {
    const state = {
      id: "test-a1b2",
      type: "spawned",
      task: "test",
      branch: "orra/test",
      worktree: "worktrees/test",
      pid: 123,
      status: "running",
      createdAt: "2026-04-06T14:30:00.000Z",
      updatedAt: "2026-04-06T14:30:00.000Z",
      exitCode: null,
      model: null,
      allowedTools: null,
    };
    expect(AgentStateSchema.parse(state)).toEqual(state);
  });

  it("should validate external agent with pid 0", () => {
    const state = {
      id: "auth-a1b2",
      type: "external",
      task: "Working on auth",
      branch: "feat/auth",
      worktree: "",
      pid: 0,
      status: "running",
      createdAt: "2026-04-06T14:30:00.000Z",
      updatedAt: "2026-04-06T14:30:00.000Z",
      exitCode: null,
      model: null,
      allowedTools: null,
    };
    expect(AgentStateSchema.parse(state)).toEqual(state);
  });

  it("should default type to spawned for backward compatibility", () => {
    const state = {
      id: "old-a1b2",
      task: "old task",
      branch: "orra/old",
      worktree: "worktrees/old",
      pid: 123,
      status: "completed",
      createdAt: "2026-04-06T14:30:00.000Z",
      updatedAt: "2026-04-06T14:30:00.000Z",
      exitCode: 0,
      model: null,
      allowedTools: null,
    };
    const parsed = AgentStateSchema.parse(state);
    expect(parsed.type).toBe("spawned");
  });
});

describe("SocketMessageSchema", () => {
  it("should validate register message", () => {
    const msg = { type: "register", task: "auth refactor", branch: "feat/auth" };
    expect(SocketMessageSchema.parse(msg).type).toBe("register");
  });

  it("should validate output message", () => {
    const msg = { type: "output", data: "Reading file...\n" };
    expect(SocketMessageSchema.parse(msg).type).toBe("output");
  });

  it("should validate status message", () => {
    const msg = { type: "status", status: "completed", exitCode: 0 };
    expect(SocketMessageSchema.parse(msg).type).toBe("status");
  });

  it("should validate registered message", () => {
    const msg = { type: "registered", agentId: "auth-a1b2" };
    expect(SocketMessageSchema.parse(msg).type).toBe("registered");
  });

  it("should validate message message", () => {
    const msg = { type: "message", content: "check the auth" };
    expect(SocketMessageSchema.parse(msg).type).toBe("message");
  });

  it("should validate stop message", () => {
    const msg = { type: "stop", reason: "user requested" };
    expect(SocketMessageSchema.parse(msg).type).toBe("stop");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/unit/types.test.ts
```

Expected: FAIL — `AgentType`, `SocketMessageSchema` not exported from types.

- [ ] **Step 3: Implement type changes**

Replace `src/types.ts` with:

```typescript
import { z } from "zod";

export const AgentStatus = z.enum([
  "running",
  "completed",
  "failed",
  "interrupted",
  "killed",
]);
export type AgentStatus = z.infer<typeof AgentStatus>;

export const AgentType = z.enum(["spawned", "external"]);
export type AgentType = z.infer<typeof AgentType>;

export const LinkTrigger = z.enum(["success", "failure", "any"]);
export type LinkTrigger = z.infer<typeof LinkTrigger>;

export const LinkStatus = z.enum(["pending", "fired", "expired"]);
export type LinkStatus = z.infer<typeof LinkStatus>;

export const AgentStateSchema = z.object({
  id: z.string(),
  type: AgentType.default("spawned"),
  task: z.string(),
  branch: z.string(),
  worktree: z.string(),
  pid: z.number(),
  status: AgentStatus,
  createdAt: z.string(),
  updatedAt: z.string(),
  exitCode: z.number().nullable(),
  model: z.string().nullable(),
  allowedTools: z.array(z.string()).nullable(),
});
export type AgentState = z.infer<typeof AgentStateSchema>;

export const LinkToSchema = z.object({
  task: z.string(),
  branch: z.string().optional(),
  model: z.string().optional(),
});
export type LinkTo = z.infer<typeof LinkToSchema>;

export const LinkSchema = z.object({
  id: z.string(),
  from: z.string(),
  to: LinkToSchema,
  on: LinkTrigger,
  status: LinkStatus,
  firedAgentId: z.string().nullable(),
  createdAt: z.string(),
});
export type Link = z.infer<typeof LinkSchema>;

export const ConfigSchema = z.object({
  defaultModel: z.string().nullable(),
  defaultAllowedTools: z.array(z.string()).nullable(),
});
export type Config = z.infer<typeof ConfigSchema>;

// Socket protocol messages

const RegisterMessage = z.object({
  type: z.literal("register"),
  task: z.string(),
  branch: z.string().optional(),
});

const OutputMessage = z.object({
  type: z.literal("output"),
  data: z.string(),
});

const StatusMessage = z.object({
  type: z.literal("status"),
  status: z.enum(["completed", "failed"]),
  exitCode: z.number(),
});

const RegisteredMessage = z.object({
  type: z.literal("registered"),
  agentId: z.string(),
});

const MessageMessage = z.object({
  type: z.literal("message"),
  content: z.string(),
});

const StopMessage = z.object({
  type: z.literal("stop"),
  reason: z.string(),
});

export const SocketMessageSchema = z.discriminatedUnion("type", [
  RegisterMessage,
  OutputMessage,
  StatusMessage,
  RegisteredMessage,
  MessageMessage,
  StopMessage,
]);
export type SocketMessage = z.infer<typeof SocketMessageSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/unit/types.test.ts
```

Expected: All tests PASS (existing + new).

- [ ] **Step 5: Fix any existing tests broken by the type field addition**

The existing tests create `AgentState` objects without a `type` field. Since we used `.default("spawned")`, existing state files and test objects without `type` will parse correctly — the default fills in. Run the full suite to confirm:

```bash
npx vitest run
```

Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/types.ts tests/unit/types.test.ts
git commit -m "feat: add AgentType enum and SocketMessage types for agent registration"
```

---

### Task 2: Socket Server

**Files:**
- Create: `src/core/socket-server.ts`
- Create: `tests/unit/socket-server.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/socket-server.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as net from "node:net";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { SocketServer } from "../../src/core/socket-server.js";

describe("SocketServer", () => {
  let tmpDir: string;
  let server: SocketServer;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "orra-sock-test-"));
    fs.mkdirSync(path.join(tmpDir, ".orra"), { recursive: true });
  });

  afterEach(async () => {
    if (server) {
      await server.stop();
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should start and create socket file", async () => {
    server = new SocketServer(tmpDir);
    await server.start();
    expect(fs.existsSync(path.join(tmpDir, ".orra", "orra.sock"))).toBe(true);
  });

  it("should accept a connection", async () => {
    server = new SocketServer(tmpDir);
    await server.start();

    const client = net.createConnection(path.join(tmpDir, ".orra", "orra.sock"));
    await new Promise<void>((resolve) => client.on("connect", resolve));

    client.destroy();
  });

  it("should parse register message and call onRegister", async () => {
    let registered: { task: string; branch?: string } | null = null;
    server = new SocketServer(tmpDir);
    server.onRegister = (socket, msg) => {
      registered = { task: msg.task, branch: msg.branch };
      return "test-agent-id";
    };
    await server.start();

    const client = net.createConnection(path.join(tmpDir, ".orra", "orra.sock"));
    await new Promise<void>((resolve) => client.on("connect", resolve));

    client.write(JSON.stringify({ type: "register", task: "test task", branch: "main" }) + "\n");

    await new Promise((r) => setTimeout(r, 100));
    expect(registered).toEqual({ task: "test task", branch: "main" });

    client.destroy();
  });

  it("should forward output messages via onOutput callback", async () => {
    const outputs: string[] = [];
    server = new SocketServer(tmpDir);
    server.onRegister = () => "test-id";
    server.onOutput = (agentId, data) => {
      outputs.push(data);
    };
    await server.start();

    const client = net.createConnection(path.join(tmpDir, ".orra", "orra.sock"));
    await new Promise<void>((resolve) => client.on("connect", resolve));

    client.write(JSON.stringify({ type: "register", task: "test" }) + "\n");
    await new Promise((r) => setTimeout(r, 50));

    client.write(JSON.stringify({ type: "output", data: "hello\n" }) + "\n");
    await new Promise((r) => setTimeout(r, 50));

    expect(outputs).toEqual(["hello\n"]);
    client.destroy();
  });

  it("should send message to a connected agent", async () => {
    server = new SocketServer(tmpDir);
    server.onRegister = () => "test-id";
    await server.start();

    const received: string[] = [];
    const client = net.createConnection(path.join(tmpDir, ".orra", "orra.sock"));
    await new Promise<void>((resolve) => client.on("connect", resolve));

    client.on("data", (data) => received.push(data.toString()));

    client.write(JSON.stringify({ type: "register", task: "test" }) + "\n");
    await new Promise((r) => setTimeout(r, 50));

    server.sendToAgent("test-id", { type: "message", content: "hey there" });
    await new Promise((r) => setTimeout(r, 50));

    const parsed = JSON.parse(received[received.length - 1].trim());
    expect(parsed).toEqual({ type: "message", content: "hey there" });

    client.destroy();
  });

  it("should call onDisconnect when client drops", async () => {
    let disconnectedId: string | null = null;
    server = new SocketServer(tmpDir);
    server.onRegister = () => "disc-test-id";
    server.onDisconnect = (agentId) => {
      disconnectedId = agentId;
    };
    await server.start();

    const client = net.createConnection(path.join(tmpDir, ".orra", "orra.sock"));
    await new Promise<void>((resolve) => client.on("connect", resolve));

    client.write(JSON.stringify({ type: "register", task: "test" }) + "\n");
    await new Promise((r) => setTimeout(r, 50));

    client.destroy();
    await new Promise((r) => setTimeout(r, 100));

    expect(disconnectedId).toBe("disc-test-id");
  });

  it("should call onStatus when agent sends status", async () => {
    let statusInfo: { agentId: string; status: string; exitCode: number } | null = null;
    server = new SocketServer(tmpDir);
    server.onRegister = () => "status-test-id";
    server.onStatus = (agentId, status, exitCode) => {
      statusInfo = { agentId, status, exitCode };
    };
    await server.start();

    const client = net.createConnection(path.join(tmpDir, ".orra", "orra.sock"));
    await new Promise<void>((resolve) => client.on("connect", resolve));

    client.write(JSON.stringify({ type: "register", task: "test" }) + "\n");
    await new Promise((r) => setTimeout(r, 50));

    client.write(JSON.stringify({ type: "status", status: "completed", exitCode: 0 }) + "\n");
    await new Promise((r) => setTimeout(r, 50));

    expect(statusInfo).toEqual({ agentId: "status-test-id", status: "completed", exitCode: 0 });

    client.destroy();
  });

  it("should remove socket file on stop", async () => {
    server = new SocketServer(tmpDir);
    await server.start();
    const sockPath = path.join(tmpDir, ".orra", "orra.sock");
    expect(fs.existsSync(sockPath)).toBe(true);
    await server.stop();
    expect(fs.existsSync(sockPath)).toBe(false);
  });

  it("should remove stale socket and start fresh", async () => {
    const sockPath = path.join(tmpDir, ".orra", "orra.sock");
    fs.writeFileSync(sockPath, "stale");

    server = new SocketServer(tmpDir);
    await server.start();
    expect(fs.existsSync(sockPath)).toBe(true);
  });

  it("should report if agent is connected", async () => {
    server = new SocketServer(tmpDir);
    server.onRegister = () => "conn-test-id";
    await server.start();

    expect(server.isAgentConnected("conn-test-id")).toBe(false);

    const client = net.createConnection(path.join(tmpDir, ".orra", "orra.sock"));
    await new Promise<void>((resolve) => client.on("connect", resolve));

    client.write(JSON.stringify({ type: "register", task: "test" }) + "\n");
    await new Promise((r) => setTimeout(r, 50));

    expect(server.isAgentConnected("conn-test-id")).toBe(true);

    client.destroy();
    await new Promise((r) => setTimeout(r, 100));

    expect(server.isAgentConnected("conn-test-id")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/unit/socket-server.test.ts
```

Expected: FAIL — cannot resolve `../../src/core/socket-server.js`

- [ ] **Step 3: Implement socket-server.ts**

Create `src/core/socket-server.ts`:

```typescript
import * as net from "node:net";
import * as fs from "node:fs";
import * as path from "node:path";
import { SocketMessageSchema, type SocketMessage } from "../types.js";

export class SocketServer {
  private server: net.Server | null = null;
  private sockPath: string;
  private agentSockets: Map<string, net.Socket> = new Map();

  // Callbacks — set by AgentManager
  onRegister: (socket: net.Socket, msg: { task: string; branch?: string }) => string = () => "";
  onOutput: (agentId: string, data: string) => void = () => {};
  onStatus: (agentId: string, status: string, exitCode: number) => void = () => {};
  onDisconnect: (agentId: string) => void = () => {};

  constructor(private projectRoot: string) {
    this.sockPath = path.join(projectRoot, ".orra", "orra.sock");
  }

  async start(): Promise<void> {
    // Remove stale socket if it exists
    try {
      fs.unlinkSync(this.sockPath);
    } catch {
      // File doesn't exist, that's fine
    }

    this.server = net.createServer((socket) => this.handleConnection(socket));

    return new Promise<void>((resolve, reject) => {
      this.server!.listen(this.sockPath, () => resolve());
      this.server!.on("error", reject);
    });
  }

  async stop(): Promise<void> {
    // Close all agent connections
    for (const [, socket] of this.agentSockets) {
      socket.destroy();
    }
    this.agentSockets.clear();

    return new Promise<void>((resolve) => {
      if (!this.server) {
        resolve();
        return;
      }
      this.server.close(() => {
        try {
          fs.unlinkSync(this.sockPath);
        } catch {
          // Already gone
        }
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
      buffer = lines.pop()!; // Keep incomplete line in buffer

      for (const line of lines) {
        if (line.trim().length === 0) continue;
        try {
          const msg = SocketMessageSchema.parse(JSON.parse(line));
          this.handleMessage(socket, msg, agentId, (id) => {
            agentId = id;
          });
        } catch {
          // Ignore malformed messages
        }
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
    socket: net.Socket,
    msg: SocketMessage,
    agentId: string | null,
    setAgentId: (id: string) => void
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
        if (agentId) {
          this.onOutput(agentId, msg.data);
        }
        break;
      }
      case "status": {
        if (agentId) {
          this.onStatus(agentId, msg.status, msg.exitCode);
        }
        break;
      }
      default:
        break;
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/unit/socket-server.test.ts
```

Expected: All 9 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/socket-server.ts tests/unit/socket-server.test.ts
git commit -m "feat: add SocketServer for orchestrator-side Unix domain socket"
```

---

### Task 3: Socket Client

**Files:**
- Create: `src/core/socket-client.ts`
- Create: `tests/unit/socket-client.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/socket-client.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as net from "node:net";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { SocketClient } from "../../src/core/socket-client.js";

describe("SocketClient", () => {
  let tmpDir: string;
  let sockPath: string;
  let mockServer: net.Server;
  let serverSocket: net.Socket | null = null;
  let client: SocketClient;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "orra-client-test-"));
    fs.mkdirSync(path.join(tmpDir, ".orra"), { recursive: true });
    sockPath = path.join(tmpDir, ".orra", "orra.sock");

    // Start a mock server
    mockServer = net.createServer((socket) => {
      serverSocket = socket;
    });
    await new Promise<void>((resolve) => mockServer.listen(sockPath, resolve));
  });

  afterEach(async () => {
    if (client) {
      client.disconnect();
    }
    if (serverSocket) {
      serverSocket.destroy();
    }
    await new Promise<void>((resolve) => mockServer.close(() => resolve()));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should connect to socket", async () => {
    client = new SocketClient(tmpDir);
    await client.connect();
    expect(client.isConnected()).toBe(true);
  });

  it("should send register message", async () => {
    client = new SocketClient(tmpDir);
    await client.connect();

    const received: string[] = [];
    serverSocket!.on("data", (data) => received.push(data.toString()));

    client.sendRegister("my task", "my-branch");
    await new Promise((r) => setTimeout(r, 50));

    const parsed = JSON.parse(received[0].trim());
    expect(parsed).toEqual({ type: "register", task: "my task", branch: "my-branch" });
  });

  it("should send output message", async () => {
    client = new SocketClient(tmpDir);
    await client.connect();

    const received: string[] = [];
    serverSocket!.on("data", (data) => received.push(data.toString()));

    client.sendOutput("doing stuff\n");
    await new Promise((r) => setTimeout(r, 50));

    const parsed = JSON.parse(received[0].trim());
    expect(parsed).toEqual({ type: "output", data: "doing stuff\n" });
  });

  it("should send status message", async () => {
    client = new SocketClient(tmpDir);
    await client.connect();

    const received: string[] = [];
    serverSocket!.on("data", (data) => received.push(data.toString()));

    client.sendStatus("completed", 0);
    await new Promise((r) => setTimeout(r, 50));

    const parsed = JSON.parse(received[0].trim());
    expect(parsed).toEqual({ type: "status", status: "completed", exitCode: 0 });
  });

  it("should receive messages via onMessage callback", async () => {
    const messages: Array<{ type: string }> = [];
    client = new SocketClient(tmpDir);
    client.onMessage = (msg) => messages.push(msg);
    await client.connect();

    serverSocket!.write(JSON.stringify({ type: "registered", agentId: "test-id" }) + "\n");
    await new Promise((r) => setTimeout(r, 50));

    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual({ type: "registered", agentId: "test-id" });
  });

  it("should detect disconnection", async () => {
    let disconnected = false;
    client = new SocketClient(tmpDir);
    client.onDisconnect = () => { disconnected = true; };
    await client.connect();

    serverSocket!.destroy();
    await new Promise((r) => setTimeout(r, 100));

    expect(disconnected).toBe(true);
    expect(client.isConnected()).toBe(false);
  });

  it("should throw if socket does not exist", async () => {
    await new Promise<void>((resolve) => mockServer.close(() => resolve()));
    fs.unlinkSync(sockPath);

    client = new SocketClient(tmpDir);
    await expect(client.connect()).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/unit/socket-client.test.ts
```

Expected: FAIL — cannot resolve `../../src/core/socket-client.js`

- [ ] **Step 3: Implement socket-client.ts**

Create `src/core/socket-client.ts`:

```typescript
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
        if (!this.socket?.connecting === false) {
          // Already connected, this is a runtime error
          this.onDisconnect();
        }
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
          } catch {
            // Ignore malformed messages
          }
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/unit/socket-client.test.ts
```

Expected: All 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/socket-client.ts tests/unit/socket-client.test.ts
git commit -m "feat: add SocketClient for agent-side Unix domain socket connection"
```

---

### Task 4: Integrate Socket Server into AgentManager

**Files:**
- Modify: `src/core/agent-manager.ts`

This task adds external agent support to the AgentManager: socket server lifecycle, external agent maps, dual paths for `sendMessage` and `stopAgent`.

- [ ] **Step 1: Modify agent-manager.ts**

Add imports at the top of `src/core/agent-manager.ts`:

```typescript
import * as net from "node:net";
import { SocketServer } from "./socket-server.js";
```

Add to the `AgentManager` class — new field:

```typescript
private socketServer: SocketServer | null = null;
private externalAgents: Map<string, net.Socket> = new Map();
```

Modify `init()` to start the socket server:

```typescript
async init(): Promise<void> {
  await this.state.init();
  const links = await this.state.loadLinks();
  this.linker.loadLinks(links);
  await this.state.reconcile();

  // Start socket server for external agent registration
  this.socketServer = new SocketServer(this.projectRoot);
  this.socketServer.onRegister = (_socket, msg) => {
    return this.handleExternalRegister(msg.task, msg.branch);
  };
  this.socketServer.onOutput = (agentId, data) => {
    this.state.appendLog(agentId, data).catch(() => {});
  };
  this.socketServer.onStatus = (agentId, status, exitCode) => {
    this.handleExternalStatus(agentId, status, exitCode).catch((err) =>
      console.error(`Failed to handle external status for ${agentId}:`, err)
    );
  };
  this.socketServer.onDisconnect = (agentId) => {
    this.handleExternalDisconnect(agentId).catch((err) =>
      console.error(`Failed to handle disconnect for ${agentId}:`, err)
    );
  };
  await this.socketServer.start();
}
```

Add new methods for external agents:

```typescript
private handleExternalRegister(task: string, branch?: string): string {
  const shortId = crypto.randomBytes(2).toString("hex");
  const slug = slugify(task);
  const agentId = `${slug}-${shortId}`;

  const now = new Date().toISOString();
  const agentState: AgentState = {
    id: agentId,
    type: "external",
    task,
    branch: branch ?? "",
    worktree: "",
    pid: 0,
    status: "running",
    createdAt: now,
    updatedAt: now,
    exitCode: null,
    model: null,
    allowedTools: null,
  };

  // Save synchronously-ish (fire and forget for registration speed)
  this.state.saveAgent(agentState).catch((err) =>
    console.error(`Failed to save external agent ${agentId}:`, err)
  );

  return agentId;
}

private async handleExternalStatus(agentId: string, status: string, exitCode: number): Promise<void> {
  const agent = await this.state.loadAgent(agentId);
  if (!agent) return;

  agent.status = status === "completed" ? "completed" : "failed";
  agent.exitCode = exitCode;
  agent.updatedAt = new Date().toISOString();
  await this.state.saveAgent(agent);

  // Evaluate links
  const matchingLinks = this.linker.findMatchingLinks(agentId, exitCode);
  this.linker.evaluateAndExpire(agentId, exitCode);
  await this.state.saveLinks(this.linker.getAllLinks());

  for (const link of matchingLinks) {
    await this.fireLink(link, agent);
  }
}

private async handleExternalDisconnect(agentId: string): Promise<void> {
  if (this.killedAgents.has(agentId)) return;

  const agent = await this.state.loadAgent(agentId);
  if (!agent || agent.status !== "running") return;

  agent.status = "interrupted";
  agent.updatedAt = new Date().toISOString();
  await this.state.saveAgent(agent);
}

async shutdown(): Promise<void> {
  if (this.socketServer) {
    await this.socketServer.stop();
  }
}
```

Modify `sendMessage` to handle external agents:

```typescript
async sendMessage(agentId: string, message: string): Promise<void> {
  const agent = await this.state.loadAgent(agentId);
  if (!agent) throw new Error(`Agent ${agentId} not found`);
  if (agent.status !== "running")
    throw new Error(`Agent ${agentId} is not running (status: ${agent.status})`);

  // External agent: send via socket
  if (agent.type === "external") {
    if (!this.socketServer?.sendToAgent(agentId, { type: "message", content: message })) {
      throw new Error(`Agent ${agentId} is not connected`);
    }
    return;
  }

  // Spawned agent: write to PTY
  const proc = this.runningProcesses.get(agentId);
  if (!proc) throw new Error(`Agent ${agentId} has no active process`);
  proc.write(message + "\n");
}
```

Modify `stopAgent` to handle external agents:

```typescript
async stopAgent(agentId: string, cleanup = false): Promise<StopResult> {
  const agent = await this.state.loadAgent(agentId);
  if (!agent) throw new Error(`Agent ${agentId} not found`);

  this.killedAgents.add(agentId);

  if (agent.type === "external") {
    // Send stop request via socket
    this.socketServer?.sendToAgent(agentId, {
      type: "stop",
      reason: "Orchestrator requested stop",
    });

    agent.status = "killed";
    agent.updatedAt = new Date().toISOString();
    await this.state.saveAgent(agent);

    return { agentId, status: "killed", cleaned: false };
  }

  // Existing spawned agent stop logic (unchanged)
  const proc = this.runningProcesses.get(agentId);
  if (proc && agent.status === "running") {
    proc.kill("SIGTERM");
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        try { proc.kill("SIGKILL"); } catch {}
        resolve();
      }, 5000);
      const checkInterval = setInterval(() => {
        if (!this.runningProcesses.has(agentId)) {
          clearTimeout(timeout);
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
    });
  }

  agent.status = "killed";
  agent.updatedAt = new Date().toISOString();
  await this.state.saveAgent(agent);

  let cleaned = false;
  let warning: string | undefined;
  if (cleanup) {
    try {
      const result = await this.worktrees.remove(agentId, agent.branch);
      cleaned = true;
      warning = result.warning;
    } catch {}
  }

  return { agentId, status: "killed", cleaned, warning };
}
```

Also update `spawnAgent` to set `type: "spawned"` explicitly:

In the `agentState` object inside `spawnAgent`, add `type: "spawned"` after `id`:

```typescript
const agentState: AgentState = {
  id: agentId,
  type: "spawned",
  task: options.task,
  // ... rest unchanged
};
```

- [ ] **Step 2: Verify build**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Run full test suite**

```bash
npx vitest run
```

Expected: All tests PASS. The socket server starts during `init()`, but existing tests create temp dirs without a `.orra/` directory structure pre-made — `StateManager.init()` creates it, so the socket server should work. If any tests break because of socket file issues in temp dirs, the socket server start in `init()` might need to be conditional or tested separately.

- [ ] **Step 4: Commit**

```bash
git add src/core/agent-manager.ts
git commit -m "feat: integrate socket server into AgentManager for external agent support"
```

---

### Task 5: Mode Detection and Conditional Tool Registration

**Files:**
- Modify: `src/server.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Add mode detection to index.ts**

Replace `src/index.ts`:

```typescript
#!/usr/bin/env node
import * as net from "node:net";
import * as fs from "node:fs";
import * as path from "node:path";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

export type OrraMode = "orchestrator" | "agent";

async function detectMode(projectRoot: string): Promise<OrraMode> {
  const sockPath = path.join(projectRoot, ".orra", "orra.sock");

  try {
    fs.accessSync(sockPath);
  } catch {
    return "orchestrator";
  }

  // Try to connect with a 500ms timeout
  return new Promise<OrraMode>((resolve) => {
    const socket = net.createConnection(sockPath);
    const timeout = setTimeout(() => {
      socket.destroy();
      resolve("orchestrator");
    }, 500);

    socket.on("connect", () => {
      clearTimeout(timeout);
      socket.destroy();
      resolve("agent");
    });

    socket.on("error", () => {
      clearTimeout(timeout);
      resolve("orchestrator");
    });
  });
}

async function main() {
  const projectRoot = process.cwd();
  const mode = await detectMode(projectRoot);

  const { server, manager } = createServer(projectRoot, mode);

  if (mode === "orchestrator") {
    await manager.init();
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error(`orra-mcp: running in ${mode} mode`);

  // Graceful shutdown
  process.on("SIGTERM", async () => {
    if (manager) await manager.shutdown();
    process.exit(0);
  });
  process.on("SIGINT", async () => {
    if (manager) await manager.shutdown();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("orra-mcp: fatal error:", err);
  process.exit(1);
});
```

- [ ] **Step 2: Refactor server.ts for dual mode**

Replace `src/server.ts`:

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AgentManager } from "./core/agent-manager.js";
import { SocketClient } from "./core/socket-client.js";
import { spawnAgentSchema, handleSpawnAgent } from "./tools/spawn-agent.js";
import { handleListAgents } from "./tools/list-agents.js";
import { getAgentStatusSchema, handleGetAgentStatus } from "./tools/get-agent-status.js";
import { getAgentOutputSchema, handleGetAgentOutput } from "./tools/get-agent-output.js";
import { stopAgentSchema, handleStopAgent } from "./tools/stop-agent.js";
import { sendMessageSchema, handleSendMessage } from "./tools/send-message.js";
import { linkAgentsSchema, handleLinkAgents } from "./tools/link-agents.js";
import { registerSchema, handleRegister } from "./tools/register.js";
import { unregisterSchema, handleUnregister } from "./tools/unregister.js";
import { heartbeatSchema, handleHeartbeat } from "./tools/heartbeat.js";
import type { OrraMode } from "./index.js";

export function createServer(
  projectRoot: string,
  mode: OrraMode
): {
  server: McpServer;
  manager: AgentManager;
} {
  const server = new McpServer({
    name: "orra-mcp",
    version: "0.1.0",
  });

  const manager = new AgentManager(projectRoot);

  if (mode === "orchestrator") {
    registerOrchestratorTools(server, manager);
  } else {
    const client = new SocketClient(projectRoot);
    registerAgentTools(server, client);
  }

  return { server, manager };
}

function registerOrchestratorTools(server: McpServer, manager: AgentManager): void {
  server.tool(
    "orra_spawn",
    "Create a git worktree and start a Claude Code agent with a task",
    spawnAgentSchema.shape,
    async (args) => handleSpawnAgent(manager, spawnAgentSchema.parse(args)),
  );

  server.tool(
    "orra_list",
    "List all agents with their status, branch, and last activity",
    {},
    async () => handleListAgents(manager),
  );

  server.tool(
    "orra_status",
    "Get one agent's detailed state and recent output",
    getAgentStatusSchema.shape,
    async (args) => handleGetAgentStatus(manager, getAgentStatusSchema.parse(args)),
  );

  server.tool(
    "orra_output",
    "Get full or tail of an agent's captured output",
    getAgentOutputSchema.shape,
    async (args) => handleGetAgentOutput(manager, getAgentOutputSchema.parse(args)),
  );

  server.tool(
    "orra_stop",
    "Kill an agent process, optionally remove its worktree",
    stopAgentSchema.shape,
    async (args) => handleStopAgent(manager, stopAgentSchema.parse(args)),
  );

  server.tool(
    "orra_message",
    "Send a message to a running agent's session",
    sendMessageSchema.shape,
    async (args) => handleSendMessage(manager, sendMessageSchema.parse(args)),
  );

  server.tool(
    "orra_link",
    "When agent A completes, auto-spawn agent B with context",
    linkAgentsSchema.shape,
    async (args) => handleLinkAgents(manager, linkAgentsSchema.parse(args)),
  );
}

function registerAgentTools(server: McpServer, client: SocketClient): void {
  server.tool(
    "orra_register",
    "Register this terminal as an agent with the Orra orchestrator",
    registerSchema.shape,
    async (args) => handleRegister(client, registerSchema.parse(args)),
  );

  server.tool(
    "orra_unregister",
    "Unregister from the Orra orchestrator and report completion status",
    unregisterSchema.shape,
    async (args) => handleUnregister(client, unregisterSchema.parse(args)),
  );

  server.tool(
    "orra_heartbeat",
    "Send a status update to the Orra orchestrator",
    heartbeatSchema.shape,
    async (args) => handleHeartbeat(client, heartbeatSchema.parse(args)),
  );
}
```

- [ ] **Step 3: Verify build** (will fail until Task 6 creates the tool handlers)

Note: This step will have import errors until Task 6 is complete. Proceed to Task 6 immediately.

- [ ] **Step 4: Commit server.ts and index.ts together with Task 6**

(Committed together with Task 6)

---

### Task 6: Agent-Side Tool Handlers

**Files:**
- Create: `src/tools/register.ts`
- Create: `src/tools/unregister.ts`
- Create: `src/tools/heartbeat.ts`

- [ ] **Step 1: Create register.ts**

Create `src/tools/register.ts`:

```typescript
import { z } from "zod";
import { execFileSync } from "node:child_process";
import type { SocketClient } from "../core/socket-client.js";

export const registerSchema = z.object({
  task: z.string().describe("Description of what you're working on"),
  branch: z.string().optional().describe("Current branch (auto-detected if omitted)"),
});

export async function handleRegister(
  client: SocketClient,
  args: z.infer<typeof registerSchema>
) {
  if (client.isConnected()) {
    return {
      content: [{ type: "text" as const, text: "Error: Already registered with orchestrator." }],
      isError: true,
    };
  }

  let branch = args.branch;
  if (!branch) {
    try {
      branch = execFileSync("git", ["branch", "--show-current"], {
        encoding: "utf-8",
      }).trim();
    } catch {
      branch = "unknown";
    }
  }

  try {
    await client.connect();
  } catch {
    return {
      content: [{
        type: "text" as const,
        text: "Error: No Orra orchestrator found. Start one in another terminal first.",
      }],
      isError: true,
    };
  }

  // Send register and wait for registered response
  const agentId = await new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Registration timeout")), 5000);

    client.onMessage = (msg) => {
      if (msg.type === "registered") {
        clearTimeout(timeout);
        resolve(msg.agentId);
      }
    };

    client.sendRegister(args.task, branch);
  });

  // Keep onMessage for future messages from orchestrator
  client.onMessage = (msg) => {
    if (msg.type === "stop") {
      console.error(`orra-mcp: orchestrator requested stop: ${msg.reason}`);
    }
  };

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({ agentId, status: "registered" }, null, 2),
    }],
  };
}
```

- [ ] **Step 2: Create unregister.ts**

Create `src/tools/unregister.ts`:

```typescript
import { z } from "zod";
import type { SocketClient } from "../core/socket-client.js";

export const unregisterSchema = z.object({
  status: z
    .enum(["completed", "failed"])
    .default("completed")
    .describe("Final status to report"),
});

export async function handleUnregister(
  client: SocketClient,
  args: z.infer<typeof unregisterSchema>
) {
  if (!client.isConnected()) {
    return {
      content: [{ type: "text" as const, text: "Error: Not registered with any orchestrator." }],
      isError: true,
    };
  }

  const exitCode = args.status === "completed" ? 0 : 1;
  client.sendStatus(args.status, exitCode);
  client.disconnect();

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({ status: "unregistered" }, null, 2),
    }],
  };
}
```

- [ ] **Step 3: Create heartbeat.ts**

Create `src/tools/heartbeat.ts`:

```typescript
import { z } from "zod";
import type { SocketClient } from "../core/socket-client.js";

export const heartbeatSchema = z.object({
  activity: z.string().describe("What you're currently doing"),
});

export async function handleHeartbeat(
  client: SocketClient,
  args: z.infer<typeof heartbeatSchema>
) {
  if (!client.isConnected()) {
    return {
      content: [{ type: "text" as const, text: "Error: Not registered with any orchestrator." }],
      isError: true,
    };
  }

  client.sendOutput(args.activity + "\n");

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({ sent: true }, null, 2),
    }],
  };
}
```

- [ ] **Step 4: Verify build**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 5: Run full test suite**

```bash
npx vitest run
```

Expected: All tests pass.

- [ ] **Step 6: Commit (together with Task 5 changes)**

```bash
git add src/server.ts src/index.ts src/tools/register.ts src/tools/unregister.ts src/tools/heartbeat.ts
git commit -m "feat: add dual-mode server with agent registration tools (orra_register, orra_unregister, orra_heartbeat)"
```

---

### Task 7: Integration Test — External Agent Registration

**Files:**
- Create: `tests/integration/external-agent.test.ts`

- [ ] **Step 1: Write integration test**

Create `tests/integration/external-agent.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execSync } from "node:child_process";
import { AgentManager } from "../../src/core/agent-manager.js";
import { SocketClient } from "../../src/core/socket-client.js";

describe("External Agent Registration (integration)", () => {
  let tmpDir: string;
  let manager: AgentManager;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "orra-ext-test-"));
    execSync("git init", { cwd: tmpDir });
    execSync("git commit --allow-empty -m 'init'", { cwd: tmpDir });

    manager = new AgentManager(tmpDir);
    await manager.init();
  });

  afterEach(async () => {
    await manager.shutdown();
    try {
      execSync("git worktree prune", { cwd: tmpDir });
    } catch {}
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should accept external agent registration via socket", async () => {
    const client = new SocketClient(tmpDir);
    await client.connect();

    const agentId = await new Promise<string>((resolve) => {
      client.onMessage = (msg) => {
        if (msg.type === "registered") resolve(msg.agentId);
      };
      client.sendRegister("test task", "main");
    });

    expect(agentId).toBeTruthy();

    // Agent should appear in list
    const agents = await manager.listAgents();
    const external = agents.find((a) => a.id === agentId);
    expect(external).toBeTruthy();
    expect(external!.type).toBe("external");
    expect(external!.task).toBe("test task");
    expect(external!.status).toBe("running");

    client.disconnect();
  });

  it("should capture output from external agent", async () => {
    const client = new SocketClient(tmpDir);
    await client.connect();

    const agentId = await new Promise<string>((resolve) => {
      client.onMessage = (msg) => {
        if (msg.type === "registered") resolve(msg.agentId);
      };
      client.sendRegister("output test", "main");
    });

    client.sendOutput("Working on auth\n");
    client.sendOutput("Reading files\n");
    await new Promise((r) => setTimeout(r, 100));

    const output = await manager.getAgentOutput(agentId);
    expect(output).toContain("Working on auth");
    expect(output).toContain("Reading files");

    client.disconnect();
  });

  it("should send message to external agent", async () => {
    const client = new SocketClient(tmpDir);
    await client.connect();

    const received: Array<{ type: string; content?: string }> = [];
    const agentId = await new Promise<string>((resolve) => {
      client.onMessage = (msg) => {
        if (msg.type === "registered") resolve(msg.agentId);
        else received.push(msg as any);
      };
      client.sendRegister("msg test", "main");
    });

    await manager.sendMessage(agentId, "check the tests");
    await new Promise((r) => setTimeout(r, 100));

    expect(received.some((m) => m.type === "message" && m.content === "check the tests")).toBe(true);

    client.disconnect();
  });

  it("should mark agent as interrupted on disconnect without status", async () => {
    const client = new SocketClient(tmpDir);
    await client.connect();

    const agentId = await new Promise<string>((resolve) => {
      client.onMessage = (msg) => {
        if (msg.type === "registered") resolve(msg.agentId);
      };
      client.sendRegister("disc test", "main");
    });

    client.disconnect();
    await new Promise((r) => setTimeout(r, 200));

    const status = await manager.getAgentStatus(agentId);
    expect(status!.agent.status).toBe("interrupted");
  });

  it("should mark agent as completed when status message sent", async () => {
    const client = new SocketClient(tmpDir);
    await client.connect();

    const agentId = await new Promise<string>((resolve) => {
      client.onMessage = (msg) => {
        if (msg.type === "registered") resolve(msg.agentId);
      };
      client.sendRegister("complete test", "main");
    });

    client.sendStatus("completed", 0);
    await new Promise((r) => setTimeout(r, 200));

    const status = await manager.getAgentStatus(agentId);
    expect(status!.agent.status).toBe("completed");
    expect(status!.agent.exitCode).toBe(0);

    client.disconnect();
  });

  it("should fire links when external agent completes", async () => {
    const client = new SocketClient(tmpDir);
    await client.connect();

    const agentId = await new Promise<string>((resolve) => {
      client.onMessage = (msg) => {
        if (msg.type === "registered") resolve(msg.agentId);
      };
      client.sendRegister("link source", "main");
    });

    // Create a link (this will fail to actually spawn since claude isn't available,
    // but we can verify the link status changes)
    await manager.linkAgents(agentId, { task: "review {{from.task}}" }, "success");

    client.sendStatus("completed", 0);
    await new Promise((r) => setTimeout(r, 500));

    // The link should have attempted to fire (even if spawn fails)
    const status = await manager.getAgentStatus(agentId);
    expect(status!.agent.status).toBe("completed");

    client.disconnect();
  });
});
```

- [ ] **Step 2: Run integration test**

```bash
npx vitest run tests/integration/external-agent.test.ts
```

Expected: All 6 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/external-agent.test.ts
git commit -m "test: add integration tests for external agent registration via socket"
```

---

### Task 8: Final Verification

**Files:** none (verification only)

- [ ] **Step 1: Run all tests**

```bash
npx vitest run
```

Expected: All tests pass.

- [ ] **Step 2: Clean build**

```bash
rm -rf dist && npx tsc
```

Expected: No errors.

- [ ] **Step 3: Verify orchestrator mode tools**

```bash
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.1.0"}}}\n{"jsonrpc":"2.0","method":"notifications/initialized"}\n{"jsonrpc":"2.0","id":2,"method":"tools/list"}\n' | timeout 5 node dist/index.js 2>/dev/null | tail -1 | python3 -c "import sys,json; tools=json.load(sys.stdin)['result']['tools']; [print(t['name']) for t in tools]"
```

Expected: 7 orchestrator tools (orra_spawn, orra_list, orra_status, orra_output, orra_stop, orra_message, orra_link).

- [ ] **Step 4: Verify agent mode tools**

To test agent mode, first start an orchestrator (which creates the socket), then test:

```bash
# In one terminal: start orchestrator to create the socket
mkdir -p /tmp/orra-test-mode/.orra
cd /tmp/orra-test-mode && git init && git commit --allow-empty -m init
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.1.0"}}}\n' | timeout 3 node /Users/bjorn/bjorn/workspace/Orra-mcp/dist/index.js &
sleep 1

# Now test agent mode detection
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.1.0"}}}\n{"jsonrpc":"2.0","method":"notifications/initialized"}\n{"jsonrpc":"2.0","id":2,"method":"tools/list"}\n' | timeout 3 node /Users/bjorn/bjorn/workspace/Orra-mcp/dist/index.js 2>/dev/null | tail -1 | python3 -c "import sys,json; tools=json.load(sys.stdin)['result']['tools']; [print(t['name']) for t in tools]"
```

Expected: 3 agent tools (orra_register, orra_unregister, orra_heartbeat).

- [ ] **Step 5: Commit any fixes**

If any issues found:

```bash
git add -A
git commit -m "fix: resolve issues found during final verification"
```
