## Linear Deadline Tracker

*Requires: [linear-mcp](https://github.com/jerhadf/linear-mcp) installed as an MCP server. Works best alongside the `linear-tasks` directive.*

Extend the existing Linear integration with deadline and commitment awareness. Maintain a single source of truth at `.orra/memory/commitments.md` that tracks what's due when and what's overdue.

### On Session Start

After `linear-tasks` runs its initial fetch (or, if `linear-tasks` is not enabled, do your own Linear fetch):

1. **Fetch tickets with deadlines.** Pull tickets assigned to the user that meet any of these criteria:
   - Has an explicit `dueDate` within the next 7 days
   - Is in a cycle that ends within 3 days
   - Has a "Priority: High" or "Urgent" label and is not Done

2. **Read the existing `.orra/memory/commitments.md`.** Parse the three sections (Active, Overdue, Completed this week) by their `###` headers. Preserve any **ad-hoc** entries — entries whose "Source:" line is not `Linear`. These come from conversation capture and are managed by other directives.

3. **Compose the updated file.** Group by section:
   - **Active:** Linear tickets in progress or todo, ordered by due date (soonest first). Merge with any preserved ad-hoc active entries.
   - **Overdue:** Anything whose due date is before today and is not yet Done. Move from Active here if needed.
   - **Completed this week:** Tickets that moved to Done in the last 7 days. Age out anything older than 7 days.

4. **Each entry uses this format:**

```markdown
### {{ticket_id_or_ad_hoc_id}} — {{title}}
- **Source:** Linear | ad-hoc
- **Due:** {{YYYY-MM-DD}}
- **Worktree:** [[worktrees/{{id}}]] | none
- **Status:** {{linear_status_or_todo_in_progress_done}}
- **Notes:** {{any_notes}}
```

5. **Update the frontmatter** `last_updated` field to the current ISO timestamp.

6. **Atomic write:** Write the new content to `.orra/memory/commitments.md.tmp`, then rename over the real file. This protects against corruption if you're interrupted mid-write.

### On Every 10-Minute Interval

**Strict piggyback rule:** If `linear-tasks` is also installed, do **not** start your own `/loop`. Wait for `linear-tasks` to finish its 10-minute pass and then refresh commitments at the tail of the same interval. Two loops querying Linear in parallel waste tokens and risk double-notifications for the same change.

Only if `linear-tasks` is **not** installed, start your own `/loop 10m` that refreshes only the commitments file.

**On each refresh, only notify the user if something changed meaningfully:**
- A new Linear ticket gained a due date within the warning window → surface it
- A previously-Active ticket is now Overdue → surface it urgently, propose a recovery action
- A ticket moved to Done → silently move to "Completed this week," no notification

If nothing changed, silence is correct.

### Surfacing Overdue Items

When something goes overdue, don't just log it — propose a concrete next step:

> "AUTH-142 (JWT refresh) was due yesterday and is still In Progress. Options: (a) ship it today as a quick follow-up, (b) re-scope the remaining work and move the due date, (c) flag @owner that it's slipping. Which?"

### Ad-Hoc Commitments

If during a session the user says something like "I promised @alice I'd have the migration by EOD Thursday" or "I said I'd look at that by end of week," capture it. Add an entry under Active with:
- `Source: ad-hoc`
- `Due: <absolute date based on today's date, not a relative phrase>`
- An ID of the form `adhoc-<date>-<short-slug>` (e.g. `adhoc-2026-04-13-migration-for-alice`)

These persist in `commitments.md` alongside Linear entries and are never overwritten by the Linear refresh — only by the same directive when the user marks them done.

### Dependencies

- Linear MCP tools
- `.orra/memory/commitments.md` (created by `orra_setup`)
