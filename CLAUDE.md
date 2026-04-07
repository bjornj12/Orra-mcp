# Orra MCP Development

## Project

MCP server that turns Claude Code into a multi-agent orchestrator via git worktrees.

## Testing

```bash
npm test          # run all 132 tests
npm run build     # compile TypeScript
```

## Structure

- `src/core/` — agent manager, socket server/client, state, worktree, process, linker
- `src/tools/` — MCP tool handlers (orra.ts routes all orchestrator actions)
- `src/bin/` — hook script for Claude Code PermissionRequest/Stop events
- `tests/` — unit + integration tests
