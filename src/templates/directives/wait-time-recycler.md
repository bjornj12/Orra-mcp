## Wait-time Recycler

Turn dead time into useful time. When an agent is running and the user has nothing active to do, surface a single, gap-sized task they could pick up — drawn from sources Orra already sees, not invented.

### When to Act

On every turn where:
1. At least one tracked agent is currently in status `running`, AND
2. The user has just asked you something non-agent-related or said something idle ("what now?", "anything else?", "I'll wait"), AND
3. You have not already surfaced a wait-time suggestion in the last 3 turns.

Do NOT interrupt the user if they're actively working. Only surface suggestions at natural breakpoints.

### Where to Find Gap-Sized Tasks

Check these sources in order, return the first good hit:

1. **Blocked agents needing unblock.** Run `orra_scan`. If any other agent has a `pendingQuestion`, that's the highest-priority gap-filler — unblocking takes 30 seconds and removes a blocker.

2. **Overdue commitments.** Read `.orra/memory/commitments.md`. If anything is Overdue, suggest dealing with the smallest or the most urgent one.

3. **Approved-but-unmerged PRs owned by the user.** From `orra_scan` results, find any worktree in `ready_to_land` status. Suggest merging.

4. **Pending PR reviews assigned to the user.** From `orra_scan` PR data or via `gh pr list --search "is:pr is:open review-requested:@me"`. Suggest reviewing the smallest/oldest one — report estimated time from diff size (< 50 lines = ~3 min, 50–200 = ~8 min, > 200 = ~15 min).

5. **Quick Linear tickets** (if `linear-tasks` directive is enabled). Tickets marked `quick`, `small`, or with an estimate of ≤ 15 minutes. Pick the highest-priority one.

### How to Surface

Only one suggestion at a time. Keep it short:

> "auth-refactor's tests are running (~3 min based on last test runs). Meanwhile:
>
> **Suggestion:** PR #9192 from @bob needs your review — ~5 min based on the diff. Want me to pull it and summarize?"

Always phrase as an offer, never a command. Include the estimated time cost so the user can compare against the gap they have.

If the user declines, don't re-surface the same task within the current session unless something changes (e.g. the gap got longer, or it became overdue).

### What to Avoid

- **Don't suggest work that would outlast the gap.** If the agent will finish in ~3 minutes, don't suggest a 20-minute task. The user will context-switch twice.
- **Don't suggest trivial busywork.** "Update your README" or "clean up old branches" — filler, not value. Only surface things that were already on the user's list, not things you invented to fill time.
- **Don't nag.** If you surfaced a suggestion last turn and the user ignored it, don't repeat it. Move on.

### Dependencies

- `orra_scan`
- `.orra/memory/commitments.md` (optional — skip section 2 if missing)
- `gh` CLI (optional — skip section 4 if missing)
- Linear MCP (optional — skip section 5 if missing)

### Note on pre-inspection summaries

If the pre-inspection cache is available, use `entry.summary.oneLine` and `entry.summary.needsAttentionScore` to pick better gap-sized tasks (knowing which agents are *about* to need attention lets you avoid suggesting work that'll be interrupted). If summaries are absent, fall back to basic `orra_scan` data — this directive works without them.
