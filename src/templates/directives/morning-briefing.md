## Morning Briefing

Open each session with a 60-second, high-signal picture of the day. Compose it from multiple sources so the user doesn't have to mentally assemble the situation themselves.

### On Session Start

Run these in parallel and then compose one screen:

1. **Call `orra_scan`** to get the state of all worktrees grouped by status (ready_to_land, needs_attention, in_progress, idle, stale).

2. **Read yesterday's daily note** at `.orra/memory/daily/<yesterday>.md` if it exists. Extract:
   - The "Tomorrow's first move" line — this is the anchor for where to start today.
   - The "Still open" section — unfinished context from yesterday.
   - Any loose-ends notes.

3. **Read `.orra/memory/commitments.md`** and surface:
   - Anything under "Active" with a due date equal to today.
   - Anything under "Overdue" — these need immediate attention.
   - Commitments due within 2 days (warn early).

4. **If the `linear-tasks` directive is also enabled**, wait for it to finish its initial Linear fetch, then incorporate its "assigned to me, not Done" tickets into your picture.

### What to Present

Compose one screen of output, in this order:

```
Morning. It's {{today_date}}.

{{if yesterday_first_move}}
Yesterday's first-move note: "{{yesterday_first_move}}"
{{endif}}

Today's situation:
• Due today: {{due_today_list_with_worktree_links}}
• Overdue: {{overdue_list}}   (only if non-empty)
• Ready to land: {{ready_worktrees}}
• Needs attention: {{needs_attention_worktrees_with_reasons}}
• In progress: {{count}} worktrees
• Stale: {{count}} worktrees {{if stale_count > 0}}(see end){{endif}}

Recommended first action: {{single_best_action_with_one_line_why}}

What's your plan for the day? I'll remember it and align my suggestions to it.
```

The double-brace fields are placeholders for *you* (Claude) to fill when you run this directive. They are not a template engine — write the actual content based on what you find.

### After the User Answers

When the user tells you their focus for the day, create (or append to) today's daily note at `.orra/memory/daily/<today>.md`. Use this structure:

```markdown
---
date: {{today}}
type: daily
tags: [daily]
---

# {{today}}

## Today's focus

{{user's answer, verbatim}}

## What shipped

_(to be filled at shutdown)_

## Still open

_(to be filled at shutdown)_

## Tomorrow's first move

_(to be filled at shutdown)_

## Loose ends / decisions made

_(to be filled during the day as things come up)_

## Per-worktree state

_(to be filled at shutdown)_
```

Then update `.orra/memory/index.md`:
- Replace the "Today:" line with `**Today:** [[daily/{{today}}]]`
- Replace the "Active worktrees:" section with a bulleted list of currently-active worktrees, each line: `- [[worktrees/{{id}}]] — {{short_description}}`

### During the Day

When the user asks about priorities, compare against today's focus. If they drift, gently note it:

> "That's not on today's list — your focus is X. Want to switch priorities, or stay on track?"

When a focus worktree makes progress (approved PR, test suite green, etc.), proactively tell them:

> "Your auth-fix PR just got approved — ready to merge. One less thing for today."

### Dependencies

- `orra_scan` (always available)
- `.orra/memory/daily/` (created by `orra_setup`)
- `.orra/memory/commitments.md` (optional — skip gracefully if missing)
- Linear MCP tools (optional — only if `linear-tasks` directive is also enabled)
