# Orra MCP — Agent Orchestration

You have access to the `orra` tool for managing parallel Claude Code agents in git worktrees.

## When to use `orra`

**ALWAYS use `orra` when the user asks you to:**
- Spawn, start, or create an agent
- Work in a worktree (delegate it to an agent, don't cd into it yourself)
- Check on, monitor, or list agents
- Send a message to an agent
- Chain or link agents together
- Take over an agent's work

**DO NOT** cd into worktrees and do the work yourself. You are the orchestrator — you delegate to agents and monitor their progress.

## Quick reference

```
orra({ action: "spawn", task: "..." })              — start agent on a task
orra({ action: "list" })                             — show all agents
orra({ action: "status", agentId: "..." })           — one agent's details
orra({ action: "output", agentId: "...", tail: 20 }) — read agent logs
orra({ action: "message", agentId: "...", message: "..." }) — send input
orra({ action: "stop", agentId: "..." })             — stop an agent
orra({ action: "link", from: "...", to: { task: "..." }, on: "success" }) — chain agents
orra({ action: "takeover", agentId: "..." })         — hand off to human
```

## Agent statuses

- **running** — actively working
- **idle** — finished a turn, may need your input (check the preview)
- **waiting** — blocked on a permission prompt (answer with `message`)
- **completed/failed** — done
- **interrupted** — lost connection
