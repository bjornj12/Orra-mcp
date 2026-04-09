# Orra MCP Development

## Project

MCP server that gives Claude Code awareness and coordination tools for multi-worktree development.

## Architecture

**Orra observes and coordinates. It does not create worktrees or spawn agents.** The user creates worktrees via their preferred tool (Superset, manual `git worktree add`, etc.). Orra tracks them via hooks once registered.

**Two capabilities:**
- **Awareness** — Scan worktrees via git/filesystem/GitHub to classify status (ready_to_land, needs_attention, in_progress, idle, stale)
- **Coordination** — Register worktrees for tracking, unblock permission prompts, stop agents, rebase branches

**7 MCP tools:** orra_scan, orra_inspect, orra_register, orra_unblock, orra_kill, orra_rebase, orra_setup

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
