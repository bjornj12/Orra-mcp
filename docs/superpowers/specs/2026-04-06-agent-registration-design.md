# Agent Registration — Design Spec

## Overview

Allow existing Claude Code terminals to register as agents with the Orra MCP orchestrator. A registered terminal becomes indistinguishable from a spawned agent — it shows up in `orra_list`, its output is captured, the orchestrator can send it messages, and links fire when it completes.

The same `orra-mcp` package runs in two modes: orchestrator (creates socket server, exposes management tools) or agent (connects to socket, exposes registration tools). Mode is auto-detected on startup.

## Architecture

```
Terminal A (orchestrator)              Terminal B (agent)
┌─────────────────────┐              ┌─────────────────────┐
│ Claude Code          │              │ Claude Code          │
│   ↕ stdio            │              │   ↕ stdio            │
│ orra-mcp             │              │ orra-mcp             │
│   mode: orchestrator │              │   mode: agent        │
│   tools: orra_spawn, │              │   tools: orra_register│
│     orra_list, etc.  │◄─── unix ───│     orra_unregister  │
│   socket server      │    socket   │     orra_heartbeat   │
│   .orra/orra.sock    │              │   socket client      │
└─────────────────────┘              └─────────────────────┘
```

## Dual-Mode MCP Server

### Mode Detection

On startup, before registering tools:

1. Resolve project root (walk up from `cwd` to find `.git`). If no `.git` found, use `cwd`.
2. Check if `.orra/orra.sock` exists and is connectable (try `net.connect`, timeout 500ms)
3. If connectable → **agent mode**
4. If not connectable or doesn't exist → **orchestrator mode**

### Orchestrator Mode

Same as current behavior, plus:
- Start a Unix domain socket server at `.orra/orra.sock`
- Accept connections from external agents
- Remove `.orra/orra.sock` on shutdown

Tool set: `orra_spawn`, `orra_list`, `orra_status`, `orra_output`, `orra_stop`, `orra_message`, `orra_link`

### Agent Mode

Exposes only agent-side tools. Does not create `.orra/` directory structure or start a socket server.

Tool set: `orra_register`, `orra_unregister`, `orra_heartbeat`

## Socket Protocol

JSON-newline protocol over Unix domain socket (`.orra/orra.sock`). Each message is a single JSON object followed by `\n`.

### Agent → Orchestrator

**register:** Sent immediately after connection.
```json
{"type": "register", "task": "Working on auth refactor", "branch": "feat/auth"}
```

**output:** Streamed activity updates.
```json
{"type": "output", "data": "Reading src/auth.ts and refactoring to use JWT\n"}
```

**status:** Sent on unregister or disconnect. Signals completion.
```json
{"type": "status", "status": "completed", "exitCode": 0}
```

### Orchestrator → Agent

**registered:** Confirmation with assigned agent ID.
```json
{"type": "registered", "agentId": "auth-refactor-a1b2"}
```

**message:** Message from orchestrator (via `orra_message`).
```json
{"type": "message", "content": "Also check the token refresh logic"}
```

**stop:** Request to disconnect (via `orra_stop`). The orchestrator cannot kill an external process, but it can ask it to stop.
```json
{"type": "stop", "reason": "Orchestrator requested stop"}
```

## Agent State Changes

The `AgentState` type gains a `type` field:

```typescript
export const AgentType = z.enum(["spawned", "external"]);

// Added to AgentStateSchema:
type: AgentType  // "spawned" for orra_spawn'd agents, "external" for registered
```

