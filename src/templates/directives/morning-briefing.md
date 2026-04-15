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

### My Lane

I am the **canonical session-start surface** for the entire directive set. Every worktree status, every PR change, every overdue commitment, every needs-attention agent — if it's true at the moment the user opens the session, I'm the one who reports it.

After my briefing finishes, other directives take over their respective ongoing lanes:

| Other directive | Their ongoing lane |
|---|---|
| `pr-shepherd` | PR state *changes* during the session (approval, CI flips, review comments) |
| `monitor-agents` | Event-driven reactions to agent state file changes (permission requests, completions) |
| `auto-remediator` | Routine maintenance work — auto-spawn headless agents per its allowlist |
| `linear-deadline-tracker` | Maintains `commitments.md`; refreshes on its 10-min cadence |
| `linear-tasks` | Linear ticket visibility on its 10-min cadence |
| `wait-time-recycler` | Suggests gap-sized tasks during agent waits |
| `memory-recall` | Answers historical questions on demand |
| `stale-cleanup` | Proposes cleanup of merged-and-orphaned worktrees AFTER my briefing |
| `shutdown-ritual` | EOD daily-note write |

This means **I do NOT need to defer to any directive on session start** — they all defer to me. After I'm done, they take over.

### Dependencies

- `orra_scan` (always available)
- `.orra/memory/daily/` (created by `orra_setup`)
- `.orra/memory/commitments.md` (optional — skip gracefully if missing)
- Linear MCP tools (optional — only if `linear-tasks` directive is also enabled)

## Heartbeat bootstrap

This directive is session-only — it does NOT have a `heartbeat:` frontmatter block and never auto-fires on a heartbeat tick. Its only interaction with the heartbeat is to arm the loop on session start.

**Double-arm guard.** Before printing the arming prompt, check `.orra/heartbeat-state.json`:

- If the file exists AND contains a non-null `armed_at` field, the heartbeat is already armed in this session. **Stay silent** — do not print the bootstrap block. The morning briefing still does everything else above; it just skips the arming prompt. This prevents accidental double-arming when the user re-runs the briefing in the same session.
- If the file does not exist, OR it exists but `armed_at` is missing/null, proceed to print the bootstrap block below.

**The bootstrap block.** After the normal morning briefing finishes — after the "Recommended first action" and "What's your plan for the day?" lines — append exactly this text as the final thing in the briefing output:

```
🫀 Heartbeat ready. To arm it (auto-checks your directives every 5 min,
   surfaces only what changed), paste:

   /loop 5m heartbeat tick

   Say "stop heartbeat" or just "stop" anytime to end it.
```

Use the exact text above, including the 🫀 emoji, the indentation, the `/loop 5m heartbeat tick` command on its own line, and the stop instructions. Do not paraphrase, do not add preamble, do not add trailing commentary. The user will paste the `/loop 5m heartbeat tick` command once, and Claude Code's native `/loop` will then inject synthetic `heartbeat tick` turns every 5 minutes for the remainder of the session.

**Do not print the block more than once per session.** If you already printed it and the user has not yet pasted the command, that's fine — they'll see it in scrollback. Re-running the briefing should not re-print it; the `armed_at` gate handles the case where arming has happened, and tracking "already-printed" within an unarmed session is the responsibility of the persona's session memory (you can simply remember you showed it).

**Do not invoke `/loop` yourself.** Model output renders as plain text in Claude Code — the `/loop 5m heartbeat tick` line in the block above is information for the user to paste, not a command you can run. There is no stock mechanism for a directive, MCP tool, hook, or persona instruction to execute a slash command on its own. One paste per session is the minimum friction achievable and is the deliberate v1 design.
