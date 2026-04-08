# Orra MCP Development

## Project

MCP server that turns Claude Code into a multi-agent orchestrator via git worktrees.

## Architecture

**Two capabilities:**
- **Awareness** — Scan worktrees via git/filesystem/GitHub to classify status (ready_to_land, needs_attention, in_progress, idle, stale)
- **Action** — Spawn, kill, message, unblock, rebase agents in worktrees

**7 MCP tools:** orra_scan, orra_inspect, orra_spawn, orra_kill, orra_message, orra_unblock, orra_rebase

## Testing

```bash
npm test          # run all tests
npm run build     # compile TypeScript
```

## Structure

- `src/core/` — awareness engine, config, agent manager, worktree, process, state, stream-parser
- `src/tools/` — MCP tool handlers (7 individual tools)
- `src/bin/` — hook script (file-based), setup script
- `src/templates/` — orchestrator agent persona
- `tests/` — unit + integration tests
