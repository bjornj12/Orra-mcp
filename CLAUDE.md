# Orra MCP Development

## Project

MCP server that gives Claude Code awareness and coordination tools for multi-worktree development.

## Architecture

Orra observes and coordinates worktrees, riding on the Claude Code Agents View as the substrate. It reads bg-session state from the daemon's on-disk interface, spawns agents via `claude --bg`, and provides the directive + memory layer on top. The user creates worktrees via their preferred tool or `--worktree`; Orra classifies and coordinates them.

**Three capabilities:**
- **Awareness** — Scan worktrees via git/filesystem/GitHub/daemon-state/state-providers to classify status (ready_to_land, needs_attention, in_progress, idle, stale). Pre-computes per-agent summaries (test result, stuck detection, attention score) so callers don't have to re-parse transcripts.
- **Coordination** — Stop/kill agents via `claude stop`/`claude rm`, rebase branches, install directives. Blocked agents are unblocked via `claude attach <shortId>` (interactive) or `claude --bg --resume <shortId> "<answer>"` (non-interactive).
- **Spawning** — Native `claude --bg` bg agents; provenance recorded in `.orra/spawns/`.

**11 MCP tools:** orra_resume, orra_scan, orra_inspect, orra_kill, orra_rebase, orra_setup, orra_directive, orra_spawn, orra_tick, orra_checkpoint, orra_cache_write

## Testing

```bash
npm test          # run all tests
npm run build     # compile TypeScript
```

## Structure

- `src/core/` — awareness engine, config, daemon-state, claude-cli, slug, agents-view-preflight, providers, state
- `src/tools/` — MCP tool handlers (11 individual tools)
- `src/bin/` — hook script (orra-hook.ts), setup script, orra-launch
- `src/templates/` — orchestrator agent persona, directive templates, memory templates, hooks
- `tests/` — unit + integration tests
