# Orra MCP

Run multiple Claude Code agents in parallel. Monitor all of them from one terminal.

### The problem

You have 3 agents working in 3 worktrees. One is waiting for permission. One finished 10 minutes ago. One is asking you a question. You don't know any of this because you're alt-tabbing between terminals, losing track of who needs what.

### The fix

```
You (one terminal): "what's happening?"

  auth-agent      ⏳ waiting  "Allow Bash: npm install?"
  billing-agent   ✅ done     Finished — reviewer auto-spawned
  test-agent      💬 idle     "Which approach? A) mock B) real DB C) both"

You: "message auth-agent: yes"
You: "message test-agent: C"
```

One terminal. Full visibility. You only engage when someone needs you.

## Quick Start

### 1. Install

```bash
npm install -g orra-mcp
claude mcp add orra -- orra-mcp
```

Or without global install:

```bash
claude mcp add orra -- npx orra-mcp
```

### 2. Restart Claude Code

Start a new Claude Code session. Orra detects it's the first terminal and runs in **orchestrator mode** with all management tools.

### 3. Spawn your first agent

```
You: "spawn an agent to add input validation to the API"
```

Orra creates a git worktree, launches a Claude Code session in it, and the agent starts working on its own branch. You stay in your terminal, orchestrating.

### 4. Monitor and interact

```
You: "what agents are running?"        → orra_list
You: "how's the validation agent?"     → orra_status
You: "tell it to also check email format" → orra_message
```

### 5. Chain agents

```
You: "when the validation agent finishes, spawn a reviewer"
```

The reviewer auto-spawns when validation completes, with full context about the branch and task.

## How It Works

### Two Ways to Create Agents

**Spawn from the orchestrator (automated):**

Orra creates a worktree, launches `claude`, and manages the full lifecycle. You monitor and interact from your terminal.

```
You: "spawn an agent to refactor auth"
→ git worktree add worktrees/refactor-auth-a1b2 -b orra/refactor-auth-a1b2
→ claude starts working in the worktree
→ Agent shows up in orra_list
```

**Register an existing terminal (manual):**

Already have a Claude Code session running? Register it with the orchestrator. Open another terminal:

```
Terminal B: "register with Orra, I'm working on the billing fix"
→ orra_register connects to the orchestrator via Unix socket
→ Terminal B is now a tracked agent
→ Shows up in orra_list alongside spawned agents
```

### Dual-Mode Server

The same `orra-mcp` package runs in two modes, auto-detected on startup:

| Mode | When | Tools |
|------|------|-------|
| **Orchestrator** | First terminal (no existing socket) | `orra_spawn`, `orra_list`, `orra_status`, `orra_output`, `orra_stop`, `orra_message`, `orra_link`, `orra_install_hooks` |
| **Agent** | Socket exists (orchestrator running) | `orra_register`, `orra_unregister`, `orra_heartbeat`, `orra_install_hooks` |

### Automatic Input Detection

When agents need input — permission prompts, clarifying questions, or presenting options — Orra detects it automatically via Claude Code hooks:

```
orra_list shows:

  auth-agent     ⏳ waiting  "Allow Bash: npm install?"
  billing-agent  💬 idle     "Which approach? A) retry B) queue C) skip"
  test-agent     🔄 running  Writing integration tests...

You: "message auth-agent: yes"        → approves the permission
You: "message billing-agent: B"       → answers the question
```

**Setup hooks** (one-time per project):

```
You: "install Orra hooks"  → orra_install_hooks
```

This writes to `.claude/settings.local.json` (gitignored, per-user) so it doesn't affect other developers.

### Agent Chaining

Chain agents with template variables:

```
orra_link({
  from: "auth-agent",
  to: { task: "Review the changes on branch {{from.branch}}" },
  on: "success"
})
```

Available variables: `{{from.branch}}`, `{{from.worktree}}`, `{{from.task}}`, `{{from.status}}`

Trigger conditions: `"success"` (exit 0), `"failure"` (exit non-zero), `"any"`

### Custom Spawn Commands

If your team has custom worktree setup (copying files, configuring environments, sandbox scripts), configure a custom spawn command:

```json
// .orra/config.json
{
  "spawnCommand": "yarn sandbox {{branch}}",
  "defaultModel": null,
  "defaultAllowedTools": null
}
```

When `orra_spawn` runs, it executes your command instead of the default `git worktree add` + `claude`. Your script handles everything — worktree creation, env setup, starting claude. Orra wraps it in a PTY and monitors the output.

Template variables: `{{branch}}`, `{{task}}`, `{{agentId}}`

## Real-World Example: Multi-Agent Pipeline

Run multiple agent teams across different features, all monitored from one terminal:

