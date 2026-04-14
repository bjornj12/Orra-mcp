# Orra MCP

> An assistant orchestrator for Claude Code that tracks your worktrees,
> learns with you, and handles routine maintenance in the background.

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

### 1. Install

```bash
npm install -g orra-mcp
claude mcp add orra -- orra-mcp
```

Or without a global install: `claude mcp add orra -- npx orra-mcp`

### 2. Add orchestrator instructions to your project CLAUDE.md

```bash
curl -sL https://raw.githubusercontent.com/bjornj12/Orra-mcp/main/CLAUDE.template.md >> your-project/CLAUDE.md
```

This tells Claude to use Orra for worktree management instead of doing the work directly.

### 3. Restart Claude Code, then scaffold the project

In your fresh session, run:

> "run orra_setup"

This creates `.orra/config.json`, installs the orchestrator persona into `.claude/agents/`, adds `.orra/` to `.gitignore`, and scaffolds the memory layer. Idempotent — safe to re-run.

### 4. Install the directive pack

> "install all orra directives"

Copies the full directive library (10 directives) into `.orra/directives/`. Each declares its own "lane" so they compose without conflict. Restart your session to load them.

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

## Further reading

- [docs/directives.md](docs/directives.md) — writing and composing directives
- [docs/memory-layer.md](docs/memory-layer.md) — daily notes, commitments, Obsidian setup
- [docs/headless-spawning.md](docs/headless-spawning.md) — `orra_spawn` safety + auto-remediator
- [docs/state-providers.md](docs/state-providers.md) — integrating a dashboard
- [docs/architecture.md](docs/architecture.md) — source layout and filesystem state

## License

MIT
