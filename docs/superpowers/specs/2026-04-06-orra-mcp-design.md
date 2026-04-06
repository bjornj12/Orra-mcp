# Orra MCP — Design Spec

## Overview

An MCP server (stdio transport) that turns any Claude Code terminal into a multi-agent orchestrator. Each agent runs in its own git worktree with its own interactive Claude Code session. The MCP server provides tools to spawn, monitor, message, chain, and stop agents.

Install: `claude mcp add orra -- npx orra-mcp`

## Architecture

```
Your Terminal (Claude Code)
    ↕ stdio MCP (stdin/stdout)
orra-mcp server (Node.js, single process)
    ├── MCP tool handlers (one per tool)
    ├── AgentManager (spawn, monitor, kill, message)
    ├── WorktreeManager (git worktree add/remove)
    ├── ProcessManager (node-pty lifecycle)
    ├── StreamParser (parse output from agent PTY)
    ├── StateManager (read/write .orra/ filesystem state)
    └── Linker (agent chaining + template variable expansion)
         ↓
    Agent PTY processes (children of MCP server)
    ├── Agent A: claude in worktrees/auth-refactor-a1b2/
    ├── Agent B: claude in worktrees/fix-billing-c3d4/
    └── Agent C: claude in worktrees/add-tests-e5f6/
```

## Tools

### spawn_agent

Creates a git worktree, spawns an interactive `claude` session in it via PTY, and returns the agent ID.

**Input:**
- `task` (string, required) — The task description/prompt for the agent
- `branch` (string, optional) — Custom branch name. Default: auto-generated from task slug + short ID
- `model` (string, optional) — Model override (e.g., `"sonnet"`, `"opus"`)
- `allowedTools` (string[], optional) — Restrict which tools the agent can use

**Behavior:**
1. Generate agent ID: slugified task + 4-char random hex (e.g., `auth-refactor-a1b2`)
2. Create worktree: `git worktree add worktrees/<id> -b orra/<id>`
3. Write initial state to `.orra/agents/<id>.json` (status: `running`)
4. Spawn `claude` via `node-pty` in the worktree directory, passing the task as initial prompt
5. Pipe PTY stdout to `StreamParser` → writes to `.orra/agents/<id>.log`
6. Register process exit handler → updates state, triggers linker check

**Returns:** `{ agentId, branch, worktree }`

### list_agents

**Input:** none

**Behavior:** Reads all `.orra/agents/*.json` files. For agents marked `running`, checks if PID is still alive and updates status to `interrupted` if not.

**Returns:** Array of `{ id, task, branch, status, createdAt, updatedAt }`

### get_agent_status

**Input:**
- `agentId` (string, required)

**Behavior:** Reads `.orra/agents/<id>.json` and last 50 lines of `.orra/agents/<id>.log`.

**Returns:** Full agent metadata + recent output lines

### get_agent_output

**Input:**
- `agentId` (string, required)
- `tail` (number, optional) — Number of lines from end. Default: all

**Behavior:** Reads `.orra/agents/<id>.log`. If `tail` is set, returns last N lines.

**Returns:** Agent output as text

### stop_agent

**Input:**
- `agentId` (string, required)
- `cleanup` (boolean, optional, default: false) — If true, also remove the worktree

**Behavior:**
1. Read agent state, verify it exists
2. If process is running: kill via `pty.kill(SIGTERM)`, wait up to 5s, then `SIGKILL` if needed
3. Update state to `killed`
4. If `cleanup: true`: run `git worktree remove worktrees/<id> --force` and `git branch -D orra/<id>` (only if branch is fully merged; warn otherwise)

**Returns:** `{ agentId, status: "killed", cleaned: boolean }`

### send_message

**Input:**
- `agentId` (string, required)
- `message` (string, required)

**Behavior:**
1. Look up agent, verify status is `running` and PID is alive
2. Write `message + '\n'` to the agent's PTY stdin

**Returns:** `{ agentId, sent: true }`

### link_agents

**Input:**
- `from` (string, required) — Source agent ID
- `to` (object, required) — `{ task: string, branch?: string, model?: string }`
- `on` (enum, required) — `"success"` | `"failure"` | `"any"`

**Behavior:**
1. Validate `from` agent exists
2. Store link in `.orra/links.json` with status `pending` (template variables are stored unexpanded)
3. If `from` agent has already completed and matches the condition, expand templates and fire immediately

**Trigger:** When the `from` agent's PTY process exits:
- Exit code 0 → `success`
- Exit code non-zero → `failure`
- Both match `any`
- If condition matches, auto-call `spawn_agent` with the link's `to` config (after template expansion)
- Update link status to `fired` with the new agent ID

**Returns:** `{ linkId, from, on, status: "pending"|"fired" }`

## State