For external agents:
- `pid` is set to `0` (orchestrator doesn't own the process)
- `worktree` is set to the agent's working directory (reported during register, or empty)
- `branch` is auto-detected from git or provided by the agent

## Tool Behavior Changes

### Existing tools — uniform behavior

| Tool | Spawned agent | External agent |
|------|--------------|----------------|
| `orra_list` | No change | Shows with `type: "external"` |
| `orra_status` | No change | Same (reads state + log) |
| `orra_output` | No change | Same (log fed by socket output messages) |
| `orra_message` | Writes to PTY stdin | Sends `message` via socket |
| `orra_stop` | SIGTERM/SIGKILL + state update | Sends `stop` via socket + state update |
| `orra_link` | No change | No change (fires on completion regardless of type) |

### New tools (agent mode only)

#### orra_register

**Input:**
- `task` (string, required) — Description of what you're working on
- `branch` (string, optional) — Current branch. Auto-detected from `git branch --show-current` if omitted.

**Behavior:**
1. Connect to `.orra/orra.sock`
2. Send `register` message with task and branch
3. Receive `registered` confirmation with agent ID
4. Start forwarding: tool call activity → socket as `output` messages
5. Listen for incoming `message` and `stop` messages from orchestrator

**Returns:** `{ agentId, status: "registered" }`

**Error:** If socket doesn't exist or can't connect → "No Orra orchestrator found. Start one in another terminal first."

#### orra_unregister

**Input:**
- `status` (enum: `"completed"` | `"failed"`, default: `"completed"`)

**Behavior:**
1. Send `status` message via socket
2. Close socket connection
3. Orchestrator updates agent state, evaluates links

**Returns:** `{ agentId, status: "unregistered" }`

#### orra_heartbeat

**Input:**
- `activity` (string, required) — What you're currently doing

**Behavior:**
1. Send `output` message via socket with the activity text
2. This gets appended to the agent's `.log` file on the orchestrator side

**Returns:** `{ sent: true }`

This tool exists so the external agent can explicitly report what it's doing. The MCP server also automatically sends output messages for its own tool invocations, but `orra_heartbeat` gives the agent (or the user) a way to push richer context.

## Output Capture (Agent Side)

The agent-side MCP server captures activity through two channels:

1. **Automatic:** When any Orra tool is invoked on the agent side, the MCP server sends an `output` message with the tool name and a summary. This happens transparently.

2. **Explicit:** The user or Claude calls `orra_heartbeat` to report what's happening. This is the primary way to feed the orchestrator with status updates.

Full PTY-level output capture (seeing everything Claude does, including non-Orra tool calls) is out of scope for this spec. It would require Claude Code hooks or session log tailing, both of which add complexity and fragility.

## Socket Server (Orchestrator Side)

### Lifecycle

- Created during `AgentManager.init()` at `.orra/orra.sock`
- Accepts multiple concurrent connections (one per external agent)
- Each connection maps to one agent ID
- On MCP server shutdown: close all connections, remove `.orra/orra.sock`

### Connection Handling

For each incoming connection:

1. Wait for `register` message
2. Generate agent ID (same slug + hex pattern as spawned agents)
3. Write agent state to `.orra/agents/<id>.json` with `type: "external"`
4. Send `registered` response with agent ID
5. On `output` messages → append to `.orra/agents/<id>.log`
6. On `status` message → update agent state, evaluate links, close connection
7. On unexpected disconnect → mark agent as `interrupted`

### Sending to External Agents

`AgentManager` keeps a `Map<string, net.Socket>` for external agent connections (alongside the existing `Map<string, ManagedProcess>` for spawned agents).

- `sendMessage` checks: if agent has a socket → send `message` via socket. If agent has a process → write to PTY stdin.
- `stopAgent` checks: if agent has a socket → send `stop` via socket, wait for disconnect. If agent has a process → SIGTERM/SIGKILL.

## Project Structure Changes

```
src/
├── core/
│   ├── agent-manager.ts    — Add socket management, dual send/stop paths
│   ├── socket-server.ts    — NEW: Unix socket server, connection handling
│   ├── socket-client.ts    — NEW: Unix socket client, agent-side bridge
│   ├── state.ts            — Add AgentType to schema
│   └── ...                 — Existing files unchanged
├── tools/
│   ├── register.ts         — NEW: orra_register tool handler
│   ├── unregister.ts       — NEW: orra_unregister tool handler
│   ├── heartbeat.ts        — NEW: orra_heartbeat tool handler
│   └── ...                 — Existing files unchanged
├── server.ts               — Refactor: mode detection, conditional tool registration
├── index.ts                — Minor: pass mode to createServer
└── types.ts                — Add AgentType enum
```

## Error Handling

- **Socket already exists but not connectable:** Stale socket from crashed orchestrator. Orchestrator mode deletes it and creates a new one.
- **Agent disconnects without status message:** Orchestrator marks agent as `interrupted`.
- **Orchestrator shuts down with connected agents:** All connections close. External agents detect disconnect and stop forwarding. Agent state files remain for reconciliation on next startup.
- **Multiple agents register simultaneously:** Each gets its own connection and agent ID. No conflicts.
- **orra_register called when already registered:** Return error "Already registered as agent <id>".
- **orra_message to external agent whose socket died:** Return error "Agent is not connected".

## Out of Scope

- Full PTY output capture from external terminals
- Auto-discovery (agents must explicitly register)
- Agent-to-agent direct communication
- Remote agents (non-local sockets)
