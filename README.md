# Orra

> Directive & intelligence layer over Claude Code's Agents View.

---

[![npm version](https://img.shields.io/npm/v/orra-mcp.svg?logo=npm&label=orra-mcp)](https://www.npmjs.com/package/orra-mcp)
[![npm downloads](https://img.shields.io/npm/dm/orra-mcp.svg)](https://www.npmjs.com/package/orra-mcp)
[![CI](https://img.shields.io/github/actions/workflow/status/bjornj12/Orra-mcp/ci.yml?branch=main&label=CI)](https://github.com/bjornj12/Orra-mcp/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/orra-mcp.svg)](https://github.com/bjornj12/Orra-mcp/blob/main/LICENSE)

**🌐 [Live site](https://bjornj12.github.io/Orra-mcp)** · [Star on GitHub](https://github.com/bjornj12/Orra-mcp) · [npm](https://www.npmjs.com/package/orra-mcp)

---

```
You: (just open Claude Code)

Orra: Morning. Yesterday's first move was: pick back up on JWT refresh.
      Today's situation:
      • Due today: AUTH-142 (in_progress, worktree auth-refactor)
      • Ready to land: billing-fix — PR approved, mergeable
      • Needs attention: onboarding — blocked (claude attach abc1234f)
      Recommended first action: triage onboarding (30s), then JWT.
      What's your plan for today?

You: focus is JWT, ship by 4pm.

Orra: Got it. I'll align suggestions to that. Spawning a background
      agent to rebase the 2 stale worktrees while you work — they'll
      be ready when you come back to them.
```

Orra is the standing orchestrator that babysits your other agents and keeps a
playbook. The [Agents View](https://docs.anthropic.com/claude-code) tells you
*"row 3 is waiting."* Orra reads what row 3 is waiting on, runs a directive
to handle it, keeps the memory layer, and reports a condensed picture.

## What it is

**Breaking change (v0.4+):** Orra no longer manages worktrees or spawns headless
processes — it rides on Claude Code's Agents View. `orra_register` and
`orra_unblock` are removed; use `claude attach <id>` instead. Requires Claude
Code ≥ 2.1.x.

Orra is a Claude Code plugin that gives you three capabilities:

- **Awareness** — `orra_scan` joins the daemon roster (`$CLAUDE_CONFIG_DIR/jobs/`)
  with `git worktree list`, PR data, and custom providers, classifies status
  (`ready_to_land`, `needs_attention`, `in_progress`, `idle`, `stale`), and
  pre-computes per-agent summaries so you don't re-parse transcripts.
- **Learning** — a markdown memory layer under `.orra/memory/`. Daily notes,
  commitments, per-worktree notes, and weekly retros persist across sessions.
  Directives like `morning-briefing` and `shutdown-ritual` maintain it for you.
- **Coordination** — `orra_spawn` wraps `claude --bg`; spawned sessions appear
  in `claude agents`. `orra_kill` calls `claude stop`/`claude rm`. Blocked
  agents surface as `needs_attention` with a `claude attach <id>` hint.

## Install

### Option A — as a Claude Code plugin (recommended, v0.4+)

```bash
# From a local clone (until the plugin marketplace is available)
claude --plugin-dir /path/to/orra-mcp
```

This registers the `orchestrator` agent, the `/orra` command, and the `orra-mcp`
MCP server. Then run `/orra` to launch the orchestrator as a persistent
background agent.

### Option B — as a standalone MCP server

```bash
claude mcp add orra -- npx orra-mcp
```

Then in a Claude session: *"run orra_setup"* to scaffold the project.

## Quick start (after install)

### 1. Scaffold the project

In any Claude session, run:

> "run orra_setup"

This creates `.orra/config.json`, installs the orchestrator agent at
`.claude/agents/orchestrator.md`, merges the Orra MCP server entry into
`.mcp.json`, writes a sample `WorktreeCreate` hook to
`.claude/hooks/worktree-create.sh`, and scaffolds the memory layer. Idempotent.

### 2. Install the directive pack

> "install all orra directives"

Copies the full directive library (10 directives) into `.orra/directives/`.
Each declares its own "lane" so they compose without conflict.

### 3. Start the orchestrator

```bash
orra
# or: claude --bg --agent orchestrator --name orra
```

The `orra` bin ensures the orchestrator is running as a named background agent
and prints the `claude attach orra` command. The orchestrator runs the
morning briefing on first session of the day, then keeps the heartbeat alive.

## A day with Orra

### Morning — awareness

The briefing fires automatically on session start (`morning-briefing` directive
with `session_start: auto`). It calls `orra_scan`, reads yesterday's daily note,
checks `commitments.md`, and composes the picture.

### Side tasks — delegation

While you work, `auto-remediator` notices stale worktrees and spawns bg agents
via `orra_spawn` (`claude --bg`) to rebase them. They appear in `claude agents`.
Results show up in the next `orra_scan`. You never had to stop.

### End of day — memory

`shutdown-ritual` writes `.orra/memory/daily/<today>.md` with shipped/open/
first-move sections. Tomorrow's `morning-briefing` reads this and starts you
exactly where you left off.

## Writing your own directive

Directives are markdown files in `.orra/directives/` that the orchestrator reads.

```markdown
---
heartbeat:
  cadence: 15m
---
## Directive Title
...
### Heartbeat invocation
(what to check each tick)
```

YAML frontmatter is optional. `session_start: auto` + `once_per: day` +
`resets_at: "HH:MM"` opts into auto-run at session start. See
[docs/directives.md](docs/directives.md).

## Tools (11)

| Tool | Purpose |
|---|---|
| `orra_scan` | Scan all worktrees. Daemon roster ⨝ git ⨝ PR ⨝ providers → classified view. |
| `orra_inspect` | Deep dive on one worktree — commit log, markers, conflict prediction, transcript tail. |
| `orra_kill` | Stop (`claude stop`) or remove (`claude rm`) a bg agent + optional PR cleanup. |
| `orra_rebase` | Rebase a worktree branch onto latest main. |
| `orra_setup` | Scaffold `.orra/` + install orchestrator agent + WorktreeCreate hook. Idempotent. |
| `orra_directive` | Manage directives (add, list, remove, install shipped ones). |
| `orra_spawn` | Spawn a bg agent via `claude --bg`. Sessions visible in `claude agents`. |
| `orra_resume` | Restore session state after `/compact`. |
| `orra_tick` | Heartbeat dispatcher — runs due directives. |
| `orra_checkpoint` | Write session state to disk for compact survival. |
| `orra_cache_write` | Write a subagent digest into the session cache. |

## Requirements

- Node.js 20+
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) ≥ 2.1.x with Agents View enabled
- A git repository

## Development

```bash
git clone https://github.com/bjornj12/Orra-mcp.git
cd Orra-mcp
npm install
npm run build
npm test
```

### Local development against a real project

```bash
npm run link:dev     # builds + globally links this worktree as orra-mcp
# after source changes:
npm run build       # symlink already targets dist/, no re-link needed
# when done:
npm run unlink:dev && npm i -g orra-mcp   # restore published version
```

## Bugs and feature requests

Please [open an issue](https://github.com/bjornj12/Orra-mcp/issues/new/choose).
For security vulnerabilities, see [SECURITY.md](SECURITY.md).

## Further reading

- [docs/directives.md](docs/directives.md) — writing and composing directives
- [docs/memory-layer.md](docs/memory-layer.md) — daily notes, commitments
- [docs/state-providers.md](docs/state-providers.md) — integrating a dashboard
- [docs/architecture.md](docs/architecture.md) — source layout and filesystem state

## License

MIT
