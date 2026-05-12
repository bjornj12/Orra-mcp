# Changelog

All notable changes to Orra MCP are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] — 2026-05-12 — Orra on the Agents View

**Breaking change.** Orra no longer manages worktrees or spawns headless processes —
it rides on Claude Code's Agents View as the substrate. **Requires Claude Code ≥ 2.1.x
with the Agents View enabled.**

### Removed

- `orra_register` — the supervisor daemon auto-tracks bg sessions; `git worktree list`
  covers non-bg worktrees. Worktree setup moves to a sample `WorktreeCreate` hook.
- `orra_unblock` — use `claude attach <shortId>` for interactive unblocking, or
  `claude --bg --resume <shortId> "<answer>"` for routine non-interactive answers.
- Worktree-creation, PID-reconciliation, and detached `claude --print` supervision code.
- `.orra/agents/*.json` lifecycle state and `.orra/agents/*.log` output capture — these
  are no longer written. Pre-upgrade detached `claude --print` agents keep running until
  they exit but will not appear in `orra_scan`.
- Orra's permission-request hook (`orra-hook.ts` `PermissionRequest` branch) and
  answer-file mechanism.
- `headlessSpawnConcurrency` config key — concurrency is now observed by counting
  Orra-spawned bg sessions in the daemon roster directly.

### Changed

- `orra_spawn` now calls `claude --bg --name <slug> [--agent <p>] [--disallowed-tools ...]
  -- <task>` and records provenance in `.orra/spawns/<short>.json`. Spawned sessions are
  visible in `claude agents` and manageable via `claude stop`/`claude rm`/`claude attach`.
- `orra_kill` calls `claude stop <short>` by default; `cleanup: true` calls `claude rm
  <short>` (removes the job and its worktree).
- `orra_scan` agent state now comes from the Claude Code daemon (`$CLAUDE_CONFIG_DIR/jobs/
  */state.json` + `daemon/roster.json`) via a new built-in `claude-daemon` provider — not
  from `.orra/agents/*.json`. The `agent` field carries `{ status, flags, detail, tempo,
  daemonShort, sessionId, linkScanPath }` from the daemon.
- `orra_inspect` reads the session transcript `.jsonl` (via `state.json.linkScanPath`)
  instead of `.orra/agents/<id>.log`.
- `orra_setup` writes the orchestrator agent + `.mcp.json` + a sample `WorktreeCreate`
  hook. It no longer installs Orra's own worktree-setup or permission hooks.
- `orra_rebase` spawns a bg agent carrying the rebase directive.
- Summaries now parse the session transcript `.jsonl` (mtime + content) rather than
  `.orra/agents/<id>.log`.
- Directive templates (`monitor-agents`, `auto-remediator`, `stale-cleanup`,
  `wait-time-recycler`) updated to use the new primitives: `claude --bg --resume` for
  routine answers, `claude attach` for human decisions, `agent.flags` for blocked detection.
- Distribution: packaged as a Claude Code plugin (`.claude-plugin/plugin.json`) declaring
  the orchestrator agent, the `/orra` command, the MCP server, and directive templates.
  `claude --plugin-dir <path>` is the recommended install path; `npx orra-mcp` remains
  as the standalone MCP-server alternative.

### Added

- `src/core/daemon-state.ts` — typed readers for the Claude Code daemon on-disk interface:
  `configDir()`, `readRoster()`, `readJobs()`, `readJobState()`, `readJobTimeline()`.
- `src/core/claude-cli.ts` — typed wrappers over the `claude` CLI: `bgSpawn()`,
  `bgResume()`, `stopSession()`, `removeSession()`, `daemonStatus()`.
- `src/core/providers/claude-daemon.ts` — built-in provider that turns daemon state into
  `ProviderWorktree[]`; always prepended by `scanAll`.
- `src/core/agents-view-preflight.ts` — daemon-availability preflight; every tool returns
  a clear error if Claude Code < 2.1.x or the Agents View is unavailable.
- `src/bin/orra-launch.ts` — the `orra` bin: ensures the orchestrator is running as a
  named bg session (`claude --bg --agent orchestrator --name orra`), then prints or
  performs `claude attach orra`.