All state lives in `.orra/` at the project root (the git repo's root directory).

### .orra/config.json

```json
{
  "defaultModel": null,
  "defaultAllowedTools": null
}
```

### .orra/agents/<id>.json

```json
{
  "id": "auth-refactor-a1b2",
  "task": "Refactor the auth middleware to use JWT",
  "branch": "orra/auth-refactor-a1b2",
  "worktree": "worktrees/auth-refactor-a1b2",
  "pid": 12345,
  "status": "running",
  "createdAt": "2026-04-06T14:30:00.000Z",
  "updatedAt": "2026-04-06T14:30:00.000Z",
  "exitCode": null,
  "model": null,
  "allowedTools": null
}
```

**Status values:** `running`, `completed`, `failed`, `interrupted`, `killed`

### .orra/agents/<id>.log

Raw captured output from the agent's PTY stdout. Append-only. One line per output chunk.

### .orra/links.json

```json
[
  {
    "id": "link-x1y2",
    "from": "auth-refactor-a1b2",
    "to": { "task": "Review changes on branch {{from.branch}}" },
    "on": "success",
    "status": "pending",
    "firedAgentId": null,
    "createdAt": "2026-04-06T14:35:00.000Z"
  }
]
```

**Status values:** `pending`, `fired`, `expired` (if `from` agent completed but condition didn't match)

## Process Model

### Agent Lifecycle

1. **Spawn:** `WorktreeManager.create()` → `ProcessManager.spawn()` → state written as `running`
2. **Running:** PTY stdout streams to `.log` file. StreamParser watches for structured signals.
3. **Message:** `pty.write(message + '\n')` injects into agent's stdin
4. **Exit:** Process exit triggers state update → `Linker.check()` evaluates pending links
5. **Kill:** `SIGTERM` → 5s grace → `SIGKILL` if needed → state updated to `killed`

### MCP Server Startup

1. Read `.orra/agents/*.json`
2. For each agent with status `running`: check if PID exists
3. If PID is dead: update status to `interrupted`
4. Read `.orra/links.json` — pending links remain pending (user can re-trigger manually)

### MCP Server Shutdown

1. All child PTY processes receive `SIGTERM` (automatic via process group)
2. State files are NOT updated on unclean shutdown — next startup handles reconciliation

## Stream Parsing

The StreamParser reads PTY stdout and:
1. Appends all output to the agent's `.log` file
2. Watches for completion markers in the output (agent process exit is the primary signal)
3. Strips ANSI escape sequences for clean log storage

The primary completion signal is process exit code (0 = success, non-zero = failure). Stream parsing is secondary — used for richer status reporting, not control flow.

## Error Handling

- **Worktree creation fails** (dirty state, branch exists): Return error to the MCP caller with specific reason. Don't retry.
- **PTY spawn fails** (claude not found, permission denied): Write state as `failed`, return error.
- **Agent crashes mid-work**: Process exit with non-zero code → state updated to `failed`, links checked.
- **MCP server crashes**: On next startup, reconciliation marks orphaned agents as `interrupted`.
- **send_message to dead agent**: Return error "agent is not running".
- **Worktree cleanup of unmerged branch**: Warn in response, don't delete unless `cleanup: true` was explicit.

## Tech Stack

- **Runtime:** Node.js 20+
- **Language:** TypeScript 5.x
- **MCP SDK:** `@modelcontextprotocol/sdk` (stdio transport)
- **PTY:** `node-pty`
- **Validation:** `zod`
- **Testing:** `vitest`
- **Zero external services** — no database, no network dependencies beyond the MCP stdio pipe

## Project Structure

```
orra-mcp/
├── src/
│   ├── index.ts                — Entry point, stdio transport setup
│   ├── server.ts               — MCP server definition + tool registration
│   ├── tools/
│   │   ├── spawn-agent.ts      — spawn_agent tool handler
│   │   ├── list-agents.ts      — list_agents tool handler
│   │   ├── get-agent-status.ts — get_agent_status tool handler
│   │   ├── get-agent-output.ts — get_agent_output tool handler
│   │   ├── stop-agent.ts       — stop_agent tool handler
│   │   ├── send-message.ts     — send_message tool handler
│   │   └── link-agents.ts      — link_agents tool handler
│   ├── core/
│   │   ├── agent-manager.ts    — High-level: spawn, stop, message, list
│   │   ├── worktree.ts         — git worktree add/remove/list
│   │   ├── process.ts          — node-pty spawn/kill/write
│   │   ├── stream-parser.ts    — Parse PTY output, strip ANSI, detect signals
│   │   ├── state.ts            — Read/write .orra/ JSON files
│   │   └── linker.ts           — Link storage, template expansion, trigger evaluation
│   └── types.ts                — TypeScript types + Zod schemas
├── tests/
│   ├── unit/                   — Pure logic tests (state, linker, stream-parser, etc.)
│   └── integration/            — Tests with real git worktrees + process spawning
├── package.json
├── tsconfig.json
└── README.md
```

## Out of Scope (MVP)

- Agent-to-agent MCP connections
- Pipeline templates
- CLI companion
- Auto-cleanup of worktrees
- Web dashboard
- Remote/distributed agents
