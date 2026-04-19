# Changelog

All notable changes to Orra MCP are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
