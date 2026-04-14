# Orra MCP Development

## Project

MCP server that gives Claude Code awareness and coordination tools for multi-worktree development.

## Architecture

Orra observes and coordinates worktrees, and can spawn detached headless agents to handle routine maintenance work in the background. The user still creates their *primary* worktrees via their preferred tool (Superset, manual `git worktree add`, etc.); Orra tracks them via hooks once registered. For autonomous remediation (rebases, lint fixes, snapshot updates), Orra can spawn its own background agents via `orra_spawn`.

**Three capabilities:**
- **Awareness** — Scan worktrees via git/filesystem/GitHub/state-providers to classify status (ready_to_land, needs_attention, in_progress, idle, stale). Pre-computes per-agent summaries (test result, stuck detection, attention score) so callers don't have to re-parse logs.
- **Coordination** — Register worktrees for tracking, unblock permission prompts, stop agents, rebase branches, install directives.
- **Spawning** — Detached `claude --print` (headless) agents for routine maintenance, locked down to a safe `--allowed-tools` allowlist by default and capped by a configurable concurrency limit.

**9 MCP tools:** orra_scan, orra_inspect, orra_register, orra_unblock, orra_kill, orra_rebase, orra_setup, orra_directive, orra_spawn

## Testing

```bash
npm test          # run all tests
npm run build     # compile TypeScript
```

## Structure

- `src/core/` — awareness engine, config, agent manager, worktree, state
- `src/tools/` — MCP tool handlers (7 individual tools)
- `src/bin/` — hook script (file-based), setup script
- `src/templates/` — orchestrator agent persona
- `tests/` — unit + integration tests
