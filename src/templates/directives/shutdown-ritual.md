## Shutdown Ritual

Before the user closes their laptop, dump the session state into the memory layer so tomorrow-morning-you can pick up without rebuilding context from scratch.

### When to Trigger

Watch for these signals from the user — any of them starts the shutdown ritual:

- "shutdown", "shutting down", "wrap up", "wrapping up"
- "end of day", "EOD", "calling it"
- "see you tomorrow", "done for today"
- Explicit: "run the shutdown ritual"

When you detect the signal, confirm once: "Want me to run the shutdown ritual and update your daily note?" — then proceed on yes.

### What to Do

1. **Call `orra_scan`** to get current worktree state.

2. **Walk every worktree with activity** (ignore stale and idle-no-agent worktrees). For each, either infer from session context or ask the user:
   - Is this in a safe state to leave overnight?
   - What's the first step tomorrow?
   - Does anyone downstream depend on this landing soon?
   - Are there any decisions or discoveries from today worth preserving?

3. **Compose today's daily note** at `.orra/memory/daily/<today>.md`. If the file already exists (morning-briefing may have created it), update the sections in place rather than overwriting. Use this structure:

```markdown
---
date: {{today}}
type: daily
worktrees_active: {{count}}
tags: [daily]
---

# {{today}}

## Today's focus

{{preserve_if_morning_briefing_set_it}}

## What shipped

- {{one_line_per_shipped_PR_or_merged_worktree}}

## Still open

- [[worktrees/{{id}}]] — {{one_line_status}}

## Tomorrow's first move

{{the_single_thing_to_start_with_and_why}}

## Loose ends / decisions made

- {{decision_or_discovery_worth_remembering}}

## Per-worktree state

### [[worktrees/{{worktree-id}}]]

- **Branch:** {{branch}}
- **Status:** {{status}}
- **Last test result:** {{summary.lastTestResult if present}}
- **Notes:** {{short_freeform_state}}
```

4. **Update each active worktree's note** at `.orra/memory/worktrees/<id>.md`. If the file doesn't exist, create it from this template:

```markdown
---
worktree_id: {{id}}
branch: {{branch}}
created: {{iso_date}}
last_touched: {{iso_date}}
status: active
tags: [worktree]
---

# {{id}}

## Purpose

{{one_paragraph_what_and_why}}

## Decisions

- {{today}}: {{decision_and_rationale}}

## Open questions

- {{question_if_any}}

## Linked

- [[daily/{{today}}]]
```

If the file already exists, append today's entries to "Decisions" and "Open questions," and update `last_touched` in the frontmatter.

5. **Ask the user the final gate question**: "Anything I missed for tomorrow-you to remember?" Append their response to the daily note under "Loose ends / decisions made."

6. **Update the index** at `.orra/memory/index.md`:
   - Set `**Today:**` to `[[daily/<today>]]`
   - Refresh the "Active worktrees:" list

### What Not to Do

- Do not write the daily note before asking the user about worktrees — ask first, compose second.
- Do not overwrite the user's own edits to existing memory files. If a section is present and non-template, preserve it.
- Do not run the shutdown ritual twice in one day. If today's daily note already has a "Tomorrow's first move" filled in, ask: "You've already run shutdown today. Want to update the existing note, or start a new one?"

### Dependencies

- `orra_scan`
- `.orra/memory/daily/` and `.orra/memory/worktrees/` (created by `orra_setup`)
