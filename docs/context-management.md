# Context Management

Orra externalizes its state so that long sessions remain usable on 200k context windows, and so that `/compact` (user-triggered or automatic) is survivable.

## State files

- `.orra/session-state.json` — durable memory (seen IDs, open threads, tick count, pressure).
- `.orra/resume.md` — human-readable snapshot, regenerated on checkpoint.
- `.orra/cache/<directive>.json` + `.index.json` — subagent-written structured results.
- `.orra/tick-log.jsonl` — append-only digest trail (ops/debug).
- `.orra/current-session.json` — written by SessionStart hook; disambiguates session identity.

## Tool surface

- `orra_resume` — load state. MUST be the first call of every session.
- `orra_tick(directive_id)` — dispatch a directive. Returns a subagent_spec for lean directives.
- `orra_cache_write` — called by subagents to persist results (not by the orchestrator).
- `orra_checkpoint({reason, notes?})` — write session-state + regenerate resume.md. Call on pressure and every ~10 ticks.
- `orra_inspect({target, id?, filter?, fields?, limit?})` — worktree/session/cache drill-down.
- `orra_scan({filter?, fields?})` — filtered worktree scan.

## Directive frontmatter

Lean directives declare a subagent contract:

```yaml
---
lean: true
cache_schema:
  fields: [id, title, priority, sla_state]
  summary_facets: [priority, sla_state]
escalate_when:
  - "sla_state == breached"
allowed_tools: ["Bash(linear:*)", "mcp__orra__orra_cache_write"]
---
```

See `docs/specs/2026-04-20-context-management-design.md` for the full design.
