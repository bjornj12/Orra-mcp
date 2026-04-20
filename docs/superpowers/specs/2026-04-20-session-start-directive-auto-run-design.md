# Session-Start Directive Auto-Run — Design

**Date:** 2026-04-20
**Status:** Draft

## Problem

When the user runs `claude --agent orchestrator "session start"` in a project with the `morning-briefing` directive installed, the orchestrator reads the directive file but does not execute its "On Session Start" section on the first turn. The user has to explicitly prompt "run the morning briefing" every session.

The morning-briefing directive explicitly describes itself as the "canonical session-start surface" for the directive set — meaning the system's entire design assumes it runs automatically at session start. The missing piece is a mechanism in the orchestrator persona to actually execute it.

> **Note on Claude Code startup:** `--agent` only loads the persona; it does not give the LLM a turn. A turn starts with the first user message. So "automatic at session start" in practice means "on the first turn of the session." The recommended launch pattern is `claude --agent orchestrator "session start"` (a short positional prompt that creates an immediate first turn); the persona interprets any first turn as session start and runs the protocol below. This document's problem statement and success criteria assume that first turn exists.

## Goals

1. A directive can opt in to automatic execution at session start via frontmatter.
2. Execution is gated by a configurable "reset time" so it fires at most once per logical day, where "day" boundaries are defined by the reset time — not calendar midnight.
3. The mechanism is generic — usable by future directives (weekly retros, etc.) without further orchestrator changes.

## Non-Goals

- Manual `/morning-briefing` slash-command triggering (out of scope; not needed if auto-run works).
- Cross-session reminders about missed boundaries (if the user doesn't open a session until 2pm, the briefing runs at 2pm — no "you missed 8am" banner).
- Timezone configuration (v1 uses the system local timezone, same as `date`).

## Design

### Directive frontmatter

A directive declares auto-run intent in its YAML frontmatter:

```yaml
---
session_start: auto
once_per: day
resets_at: "08:00"
---
```

Fields:

- **`session_start: auto`** — opt-in. Without this, session_start is not touched. `manual` (or absent) means no change from today's behavior.
- **`once_per: day`** — gate granularity. Only `day` is supported in v1. Future values (`week`, `session`) left open.
- **`resets_at: "HH:MM"`** — local-time daily boundary. The directive is eligible to fire if `last_ran_at` is before the most recent occurrence of this time. Required when `once_per: day`.

### State

Extend `.orra/heartbeat-state.json` with a top-level `session_start` block:

```json
{
  "armed_at": "2026-04-20T09:12:33-07:00",
  "last_user_activity_at": "2026-04-20T09:15:00-07:00",
  "directives": { ... },
  "session_start": {
    "morning-briefing": {
      "last_ran_at": "2026-04-20T09:12:40-07:00"
    }
  }
}
```

The `session_start` block is independent of the `directives` (heartbeat) block. Unknown keys in the file are preserved (forward-compat, same as today).

### Gate algorithm

On session start, for each directive with `session_start: auto`:

1. Read `session_start["<name>"].last_ran_at` from state. If missing → fire.
2. Compute `boundary`: today at `resets_at` local time. If `now < boundary`, subtract one day.
3. If `last_ran_at < boundary` → fire. Else → skip.

Worked examples with `resets_at: "08:00"`:

| Now (local) | last_ran_at | Boundary | Fire? |
|---|---|---|---|
| 09:00 Mon | — | 08:00 Mon | yes (no prior run) |
| 09:00 Mon | 23:50 Sun | 08:00 Mon | yes (before boundary) |
| 11:00 Mon | 09:00 Mon | 08:00 Mon | no (after boundary) |
| 00:05 Tue | 23:50 Mon | 08:00 Mon | no (still in Mon's window) |
| 09:00 Tue | 23:50 Mon | 08:00 Tue | yes |

### Orchestrator persona changes

Add a new section to `src/templates/orchestrator.md` titled **Session-Start Directive Auto-Run**, inserted between "On Session Start" step 2 (read directives) and step 3 (scan worktrees). It instructs the agent to:

1. For each directive file read in step 2, parse the YAML frontmatter.
2. If `session_start: auto`, apply the gate algorithm above.
3. If the gate says fire:
   a. Execute the directive's "On Session Start" section inline, in this same turn.
   b. Set `session_start["<name>"].last_ran_at = now` in in-memory state.
4. After all auto directives are processed, persist the updated state to `.orra/heartbeat-state.json`.
5. Continue with step 3 (scan worktrees) as today — unless a fired directive's "On Session Start" section already covers scanning (morning-briefing does), in which case the orchestrator should not scan redundantly.

The redundancy check matters: morning-briefing step 1 is "Call `orra_scan`." If it fired, the orchestrator has already scanned. The persona text should say: "If any fired session_start directive covered the worktree scan, you may skip step 3."

### Ordering

Directives are walked in alphabetical filename order (same as the heartbeat dispatcher) for determinism when multiple directives opt in.

### Error handling

- Malformed frontmatter on one directive → skip it, continue with the rest. Do not abort session start.
- If a directive's "On Session Start" body throws (e.g. `orra_scan` fails), emit a short `⚠️ <directive-name> session-start failed: <reason>` line and continue. Do not update `last_ran_at` for that directive — the next session will retry.
- If `.orra/heartbeat-state.json` is missing or corrupted, treat all directives as "never run" and proceed. Rebuild the file fresh when persisting.

### Backwards compatibility

- Directives without `session_start` frontmatter behave exactly as today (read-only, no execution).
- The existing heartbeat-state.json shape is preserved; only a new top-level key is added.
- No breaking changes to any MCP tool.

## Files Touched

- `src/templates/orchestrator.md` — new "Session-Start Directive Auto-Run" section.
- `src/templates/directives/morning-briefing.md` — add `session_start: auto`, `once_per: day`, `resets_at: "08:00"` to frontmatter. (Current file has no frontmatter — this is also a small tidy-up.)
- `tests/` — unit tests for the gate algorithm (boundary computation, firing decisions across the worked-examples table).

## Open Questions

- Should `resets_at` default to `"08:00"` when omitted, or require it explicitly? Recommendation: **require it** — forces directive authors to make the choice deliberately, and there's no sensible universal default.
- Do we need a way for the user to manually re-trigger (force-fire) a session_start directive mid-day? Recommendation: **not in v1** — the user can already type "run the morning briefing" and the orchestrator will execute it; forcing through the gate is a YAGNI.

## Success Criteria

1. User runs `claude --agent orchestrator "session start"` in the morning → morning briefing fires automatically, same output as today's manually-prompted run.
2. User runs another session at 3pm same day → no briefing, normal orchestrator behavior.
3. User starts a session at 00:05 after a late-night session → no briefing (still in yesterday's window).
4. User starts a session at 09:00 the next day → briefing fires.
5. A second directive opted into `session_start: auto` with different `resets_at` fires independently on the correct schedule.