```
You (Terminal A — orchestrator):

┌────────────────────────┬──────────┬────────────────────────────────────┐
│ payments-pipeline       │ 💬 idle  │ Lisa: "What should happen when     │
│                         │          │  payment fails mid-checkout?"      │
├────────────────────────┼──────────┼────────────────────────────────────┤
│ auth-refactor           │ 🔄 run  │ Milhouse: implementing JWT...      │
├────────────────────────┼──────────┼────────────────────────────────────┤
│ onboarding-flow         │ ⏳ wait  │ "Allow Bash: npm run migrate?"     │
├────────────────────────┼──────────┼────────────────────────────────────┤
│ api-v2                  │ ✅ done  │ Maggie: PR #312 approved           │
└────────────────────────┴──────────┴────────────────────────────────────┘

You: "message payments-pipeline: fail the order, refund, email the user"
You: "message onboarding-flow: yes"
```

Four workstreams, one terminal, you only engage when someone needs you.

## State

All state lives on the filesystem in `.orra/` — no database, no external services:

```
.orra/
├── orra.sock               — Unix socket (live while orchestrator runs)
├── config.json             — project settings + custom spawn command
├── agents/
│   ├── <id>.json           — agent metadata (task, branch, pid, status, type)
│   └── <id>.log            — captured output
└── links.json              — coordination rules
```

**Agent statuses:** `running`, `idle` (finished a turn), `waiting` (blocked on permission), `completed`, `failed`, `interrupted`, `killed`

**Persistence model:** Agent processes are ephemeral (die with the MCP server), but state files persist. On restart, `orra_list` shows the full history — you can re-spawn incomplete work.

## Tools Reference

### Orchestrator Mode

| Tool | Input | Description |
|------|-------|-------------|
| `orra_spawn` | `task`, `branch?`, `model?`, `allowedTools?` | Create a worktree and start a Claude agent |
| `orra_list` | — | List all agents with status, preview, pending questions |
| `orra_status` | `agentId` | Get detailed state + recent output for one agent |
| `orra_output` | `agentId`, `tail?` | Get full or last N lines of agent output |
| `orra_stop` | `agentId`, `cleanup?` | Stop agent, optionally remove worktree + branch |
| `orra_message` | `agentId`, `message` | Send input to agent (also answers permission prompts) |
| `orra_link` | `from`, `to`, `on` | Auto-spawn an agent when another completes |
| `orra_install_hooks` | — | Install input detection hooks in this project |

### Agent Mode

| Tool | Input | Description |
|------|-------|-------------|
| `orra_register` | `task`, `branch?` | Register this terminal as an agent |
| `orra_unregister` | `status?` | Unregister and report completion |
| `orra_heartbeat` | `activity` | Send a status update to the orchestrator |
| `orra_install_hooks` | — | Install input detection hooks in this project |

## Requirements

- Node.js 20+
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed
- A git repository (agents work in worktrees)

## Development

```bash
git clone https://github.com/bjornj12/Orra-mcp.git
cd Orra-mcp
npm install
npm run build
npm test
```

### Project Structure

```
src/
├── index.ts                — Entry point, mode detection, stdio transport
├── server.ts               — MCP server, conditional tool registration
├── types.ts                — Zod schemas, TypeScript types, socket protocol
├── bin/
│   └── orra-hook.ts        — Hook script for PermissionRequest + Stop events
├── core/
│   ├── agent-manager.ts    — Central orchestrator (spawn, stop, message, link)
│   ├── socket-server.ts    — Unix domain socket server (orchestrator side)
│   ├── socket-client.ts    — Unix domain socket client (agent side)
│   ├── worktree.ts         — Git worktree create/remove
│   ├── process.ts          — node-pty wrapper for PTY lifecycle
│   ├── stream-parser.ts    — ANSI stripping, output collection
│   ├── state.ts            — .orra/ filesystem state persistence
│   └── linker.ts           — Agent chaining, template expansion
└── tools/                  — One file per MCP tool handler
```

### Running Tests

```bash
npm test              # run all tests
npm run test:watch    # watch mode
```

132 tests across 13 test files covering unit tests (types, state, worktree, process, stream parser, linker, socket server/client, hook script) and integration tests (agent lifecycle, linking, external agents, hooks).

## Roadmap

### v1 (Current)

- Spawn and manage agents in git worktrees
- Register existing terminals as agents
- Automatic input detection via hooks
- Agent chaining with template variables
- Custom spawn commands for team workflows

### v2 — Pipeline Templates

Define reusable multi-stage workflows (`spec -> implement -> review -> merge`) as templates. Run a task through a pipeline and Orra handles stage transitions, review gates, and escalation.

### v3 — Agent-to-Agent Communication

Agents get their own MCP tools (`report_status`, `get_sibling_status`) to coordinate directly without routing through the orchestrator.

### v4 — CLI Companion

`orra` CLI for non-MCP usage. Spawn and manage agents from any terminal without Claude Code.

### v5 — Distributed Agents

Agents on remote machines. SSH-based worktree creation, remote PTY management, cross-machine coordination.

## License

MIT
