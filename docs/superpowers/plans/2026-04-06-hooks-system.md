# Hooks System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatic detection of when agents need input via Claude Code hooks. Permission requests block until the orchestrator answers. Turn completions notify the orchestrator so it can see agent questions and respond from one terminal.

**Architecture:** A `PermissionRequest` hook sends a `question` message to the orchestrator via Unix socket and blocks until an `answer` arrives. A `Stop` hook sends a fire-and-forget `turn_complete` signal. The orchestrator tracks pending questions and log offsets per agent, updates status to `waiting`/`idle`, and routes `orra_message` accordingly. `orra_spawn` auto-installs hooks in the worktree.

**Tech Stack:** Node.js `net` module (existing Unix socket infrastructure), Claude Code hooks system

---

## File Structure

```
src/
├── types.ts                    — Add: idle/waiting status, question/turn_complete/answer messages
├── core/
│   ├── agent-manager.ts        — Add: pending questions map, log offsets, question/turn handling,
│   │                             sendMessage branching for waiting/idle/running
│   ├── socket-server.ts        — Add: question/turn_complete handlers, answer sending,
│   │                             hook connection tracking (separate from agent registration)
│   └── state.ts                — Add: readLogRange method for offset-based reads
├── tools/
│   ├── spawn-agent.ts          — Add: write .claude/settings.json with hooks, set ORRA_AGENT_ID env
│   └── send-message.ts         — Update: handle waiting (answer permission) and idle (resume) statuses
└── bin/
    └── orra-hook.ts            — NEW: Hook script handling PermissionRequest + Stop events
tests/
├── unit/
│   ├── orra-hook.test.ts       — NEW: Hook script logic tests
│   └── state.test.ts           — Add: readLogRange tests
└── integration/
    └── hooks.test.ts           — NEW: End-to-end hook + orchestrator tests
```

---

### Task 1: Add New Status Values and Socket Message Types

**Files:**
- Modify: `src/types.ts`
- Modify: `tests/unit/types.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/unit/types.test.ts`:

```typescript
describe("AgentStatus with idle and waiting", () => {
  it("should accept idle status", () => {
    expect(AgentStatus.parse("idle")).toBe("idle");
  });

  it("should accept waiting status", () => {
    expect(AgentStatus.parse("waiting")).toBe("waiting");
  });
});

describe("SocketMessageSchema — hook messages", () => {
  it("should validate question message", () => {
    const msg = { type: "question", agentId: "test-a1b2", tool: "Bash", input: { command: "npm install" } };
    expect(SocketMessageSchema.parse(msg).type).toBe("question");
  });

  it("should validate turn_complete message", () => {
    const msg = { type: "turn_complete", agentId: "test-a1b2" };
    expect(SocketMessageSchema.parse(msg).type).toBe("turn_complete");
  });

  it("should validate answer message", () => {
    const msg = { type: "answer", allow: true };
    expect(SocketMessageSchema.parse(msg).type).toBe("answer");
  });

  it("should validate answer with deny and reason", () => {
    const msg = { type: "answer", allow: false, reason: "too dangerous" };
    const parsed = SocketMessageSchema.parse(msg);
    expect(parsed.type).toBe("answer");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/unit/types.test.ts
```

Expected: FAIL — `idle` and `waiting` not in AgentStatus, `question`/`turn_complete`/`answer` not in SocketMessageSchema.

- [ ] **Step 3: Implement type changes**

In `src/types.ts`, update `AgentStatus`:

```typescript
export const AgentStatus = z.enum([
  "running",
  "idle",
  "waiting",
  "completed",
  "failed",
  "interrupted",
  "killed",
]);
```

Add three new message types before the `SocketMessageSchema` discriminated union:

```typescript
const QuestionMessage = z.object({
  type: z.literal("question"),
  agentId: z.string(),
  tool: z.string(),
  input: z.record(z.unknown()),
});

const TurnCompleteMessage = z.object({
  type: z.literal("turn_complete"),
  agentId: z.string(),
});

const AnswerMessage = z.object({
  type: z.literal("answer"),
  allow: z.boolean(),
  reason: z.string().optional(),
});
```

Add them to the discriminated union:

```typescript
export const SocketMessageSchema = z.discriminatedUnion("type", [
  RegisterMessage,
  OutputMessage,
  StatusMessage,
  RegisteredMessage,
  MessageMessage,
  StopMessage,
  QuestionMessage,
  TurnCompleteMessage,
  AnswerMessage,
]);
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/unit/types.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Run full suite**

```bash
npx vitest run
```

Expected: All tests PASS. The new status values don't break existing code since nothing checks for exhaustive status matching.

- [ ] **Step 6: Commit**

```bash
git add src/types.ts tests/unit/types.test.ts
git commit -m "feat: add idle/waiting status values and question/turn_complete/answer socket messages"
```

---

### Task 2: Add readLogRange to StateManager

**Files:**
- Modify: `src/core/state.ts`
- Modify: `tests/unit/state.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/unit/state.test.ts`:

```typescript
describe("readLogRange", () => {
  beforeEach(async () => {
    await state.init();
  });

  it("should read from offset to end", async () => {
    await state.appendLog("test-a1b2", "line 1\nline 2\nline 3\n");
    const result = await state.readLogRange("test-a1b2", 7);
    expect(result.content).toBe("line 2\nline 3\n");
    expect(result.newOffset).toBe(21);
  });

  it("should return empty content if offset is at end", async () => {
    await state.appendLog("test-a1b2", "line 1\n");
    const result = await state.readLogRange("test-a1b2", 7);
    expect(result.content).toBe("");
    expect(result.newOffset).toBe(7);
  });

  it("should read from 0 on first call", async () => {
    await state.appendLog("test-a1b2", "hello\nworld\n");
    const result = await state.readLogRange("test-a1b2", 0);
    expect(result.content).toBe("hello\nworld\n");
    expect(result.newOffset).toBe(12);
  });

  it("should return offset 0 for non-existent log", async () => {
    const result = await state.readLogRange("nonexistent", 0);
    expect(result.content).toBe("");
    expect(result.newOffset).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/unit/state.test.ts
```

Expected: FAIL — `readLogRange` does not exist.

- [ ] **Step 3: Implement readLogRange**

Add to the `StateManager` class in `src/core/state.ts`:

```typescript
async readLogRange(id: string, offset: number): Promise<{ content: string; newOffset: number }> {
  const filePath = path.join(this.agentsDir, `${id}.log`);
  try {
    const stat = await fs.stat(filePath);
    const fileSize = stat.size;
    if (offset >= fileSize) {
      return { content: "", newOffset: offset };
    }
    const handle = await fs.open(filePath, "r");
    try {
      const buffer = Buffer.alloc(fileSize - offset);
      await handle.read(buffer, 0, buffer.length, offset);
      return { content: buffer.toString("utf-8"), newOffset: fileSize };
    } finally {
      await handle.close();
    }
  } catch {
    return { content: "", newOffset: 0 };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/unit/state.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/state.ts tests/unit/state.test.ts
git commit -m "feat: add readLogRange for offset-based log reads"
```

---

### Task 3: Hook Script

**Files:**
- Create: `src/bin/orra-hook.ts`
- Create: `tests/unit/orra-hook.test.ts`

The hook script is the entry point Claude Code calls. It reads stdin, resolves agent ID, connects to `.orra/orra.sock`, and handles the event. We put it in `src/bin/` so it gets compiled to `dist/bin/`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/orra-hook.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { resolveAgentId, buildPermissionResponse, parseAllowDeny } from "../../src/bin/orra-hook.js";

describe("resolveAgentId", () => {
  it("should return env var if set", () => {
    expect(resolveAgentId({ ORRA_AGENT_ID: "test-123" }, "/tmp")).toBe("test-123");
  });

  it("should return null if no env var and no file", () => {
    expect(resolveAgentId({}, "/tmp/nonexistent")).toBeNull();
  });
});

describe("buildPermissionResponse", () => {
  it("should build allow response", () => {
    const response = buildPermissionResponse(true);
    expect(response).toEqual({
      hookSpecificOutput: {
        hookEventName: "PermissionRequest",
        decision: { behavior: "allow" },
      },
    });
  });

  it("should build deny response", () => {
    const response = buildPermissionResponse(false);
    expect(response).toEqual({
      hookSpecificOutput: {
        hookEventName: "PermissionRequest",
        decision: { behavior: "deny" },
      },
    });
  });
});

describe("parseAllowDeny", () => {
  it("should parse yes as allow", () => {
    expect(parseAllowDeny("yes")).toBe(true);
  });

  it("should parse y as allow", () => {
    expect(parseAllowDeny("y")).toBe(true);
  });

  it("should parse allow as allow", () => {
    expect(parseAllowDeny("allow")).toBe(true);
  });

  it("should parse no as deny", () => {
    expect(parseAllowDeny("no")).toBe(false);
  });

  it("should parse n as deny", () => {
    expect(parseAllowDeny("n")).toBe(false);
  });

  it("should parse deny as deny", () => {
    expect(parseAllowDeny("deny")).toBe(false);
  });

  it("should default to deny for unknown input", () => {
    expect(parseAllowDeny("something else")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/unit/orra-hook.test.ts
```

Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Implement orra-hook.ts**

Create `src/bin/orra-hook.ts`:

```typescript
#!/usr/bin/env node
import * as net from "node:net";
import * as fs from "node:fs";
import * as path from "node:path";

// --- Exported helpers for testing ---

export function resolveAgentId(env: Record<string, string | undefined>, projectRoot: string): string | null {
  if (env.ORRA_AGENT_ID) return env.ORRA_AGENT_ID;

  const selfIdPath = path.join(projectRoot, ".orra", "agents", "self.id");
  try {
    return fs.readFileSync(selfIdPath, "utf-8").trim();
  } catch {
    return null;
  }
}

export function buildPermissionResponse(allow: boolean): object {
  return {
    hookSpecificOutput: {
      hookEventName: "PermissionRequest",
      decision: { behavior: allow ? "allow" : "deny" },
    },
  };
}

export function parseAllowDeny(input: string): boolean {
  const lower = input.trim().toLowerCase();
  return ["yes", "y", "allow", "approve", "ok"].includes(lower);
}

// --- Main hook logic ---

function findProjectRoot(startDir: string): string {
  let dir = startDir;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, ".git"))) return dir;
    dir = path.dirname(dir);
  }
  return startDir;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf-8");
}

function connectToSocket(sockPath: string, timeout: number): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(sockPath, () => resolve(socket));
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error("Connection timeout"));
    }, timeout);
    socket.on("connect", () => clearTimeout(timer));
    socket.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function waitForMessage(socket: net.Socket, timeout: number): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let buffer = "";
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error("Answer timeout"));
    }, timeout);

    socket.on("data", (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop()!;
      for (const line of lines) {
        if (line.trim().length > 0) {
          clearTimeout(timer);
          try {
            resolve(JSON.parse(line));
          } catch {
            reject(new Error("Invalid JSON from orchestrator"));
          }
          return;
        }
      }
    });

    socket.on("close", () => {
      clearTimeout(timer);
      reject(new Error("Socket closed before answer received"));
    });

    socket.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function handlePermissionRequest(
  agentId: string,
  sockPath: string,
  hookInput: Record<string, unknown>
): Promise<void> {
  const toolName = (hookInput.tool_name as string) ?? "unknown";
  const toolInput = (hookInput.tool_input as Record<string, unknown>) ?? {};

  let socket: net.Socket;
  try {
    socket = await connectToSocket(sockPath, 2000);
  } catch {
    process.exit(1); // Can't connect, fall back to normal prompt
  }

  socket.write(JSON.stringify({
    type: "question",
    agentId,
    tool: toolName,
    input: toolInput,
  }) + "\n");

  try {
    const answer = await waitForMessage(socket, 300000); // 5 minute timeout
    socket.destroy();

    if (answer.allow) {
      console.log(JSON.stringify(buildPermissionResponse(true)));
      process.exit(0);
    } else {
      const reason = (answer.reason as string) ?? "Denied by orchestrator";
      console.error(reason);
      process.exit(2);
    }
  } catch {
    socket.destroy();
    process.exit(1); // Timeout or error, fall back to normal prompt
  }
}

async function handleStop(agentId: string, sockPath: string): Promise<void> {
  try {
    const socket = await connectToSocket(sockPath, 2000);
    socket.write(JSON.stringify({
      type: "turn_complete",
      agentId,
    }) + "\n");
    // Fire and forget — give it a moment to flush, then close
    setTimeout(() => {
      socket.destroy();
      process.exit(0);
    }, 100);
  } catch {
    process.exit(0); // Can't connect, ignore silently
  }
}

async function main(): Promise<void> {
  const input = await readStdin();
  let hookInput: Record<string, unknown>;
  try {
    hookInput = JSON.parse(input);
  } catch {
    process.exit(1); // Bad input
  }

  const hookEvent = hookInput!.hook_event_name as string;
  const cwd = (hookInput!.cwd as string) ?? process.cwd();
  const projectRoot = findProjectRoot(cwd);
  const sockPath = path.join(projectRoot, ".orra", "orra.sock");
  const agentId = resolveAgentId(process.env, projectRoot);

  if (!agentId) {
    process.exit(1); // Not an Orra agent
  }

  if (!fs.existsSync(sockPath)) {
    process.exit(1); // No orchestrator
  }

  switch (hookEvent) {
    case "PermissionRequest":
      await handlePermissionRequest(agentId, sockPath, hookInput!);
      break;
    case "Stop":
      await handleStop(agentId, sockPath);
      break;
    default:
      process.exit(0); // Unknown event, ignore
  }
}

// Only run main if this is the entry point (not imported for testing)
const isMainModule = process.argv[1]?.endsWith("orra-hook.js") || process.argv[1]?.endsWith("orra-hook.ts");
if (isMainModule) {
  main().catch(() => process.exit(1));
}
```

- [ ] **Step 4: Update tsconfig to include bin directory**

In `tsconfig.json`, the `rootDir` is `src` and `include` is `src/**/*`. Since we're putting the hook in `src/bin/`, it will be compiled to `dist/bin/orra-hook.js` automatically. Verify:

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 5: Run test to verify it passes**

```bash
npx vitest run tests/unit/orra-hook.test.ts
```

Expected: All 9 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/bin/orra-hook.ts tests/unit/orra-hook.test.ts
git commit -m "feat: add orra-hook.js script for PermissionRequest and Stop hooks"
```

---

### Task 4: Socket Server — Handle Question and Turn Complete

**Files:**
- Modify: `src/core/socket-server.ts`
- Modify: `tests/unit/socket-server.test.ts`

The socket server needs to handle `question` and `turn_complete` messages from hook connections. These are separate from agent registration connections — a hook opens a short-lived connection, sends one message, and either waits (question) or disconnects (turn_complete).

- [ ] **Step 1: Write the failing test**

Add to `tests/unit/socket-server.test.ts`:

```typescript
it("should call onQuestion when hook sends question", async () => {
  let questionData: { agentId: string; tool: string } | null = null;
  server = new SocketServer(tmpDir);
  server.onQuestion = (hookSocket, agentId, tool, input) => {
    questionData = { agentId, tool };
  };
  await server.start();

  const client = net.createConnection(path.join(tmpDir, ".orra", "orra.sock"));
  await new Promise<void>((resolve) => client.on("connect", resolve));

  client.write(JSON.stringify({
    type: "question",
    agentId: "test-a1b2",
    tool: "Bash",
    input: { command: "npm install" },
  }) + "\n");
  await new Promise((r) => setTimeout(r, 100));

  expect(questionData).toEqual({ agentId: "test-a1b2", tool: "Bash" });

  client.destroy();
});

it("should call onTurnComplete when hook sends turn_complete", async () => {
  let turnAgentId: string | null = null;
  server = new SocketServer(tmpDir);
  server.onTurnComplete = (agentId) => {
    turnAgentId = agentId;
  };
  await server.start();

  const client = net.createConnection(path.join(tmpDir, ".orra", "orra.sock"));
  await new Promise<void>((resolve) => client.on("connect", resolve));

  client.write(JSON.stringify({
    type: "turn_complete",
    agentId: "test-a1b2",
  }) + "\n");
  await new Promise((r) => setTimeout(r, 100));

  expect(turnAgentId).toBe("test-a1b2");

  client.destroy();
});

it("should send answer to hook socket via answerQuestion", async () => {
  let hookSocket: net.Socket | null = null;
  server = new SocketServer(tmpDir);
  server.onQuestion = (socket) => {
    hookSocket = socket;
  };
  await server.start();

  const received: string[] = [];
  const client = net.createConnection(path.join(tmpDir, ".orra", "orra.sock"));
  await new Promise<void>((resolve) => client.on("connect", resolve));
  client.on("data", (data) => received.push(data.toString()));

  client.write(JSON.stringify({
    type: "question",
    agentId: "test-a1b2",
    tool: "Bash",
    input: { command: "npm install" },
  }) + "\n");
  await new Promise((r) => setTimeout(r, 100));

  server.answerQuestion(hookSocket!, true);
  await new Promise((r) => setTimeout(r, 100));

  const parsed = JSON.parse(received[received.length - 1].trim());
  expect(parsed).toEqual({ type: "answer", allow: true });

  client.destroy();
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/unit/socket-server.test.ts
```

Expected: FAIL — `onQuestion`, `onTurnComplete`, `answerQuestion` don't exist.

- [ ] **Step 3: Implement socket server changes**

Add new callbacks to `SocketServer` class (after existing callbacks):

```typescript
onQuestion: (hookSocket: net.Socket, agentId: string, tool: string, input: Record<string, unknown>) => void = () => {};
onTurnComplete: (agentId: string) => void = () => {};
```

Add a new public method:

```typescript
answerQuestion(hookSocket: net.Socket, allow: boolean, reason?: string): void {
  const msg: Record<string, unknown> = { type: "answer", allow };
  if (reason) msg.reason = reason;
  hookSocket.write(JSON.stringify(msg) + "\n");
}
```

In the `handleMessage` method, add cases for the new message types:

```typescript
case "question": {
  if ("agentId" in msg && "tool" in msg && "input" in msg) {
    this.onQuestion(socket, msg.agentId, msg.tool, msg.input as Record<string, unknown>);
  }
  break;
}
case "turn_complete": {
  if ("agentId" in msg) {
    this.onTurnComplete(msg.agentId);
  }
  break;
}
```

IMPORTANT: Hook connections are NOT agent registration connections. They don't call `setAgentId` and shouldn't be tracked in `agentSockets`. The `agentId` is carried in the message itself. The existing `close`/`error` handlers that check `if (agentId)` only fire for registration connections where `agentId` was set via `setAgentId`.

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/unit/socket-server.test.ts
```

Expected: All tests PASS (existing 10 + new 3).

- [ ] **Step 5: Commit**

```bash
git add src/core/socket-server.ts tests/unit/socket-server.test.ts
git commit -m "feat: add question/turn_complete/answer handling to SocketServer"
```

---

### Task 5: AgentManager — Question Handling and Log Offsets

**Files:**
- Modify: `src/core/agent-manager.ts`

- [ ] **Step 1: Add new fields**

Add to the class after existing fields:

```typescript
private pendingQuestions: Map<string, { hookSocket: net.Socket; tool: string; input: Record<string, unknown> }> = new Map();
private logOffsets: Map<string, number> = new Map();
private turnPreviews: Map<string, string> = new Map();
```

Add import at the top:

```typescript
import * as net from "node:net";
```

- [ ] **Step 2: Wire up new socket server callbacks in init()**

Add after existing `this.socketServer.onDisconnect` setup in `init()`:

```typescript
this.socketServer.onQuestion = (hookSocket, agentId, tool, input) => {
  this.handleQuestion(hookSocket, agentId, tool, input).catch((err) =>
    console.error(`Failed to handle question for ${agentId}:`, err)
  );
};
this.socketServer.onTurnComplete = (agentId) => {
  this.handleTurnComplete(agentId).catch((err) =>
    console.error(`Failed to handle turn_complete for ${agentId}:`, err)
  );
};
```

- [ ] **Step 3: Add handleQuestion method**

```typescript
private async handleQuestion(
  hookSocket: net.Socket,
  agentId: string,
  tool: string,
  input: Record<string, unknown>
): Promise<void> {
  const agent = await this.state.loadAgent(agentId);
  if (!agent) return;

  agent.status = "waiting";
  agent.updatedAt = new Date().toISOString();
  await this.state.saveAgent(agent);

  this.pendingQuestions.set(agentId, { hookSocket, tool, input });
}
```

- [ ] **Step 4: Add handleTurnComplete method**

```typescript
private async handleTurnComplete(agentId: string): Promise<void> {
  const agent = await this.state.loadAgent(agentId);
  if (!agent) return;

  // Only mark idle if currently running (not waiting, completed, etc.)
  if (agent.status !== "running") return;

  // Read new log content since last offset
  const offset = this.logOffsets.get(agentId) ?? 0;
  const { content, newOffset } = await this.state.readLogRange(agentId, offset);
  this.logOffsets.set(agentId, newOffset);

  // Extract last 3 non-empty lines as preview
  if (content.length > 0) {
    const lines = content.split("\n").filter((l) => l.trim().length > 0);
    const preview = lines.slice(-3).join("\n");
    this.turnPreviews.set(agentId, preview);
  }

  agent.status = "idle";
  agent.updatedAt = new Date().toISOString();
  await this.state.saveAgent(agent);
}
```

- [ ] **Step 5: Update sendMessage for waiting/idle agents**

Replace the `sendMessage` method:

```typescript
async sendMessage(agentId: string, message: string): Promise<void> {
  const agent = await this.state.loadAgent(agentId);
  if (!agent) throw new Error(`Agent ${agentId} not found`);

  // Handle waiting agent (pending permission question)
  if (agent.status === "waiting") {
    const pending = this.pendingQuestions.get(agentId);
    if (!pending) throw new Error(`Agent ${agentId} has no pending question`);

    const allow = parseAllowDeny(message);
    this.socketServer!.answerQuestion(pending.hookSocket, allow, allow ? undefined : message);
    this.pendingQuestions.delete(agentId);

    agent.status = "running";
    agent.updatedAt = new Date().toISOString();
    await this.state.saveAgent(agent);
    return;
  }

  // Handle idle agent (finished a turn, needs follow-up input)
  if (agent.status === "idle") {
    agent.status = "running";
    agent.updatedAt = new Date().toISOString();
    await this.state.saveAgent(agent);
    // Fall through to send the message normally
  }

  if (agent.status !== "running")
    throw new Error(`Agent ${agentId} is not running (status: ${agent.status})`);

  if (agent.type === "external") {
    if (!this.socketServer?.sendToAgent(agentId, { type: "message", content: message })) {
      throw new Error(`Agent ${agentId} is not connected`);
    }
    return;
  }

  const proc = this.runningProcesses.get(agentId);
  if (!proc) throw new Error(`Agent ${agentId} has no active process`);
  proc.write(message + "\n");
}
```

Add import for `parseAllowDeny` at the top:

```typescript
import { parseAllowDeny } from "../bin/orra-hook.js";
```

- [ ] **Step 6: Add getters for turn preview**

Add a public method:

```typescript
getTurnPreview(agentId: string): string | null {
  return this.turnPreviews.get(agentId) ?? null;
}

getPendingQuestion(agentId: string): { tool: string; input: Record<string, unknown> } | null {
  const pending = this.pendingQuestions.get(agentId);
  if (!pending) return null;
  return { tool: pending.tool, input: pending.input };
}
```

- [ ] **Step 7: Verify build**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 8: Run full test suite**

```bash
npx vitest run
```

Expected: All tests PASS.

- [ ] **Step 9: Commit**

```bash
git add src/core/agent-manager.ts
git commit -m "feat: add question handling, turn_complete handling, and log offset tracking to AgentManager"
```

---

### Task 6: Update orra_spawn to Install Hooks

**Files:**
- Modify: `src/core/agent-manager.ts` (spawnAgent method)

- [ ] **Step 1: Add hook installation to spawnAgent**

In the `spawnAgent` method, after creating the worktree and before spawning the claude process, add hook installation:

```typescript
// Write .claude/settings.json with hooks in the worktree
const hookScriptPath = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "bin", "orra-hook.js");
const claudeSettingsDir = path.join(worktreePath, ".claude");
await fs.mkdir(claudeSettingsDir, { recursive: true });
await fs.writeFile(
  path.join(claudeSettingsDir, "settings.json"),
  JSON.stringify({
    hooks: {
      PermissionRequest: [{
        matcher: "",
        hooks: [{ type: "command", command: `node ${hookScriptPath}`, timeout: 300 }],
      }],
      Stop: [{
        matcher: "",
        hooks: [{ type: "command", command: `node ${hookScriptPath}`, timeout: 5 }],
      }],
    },
  }, null, 2)
);
```

Add `import * as fs from "node:fs/promises";` at the top (rename the existing import if needed, or use the `fs/promises` module).

Note: the existing `state.ts` already imports `fs/promises`. The `agent-manager.ts` doesn't import `fs` yet — add it.

Also update the `processes.spawn` call to pass `ORRA_AGENT_ID` in the environment:

```typescript
const managed = this.processes.spawn({
  command: "claude",
  args: claudeArgs,
  cwd: worktreePath,
  onData: (data) => parser.feed(data),
  onExit: (exitCode) => this.handleAgentExit(agentId, exitCode),
  env: { ORRA_AGENT_ID: agentId },
});
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

Expected: All tests PASS. The existing spawn tests don't actually spawn claude, so the settings.json write may fail in test temp dirs without a worktree. If tests fail, wrap the settings write in a try/catch (the hook is optional — spawning should still work without it).

- [ ] **Step 4: Commit**

```bash
git add src/core/agent-manager.ts
git commit -m "feat: orra_spawn installs Claude Code hooks and sets ORRA_AGENT_ID env var"
```

---

### Task 7: Update orra_list and orra_status for Previews

**Files:**
- Modify: `src/tools/list-agents.ts`
- Modify: `src/tools/get-agent-status.ts`

- [ ] **Step 1: Update list-agents.ts**

Replace `src/tools/list-agents.ts`:

```typescript
import type { AgentManager } from "../core/agent-manager.js";

export async function handleListAgents(manager: AgentManager) {
  const agents = await manager.listAgents();
  const summary = agents.map((a) => {
    const base: Record<string, unknown> = {
      id: a.id,
      type: a.type,
      task: a.task,
      branch: a.branch,
      status: a.status,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    };

    if (a.status === "idle") {
      const preview = manager.getTurnPreview(a.id);
      if (preview) base.preview = preview;
    }

    if (a.status === "waiting") {
      const question = manager.getPendingQuestion(a.id);
      if (question) base.pendingQuestion = `${question.tool}: ${JSON.stringify(question.input)}`;
    }

    return base;
  });

  return {
    content: [
      {
        type: "text" as const,
        text: agents.length === 0
          ? "No agents found."
          : JSON.stringify(summary, null, 2),
      },
    ],
  };
}
```

- [ ] **Step 2: Update get-agent-status.ts**

In `src/tools/get-agent-status.ts`, add preview and pending question to the response:

Replace the return statement in the success path:

```typescript
const result = await manager.getAgentStatus(args.agentId);
if (!result) {
  return {
    content: [{ type: "text" as const, text: `Agent ${args.agentId} not found.` }],
    isError: true,
  };
}

const response: Record<string, unknown> = {
  ...result.agent,
  recentOutput: result.recentOutput,
};

if (result.agent.status === "idle") {
  const preview = manager.getTurnPreview(args.agentId);
  if (preview) response.turnPreview = preview;
}

if (result.agent.status === "waiting") {
  const question = manager.getPendingQuestion(args.agentId);
  if (question) response.pendingQuestion = { tool: question.tool, input: question.input };
}

return {
  content: [
    {
      type: "text" as const,
      text: JSON.stringify(response, null, 2),
    },
  ],
};
```

- [ ] **Step 3: Verify build**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/tools/list-agents.ts src/tools/get-agent-status.ts
git commit -m "feat: show turn previews and pending questions in orra_list and orra_status"
```

---

### Task 8: Integration Test — Hooks End-to-End

**Files:**
- Create: `tests/integration/hooks.test.ts`

- [ ] **Step 1: Write integration test**

Create `tests/integration/hooks.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as net from "node:net";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execSync } from "node:child_process";
import { AgentManager } from "../../src/core/agent-manager.js";

describe("Hooks System (integration)", () => {
  let tmpDir: string;
  let manager: AgentManager;
  let sockPath: string;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "orra-hooks-test-"));
    execSync("git init", { cwd: tmpDir });
    execSync("git commit --allow-empty -m 'init'", { cwd: tmpDir });

    manager = new AgentManager(tmpDir);
    await manager.init();
    sockPath = path.join(tmpDir, ".orra", "orra.sock");

    // Create a fake agent state so we can test hook messages
    const { StateManager } = await import("../../src/core/state.js");
    const state = new StateManager(tmpDir);
    await state.saveAgent({
      id: "test-agent-a1b2",
      type: "spawned",
      task: "test task",
      branch: "orra/test",
      worktree: "worktrees/test",
      pid: 0,
      status: "running",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      exitCode: null,
      model: null,
      allowedTools: null,
    });
    await state.appendLog("test-agent-a1b2", "Working on stuff...\nDoing things...\nWhich option? A or B?\n");
  });

  afterEach(async () => {
    await manager.shutdown();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should handle permission question and block until answered", async () => {
    // Simulate hook sending a question
    const hookSocket = net.createConnection(sockPath);
    await new Promise<void>((resolve) => hookSocket.on("connect", resolve));

    hookSocket.write(JSON.stringify({
      type: "question",
      agentId: "test-agent-a1b2",
      tool: "Bash",
      input: { command: "rm -rf /tmp/test" },
    }) + "\n");

    await new Promise((r) => setTimeout(r, 200));

    // Agent should be in waiting status
    const status = await manager.getAgentStatus("test-agent-a1b2");
    expect(status!.agent.status).toBe("waiting");

    // Pending question should be visible
    const question = manager.getPendingQuestion("test-agent-a1b2");
    expect(question).not.toBeNull();
    expect(question!.tool).toBe("Bash");

    // Answer via orra_message
    const received: string[] = [];
    hookSocket.on("data", (data) => received.push(data.toString()));

    await manager.sendMessage("test-agent-a1b2", "yes");
    await new Promise((r) => setTimeout(r, 100));

    // Hook should have received the answer
    const answer = JSON.parse(received[received.length - 1].trim());
    expect(answer.type).toBe("answer");
    expect(answer.allow).toBe(true);

    // Agent should be back to running
    const statusAfter = await manager.getAgentStatus("test-agent-a1b2");
    expect(statusAfter!.agent.status).toBe("running");

    hookSocket.destroy();
  });

  it("should handle permission denial", async () => {
    const hookSocket = net.createConnection(sockPath);
    await new Promise<void>((resolve) => hookSocket.on("connect", resolve));

    hookSocket.write(JSON.stringify({
      type: "question",
      agentId: "test-agent-a1b2",
      tool: "Bash",
      input: { command: "rm -rf /" },
    }) + "\n");

    await new Promise((r) => setTimeout(r, 200));

    const received: string[] = [];
    hookSocket.on("data", (data) => received.push(data.toString()));

    await manager.sendMessage("test-agent-a1b2", "no, that's dangerous");
    await new Promise((r) => setTimeout(r, 100));

    const answer = JSON.parse(received[received.length - 1].trim());
    expect(answer.type).toBe("answer");
    expect(answer.allow).toBe(false);
    expect(answer.reason).toBe("no, that's dangerous");

    hookSocket.destroy();
  });

  it("should handle turn_complete and set idle status with preview", async () => {
    const hookSocket = net.createConnection(sockPath);
    await new Promise<void>((resolve) => hookSocket.on("connect", resolve));

    hookSocket.write(JSON.stringify({
      type: "turn_complete",
      agentId: "test-agent-a1b2",
    }) + "\n");

    await new Promise((r) => setTimeout(r, 200));

    const status = await manager.getAgentStatus("test-agent-a1b2");
    expect(status!.agent.status).toBe("idle");

    const preview = manager.getTurnPreview("test-agent-a1b2");
    expect(preview).toContain("Which option? A or B?");

    hookSocket.destroy();
  });

  it("should resume idle agent via orra_message", async () => {
    // First set agent to idle via turn_complete
    const hookSocket = net.createConnection(sockPath);
    await new Promise<void>((resolve) => hookSocket.on("connect", resolve));

    hookSocket.write(JSON.stringify({
      type: "turn_complete",
      agentId: "test-agent-a1b2",
    }) + "\n");
    hookSocket.destroy();

    await new Promise((r) => setTimeout(r, 200));

    // Agent is idle, message should set it back to running
    // (This will throw because there's no actual PTY, but the status change should happen)
    try {
      await manager.sendMessage("test-agent-a1b2", "option A");
    } catch {
      // Expected: no active process for this test agent
    }

    const status = await manager.getAgentStatus("test-agent-a1b2");
    expect(status!.agent.status).toBe("running");
  });
});
```

- [ ] **Step 2: Run integration test**

```bash
npx vitest run tests/integration/hooks.test.ts
```

Expected: All 4 tests PASS.

- [ ] **Step 3: Run full suite**

```bash
npx vitest run
```

Expected: All tests PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/integration/hooks.test.ts
git commit -m "test: add integration tests for hooks system (question/answer, turn_complete, idle resume)"
```

---

### Task 9: Final Verification

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

Expected: No errors. `dist/bin/orra-hook.js` exists.

- [ ] **Step 3: Verify hook script is in dist**

```bash
ls dist/bin/orra-hook.js
```

Expected: File exists.

- [ ] **Step 4: Verify orchestrator mode tools**

```bash
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.1.0"}}}\n{"jsonrpc":"2.0","method":"notifications/initialized"}\n{"jsonrpc":"2.0","id":2,"method":"tools/list"}\n' | timeout 5 node dist/index.js 2>/dev/null | tail -1 | python3 -c "import sys,json; tools=json.load(sys.stdin)['result']['tools']; [print(t['name']) for t in tools]"
```

Expected: 7 orchestrator tools.

- [ ] **Step 5: Commit any fixes**

```bash
npx vitest run
```

If all pass, done. If fixes needed, commit them.
