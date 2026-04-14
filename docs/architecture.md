# Architecture

Orra is an MCP (Model Context Protocol) server that Claude Code connects to. It has three responsibilities: **observe** worktrees (awareness), **coordinate** them (state management + hooks), and **spawn** detached agents for routine maintenance. All state lives on the filesystem under `.orra/` — no database, no external services.

## Source layout

```
src/
├── index.ts              — MCP server entry, stdio transport
├── server.ts             — Tool registration and dispatch
├── types.ts              — Root Zod schemas (shared across tools)
├── core/
│   ├── awareness.ts      — Scan engine: merges git + PR + agent state into classifications
│   ├── summary.ts        — Pre-computed per-agent summaries (test result, stuck reason, attention score)
│   ├── pipeline.ts       — Pipeline/stage detection from marker files
│   ├── log-parser.ts     — Agent log tailing and structured extraction
│   ├── config.ts         — .orra/config.json loader
│   ├── agent-manager.ts  — Spawn / stop / register / kill
│   ├── worktree.ts       — Git worktree create/remove helpers
│   ├── state.ts          — .orra/ filesystem persistence
│   ├── spawn-defaults.ts — Headless agent tool allowlist
│   └── providers/        — State provider pipeline (http/file/command + cache + merge)
├── tools/                — One file per MCP tool handler (9 tools)
│   ├── orra-scan.ts
│   ├── orra-inspect.ts
│   ├── orra-register.ts
│   ├── orra-unblock.ts
│   ├── orra-kill.ts
│   ├── orra-rebase.ts
│   ├── orra-setup.ts
│   ├── orra-directive.ts
│   └── orra-spawn.ts
├── bin/
│   ├── setup.ts          — Standalone setup CLI (`orra-setup`)
│   └── orra-hook.ts      — Hook script invoked by Claude Code events
└── templates/
    ├── orchestrator.md   — Orchestrator persona (copied to .claude/agents/)
    ├── directives/       — 10 shipped directives
    └── memory/           — Memory layer skeleton files

tests/
├── unit/                 — Unit tests per module
└── integration/          — End-to-end lifecycle tests
```

## `.orra/` filesystem state

Everything Orra knows about your project lives here. It's gitignored by default (added by `orra_setup`) because the contents are per-user session state and may include sensitive daily notes.

```
.orra/
├── config.json           — project settings: markers, staleDays, worktreeDir,
│                           driftThreshold, defaultModel, defaultAgent,
│                           headlessSpawnConcurrency, providers[]
├── agents/
│   ├── <id>.json         — agent metadata (status, pid, persona, task, reason)
│   ├── <id>.log          — captured stdout/stderr
│   └── <id>.answer.json  — pending permission answer queue
├── directives/           — user's active directives (markdown files)
└── memory/
    ├── index.md          — landing note
    ├── commitments.md    — Linear deadlines + ad-hoc promises
    ├── daily/<date>.md   — one file per session day
    ├── worktrees/<id>.md — per-worktree notes
    └── retros/           — weekly rollups (optional)
```

## The three subsystems

### Awareness

`awareness.ts` is the scanning engine. Given a project root, it walks every git worktree, collects git state (`git status`, `git log --oneline`, ahead/behind, uncommitted count), queries GitHub for PR state via `gh`, reads agent state from `.orra/agents/<id>.json`, runs state providers in parallel, and merges everything into a classification: `ready_to_land`, `needs_attention`, `in_progress`, `idle`, or `stale`.

`summary.ts` then pre-computes per-agent summaries so directives don't have to re-parse logs: test result (`passing` / `failing` / `unknown`), stuck detection (time since last log activity), attention score (a heuristic that combines PR state + test result + agent status), and the last N log lines.

The output is cached and returned by `orra_scan`. Directives consume it directly rather than re-running scans.

### Coordination

`agent-manager.ts` is the central coordinator. It owns the lifecycle of tracked agents — spawn, stop, kill, register existing worktrees, answer permission prompts. It writes to `.orra/agents/<id>.json` and listens for filesystem events on `.orra/agents/<id>.answer.json` (the permission answer queue).

Claude Code hooks connect the two sides. On `orra_register`, Orra installs hooks into `.claude/settings.local.json` so that Claude Code's `PermissionRequest` and `Stop` events invoke `src/bin/orra-hook.ts`, which writes the event to the appropriate state file. The MCP server picks up the change and reflects it in the next `orra_scan`.

### Spawning

`orra_spawn` creates detached `claude --print` processes in worktrees for routine maintenance. The detached model is intentional: the agent survives MCP server restarts, and its exit code is captured on next scan. The `spawn-defaults.ts` allowlist locks headless agents to a safe tool set by default.

See [docs/headless-spawning.md](headless-spawning.md) for the full safety model.

## Hooks system

Claude Code fires hook events at specific points in its lifecycle. Orra registers two:

- **`PermissionRequest`** — fires when Claude Code wants to run a tool that needs user approval. Orra's hook writes the request to `.orra/agents/<id>.json`'s `pendingQuestion` field so `orra_scan` surfaces it, and `orra_unblock` can answer.
- **`Stop`** — fires when a Claude Code turn completes. Orra's hook updates the agent's `status` field (e.g., `running` → `idle` → `completed`).

Hooks are installed to `.claude/settings.local.json` (user-local, gitignored) so they don't affect other developers on the same project.

## Tools layer

Each MCP tool is a single file under `src/tools/`. A tool file exports:

1. **A Zod schema** — declares the tool's input parameters with descriptions.
2. **A handler function** — takes the validated input and returns an MCP response (`content: [{ type: "text", text: ... }]`).

Registering a new tool means adding the file, importing it in `src/server.ts`, and listing it in the server's tool registration block. See `CONTRIBUTING.md` for the full checklist.

## Testing

```bash
npm test          # run all tests (vitest)
npm run build     # tsc compile + copy templates
npm run test:watch
```

**Unit tests** (`tests/unit/`) cover the scan engine, provider pipeline (http/file/command/cache/merge), state persistence, worktree helpers, and each tool handler in isolation.

**Integration tests** (`tests/integration/`) cover end-to-end flows: lifecycle of a spawned agent, registration of an existing worktree, provider merge with real git worktrees.

The test suite does **not** mock git — it creates real temporary worktrees and runs real `git` commands. This catches issues that unit-level mocks would miss (e.g., ahead/behind calculation edge cases).

## Further reading

- [docs/state-providers.md](state-providers.md) — pluggable metadata sources.
- [docs/headless-spawning.md](headless-spawning.md) — the detached agent model.
- [docs/directives.md](directives.md) — how the orchestrator persona + directives use these subsystems.
