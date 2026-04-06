# Orra MCP

An MCP server that turns any Claude Code terminal into a multi-agent orchestrator. No app, no GUI — your terminal is the command center.

Say "spawn an agent to refactor auth" and Orra MCP creates a git worktree, launches a Claude Code session in it, and gives you tools to monitor, message, chain, and stop agents — all from your current Claude Code session.

```
Your Terminal (Claude Code)
    ↕ stdio MCP
orra-mcp server
    ├── orra_spawn     → git worktree + claude session
    ├── orra_list      → all agents with status
    ├── orra_status    → one agent's state + recent output
    ├── orra_output    → full/tail of agent's stream
    ├── orra_stop      → kill process + optional cleanup
    ├── orra_message   → inject input to running agent
    └── orra_link      → when A finishes, B starts
         ↓
    Agent processes (PTY children)
    ├── Agent A: claude in worktrees/auth-refactor/
    ├── Agent B: claude in worktrees/fix-billing/
    └── Agent C: claude in worktrees/add-tests/
```

## Install

```bash
claude mcp add orra -- npx orra-mcp
```

That's it. The MCP server runs as a stdio subprocess — Claude Code spawns it automatically.

## How It Works

1. **You ask** Claude Code to spawn an agent with a task
2. **Orra MCP** creates a git worktree and launches `claude` in it via PTY
3. **The agent** works independently — committing to its own branch
4. **You monitor** via `orra_list`, `orra_status`, `orra_output`
5. **You interact** via `orra_message` to course-correct running agents
6. **You chain** via `orra_link` — "when auth agent finishes, spawn a review agent"
7. **You merge** the branch when ready, then clean up with `orra_stop`

## Tools

| Tool | Purpose |
|------|---------|
| `orra_spawn` | Create worktree + start Claude with a task |
| `orra_list` | All agents with status, branch, last activity |
| `orra_status` | One agent's detailed state + recent output |
| `orra_output` | Full or tail of agent's captured output |
| `orra_stop` | Kill process, optionally remove worktree |
| `orra_message` | Send a message to a running agent's session |
| `orra_link` | When A completes → auto-spawn B with context |

### Agent Linking

Chain agents together with template variables:

```
orra_link({
  from: "auth-agent",
  to: { task: "Review changes on branch {{from.branch}}" },
  on: "success"
})
```

Available template variables: `{{from.branch}}`, `{{from.worktree}}`, `{{from.task}}`, `{{from.status}}`

## State

All state lives on the filesystem — no database required:

```
.orra/
├── config.json             — project settings
├── agents/
│   ├── <id>.json           — agent metadata (task, branch, pid, status)
│   └── <id>.log            — captured output from agent
└── links.json              — coordination rules
```

Agents are ephemeral processes (they die with the MCP server), but state persists. On restart, running agents are marked `interrupted` and `orra_list` shows the full history so you can re-spawn incomplete work.

## Design Decisions

- **stdio MCP** — simplest integration, Claude Code spawns it automatically
- **Interactive PTY via `node-pty`** — agents run full `claude` sessions, enabling `orra_message`
- **Filesystem state** — `.orra/` is human-readable, no external services
- **Worktrees persist** — until branch is merged and explicitly cleaned up
- **Ephemeral processes, persistent history** — agents don't survive restarts, but their state does

## Tech Stack

- TypeScript, Node.js 20+
- `@modelcontextprotocol/sdk` (stdio transport)
- `node-pty` (PTY management)
- `zod` (schema validation)
- `vitest` (testing)

## Roadmap

### v1 (MVP) — Current

Core orchestration: spawn, monitor, message, chain, and stop agents in git worktrees.

### v2 — Agent-to-Agent Communication

Agents get their own MCP connection with tools like `report_status` and `get_sibling_status`. Agents become aware of each other and can coordinate without routing through the orchestrator.

### v3 — Pipeline Templates

Structured multi-stage workflows. Define reusable pipelines like `spec → implement → review → merge` as templates. Run a task through a pipeline and Orra MCP handles the stage transitions, review gates, and escalation to the user when confidence is low.

### v4 — CLI Companion

`orra` CLI for non-MCP usage. Spawn and manage agents from any terminal without Claude Code. Same `.orra/` state, same worktree model — just a different interface.

### v5 — Distributed Agents

Agents running on remote machines. SSH-based worktree creation, remote PTY management, and cross-machine coordination. For teams that want to throw more compute at a problem.

## License

MIT