- `src/templates/hooks/worktree-create.sh` — sample `WorktreeCreate` hook (credential
  symlink + `.claude/` copy + background install).
- `.claude-plugin/plugin.json` — plugin manifest.
- `src/core/slug.ts` — slug helpers shared by the spawn ledger.

### Net tool count

13 → 11 tools: `orra_resume`, `orra_scan`, `orra_inspect`, `orra_kill`, `orra_rebase`,
`orra_setup`, `orra_directive`, `orra_spawn`, `orra_tick`, `orra_checkpoint`,
`orra_cache_write`.

### Migration

1. Update Claude Code to ≥ 2.1.x.
2. Re-install Orra as a Claude Code plugin: `claude --plugin-dir /path/to/orra-mcp` (or
   `claude mcp add orra -- npx orra-mcp` for the standalone server).
3. Run `orra_setup` — it will write the new `WorktreeCreate` hook and remove references to
   the old hooks.
4. Replace any `orra_unblock` calls in custom directives with `claude --bg --resume
   <shortId> "<answer>"` (routine) or `claude attach <shortId>` (human decisions).
5. Replace any `orra_register` calls — worktrees are now tracked automatically.
6. Pre-upgrade detached `claude --print` agents (if any) will continue running until they
   exit; they won't appear in `orra_scan`.

## [Unreleased]

### Added

- `SECURITY.md` with vulnerability disclosure policy.
- GitHub Actions CI workflow running build + tests on Node 20 and 22.
- `author` field in `package.json`.
- README + CONTRIBUTING now point to GitHub issues for bug/feature reports.

### Changed

- Updated `@types/node`, `typescript`, `vitest` to latest patch versions.
- Refreshed transitive dependencies; `npm audit` reports 0 vulnerabilities.

## [0.1.1] — 2026-04-19

### Fixed

- Bin entries (`orra-mcp`, `orra-setup`) shipped without the execute bit
  in 0.1.0, causing `npx orra-mcp` to fail with "Permission denied". Build
  now `chmod +x`'s the entry points before pack.

### Changed

- `npm run verify` now invokes the bin via `npx` and stat-checks the
  underlying file mode, so future regressions of this class fail loudly.

## [0.1.0] — 2026-04-14

Initial open-source release.

### Added

- **9 MCP tools** for observing and coordinating multi-worktree development:
  `orra_scan`, `orra_inspect`, `orra_register`, `orra_unblock`, `orra_kill`,
  `orra_rebase`, `orra_setup`, `orra_directive`, `orra_spawn`.
- **Awareness engine** — scans git worktrees, PR state (via `gh`), and agent
  state, classifies worktrees into `ready_to_land` / `needs_attention` /
  `in_progress` / `idle` / `stale`, and pre-computes per-agent summaries
  (test result, stuck detection, attention score).
- **State provider pipeline** — pluggable HTTP / file / command providers
  with a vendor-neutral `protocolVersion` envelope, so any dashboard can
  augment Orra's native scan with custom metadata.
- **Memory layer** — markdown-based daily notes, commitments tracking,
  per-worktree notes, and weekly retros under `.orra/memory/`. Designed
  to work as-is with Obsidian, Logseq, Foam, or plain grep.
- **Directive pack** — 10 shipped directives covering the full day:
  `morning-briefing`, `shutdown-ritual`, `memory-recall`, `linear-tasks`,
  `linear-deadline-tracker`, `pr-shepherd`, `stale-cleanup`, `monitor-agents`,
  `auto-remediator`, `wait-time-recycler`. Each declares its own "lane"
  so they compose without conflict.
- **Headless agent spawning** via `orra_spawn` — detached `claude --print`
  agents for routine maintenance, locked down by default to a safe tool
  allowlist (Read/Glob/Grep/Edit/Write + scoped git + common test commands)
  with a configurable concurrency cap (default 3).
- **Claude Code hooks integration** — `PermissionRequest` and `Stop` events
  flow through `src/bin/orra-hook.ts` into `.orra/agents/<id>.json`, so
  `orra_scan` surfaces pending prompts and completion state automatically.

### Notes

- The state provider protocol uses `protocolVersion`, not `orraProtocolVersion`,
  so dashboards can implement it without knowing Orra exists. Endpoint paths
  are user-configurable — Orra has no opinion on URL structure.
