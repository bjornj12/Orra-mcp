# Orra MCP

> An assistant orchestrator for Claude Code that tracks your worktrees,
> learns with you, and handles routine maintenance in the background.

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
      • Needs attention: onboarding — waiting on a permission prompt
      Recommended first action: unblock onboarding (30s), then JWT.
      What's your plan for today?

You: focus is JWT, ship by 4pm.

Orra: Got it. I'll align suggestions to that. Spawning a background
      agent to rebase the 2 stale worktrees while you work — they'll
      be ready when you come back to them.
```

Orra is an assistant orchestrator: it learns your day, keeps you focused,
and quietly takes care of the background.

## What it is

Orra is an MCP server that gives Claude Code three capabilities it doesn't have on its own:

- **Awareness** — scans every worktree and ticket you're touching, classifies status (`ready_to_land`, `needs_attention`, `in_progress`, `idle`, `stale`), and pre-computes per-agent summaries so you don't have to re-parse logs.
- **Learning** — a markdown memory layer under `.orra/memory/`. Daily notes, commitments, per-worktree notes, and weekly retros persist across sessions. Directives like `morning-briefing` and `shutdown-ritual` maintain it for you.
- **Side tasks** — `orra_spawn` launches detached `claude --print` agents in worktrees to handle routine maintenance (rebases, lint fixes, snapshot updates) while you focus on the work that actually needs you.

## Quick start

### 1. Register the MCP server

```bash
claude mcp add orra -- npx orra-mcp
```

`npx` fetches and runs `orra-mcp` on demand — no global install needed. (If you'd rather install globally: `npm install -g orra-mcp` then `claude mcp add orra -- orra-mcp`.)

### 2. Scaffold the project

In any Claude session, run:

> "run orra_setup"

This creates `.orra/config.json`, installs the orchestrator persona at `.claude/agents/orchestrator.md`, adds `.orra/` to `.gitignore`, and scaffolds the memory layer. Idempotent — safe to re-run.

### 3. Install the directive pack

> "install all orra directives"

Copies the full directive library (10 directives) into `.orra/directives/`. Each declares its own "lane" so they compose without conflict.

### 4. Open Claude with the orchestrator persona

```bash
claude --agent orchestrator --model sonnet
```

The persona installed in step 2 takes over: the morning briefing fires on session start, directives load on their declared cadences, and `orra_scan` is the default first move.

**On the model:** the orchestrator's job is tool dispatch, log triage, and summarization — Sonnet handles all of it fluently at a fraction of the cost and latency of Opus. Save Opus for the actual coding work happening inside the worktrees. Alias the whole command (`alias claude='claude --agent orchestrator --model sonnet'`) to make it your default.

> **Prefer auto-loading without `--agent`?** Append [`CLAUDE.template.md`](CLAUDE.template.md) to your project's `CLAUDE.md` instead. The persona then runs in every session, no flag required. Trade-off: it lives in your project's CLAUDE.md, which you may not want for monorepos shared with other workflows.

## A day with Orra

### Morning — awareness

The briefing you just saw is the `morning-briefing` directive firing automatically on session start. It calls `orra_scan` (which pulls git state, PR state, agent state, and any state providers you've configured), reads yesterday's daily note, checks `commitments.md`, and composes the picture. Per-agent summaries are pre-computed so directives don't re-parse logs every time.

### Picking focus — partnership

```
You: focus is JWT refresh, ship by 4pm.

Orra: Got it. I'll align suggestions to that. If anything else starts
      clamoring for attention I'll tell you, but I won't derail you.
```

Orra writes your focus into today's daily note. Other directives (`pr-shepherd`, `wait-time-recycler`, `stale-cleanup`) defer to it — they won't interrupt you unless something genuinely blocks your focus.

### Side tasks — delegation

While you work on JWT, `auto-remediator` notices two worktrees are 12+ commits behind main and spawns headless agents to rebase them. Both run detached via `orra_spawn` with a locked-down tool allowlist (no `rm`, no network beyond `git`, no package installs). Results show up in the next `orra_scan`. You never had to stop working.

### End of day — memory

```
You: done for the day.

Orra: Wrapping up. Writing today's daily note:
      - Shipped: JWT refresh merged, onboarding permission resolved
      - Still open: AUTH-142 review feedback (parked)
      - Tomorrow's first move: address AUTH-142 feedback
      See you tomorrow.
```

The `shutdown-ritual` directive writes `.orra/memory/daily/<today>.md` with the shipped/open/first-move sections. Tomorrow's `morning-briefing` will read this and start you off exactly where you left off.

## Writing your own directive

Directives are plain markdown files in `.orra/directives/` that the orchestrator reads at session start and follows as standing instructions.

**The format:**

```markdown
## Directive Title

Describe when this fires and what to do, in free-form prose.

### On Session Start
(what to check, what to present)

### During the Session
(event-driven reactions)

### My Lane
(which concerns you own, so you compose cleanly with other directives)

### Dependencies
- orra_scan (or whatever tools/files you rely on)
```

No YAML frontmatter, no template engine — just markdown prose that Claude reads and follows.

**Two ways to create one:**

- **Live** — say *"add a directive called ci-guard that flags failing tests at session start"*. Orra calls `orra_directive` with `action: "add"`, writes the file, and applies the instruction to the current session immediately.
- **Manually** — create `.orra/directives/<name>.md` in your editor and restart the session.

**Fastest starting point:** copy a shipped directive and edit it. *"install the pr-shepherd directive"* puts `.orra/directives/pr-shepherd.md` on disk — open it, strip what you don't need, rename it. The shipped directives demonstrate every pattern.

Full authoring guide + explanation of the "lane" concept: **[docs/directives.md](docs/directives.md)**.

### Long sessions

Orra externalizes orchestrator state to `.orra/` so that `/compact` is survivable and heartbeat ticks stay lean. See [docs/context-management.md](docs/context-management.md).

## Tools

| Tool | Purpose |
|---|---|
| `orra_scan` | Scan every tracked worktree. Returns status, git/PR/agent state, and pre-computed summaries. Start here. |
| `orra_inspect` | Deep dive on one worktree — commit log, marker contents, conflict prediction, agent output tail. |
| `orra_register` | Start tracking an existing worktree (installs Claude Code hooks). |
| `orra_unblock` | Answer a pending permission prompt for a tracked agent. |
| `orra_kill` | Stop a tracked agent and optionally remove the worktree + branch. |
| `orra_rebase` | Rebase a worktree branch onto latest main. |
| `orra_setup` | Scaffold `.orra/` + install orchestrator persona. Run once per project. |
| `orra_directive` | Manage directives (add, list, remove, install shipped ones). |
| `orra_spawn` | Spawn a detached headless agent for routine maintenance. |

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

See **[CONTRIBUTING.md](CONTRIBUTING.md)** for contribution guidelines.

## Bugs and feature requests

Please [open an issue](https://github.com/bjornj12/Orra-mcp/issues/new/choose) — the templates will guide you through what to include. For security vulnerabilities, see [SECURITY.md](SECURITY.md) instead.

## Further reading

- [docs/directives.md](docs/directives.md) — writing and composing directives
- [docs/memory-layer.md](docs/memory-layer.md) — daily notes, commitments, Obsidian setup
- [docs/headless-spawning.md](docs/headless-spawning.md) — `orra_spawn` safety + auto-remediator
- [docs/state-providers.md](docs/state-providers.md) — integrating a dashboard
- [docs/architecture.md](docs/architecture.md) — source layout and filesystem state

## License

MIT
