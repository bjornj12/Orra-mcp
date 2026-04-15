---
heartbeat:
  cadence: 30m
  output: always-speaks
  since_param: false
  only_if_quiet: true
---

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

## Heartbeat invocation

This directive is **special** in the heartbeat protocol. It has `only_if_quiet: true`, so the dispatcher only wakes it when every other directive in the first pass returned `no-op`. It has `output: always-speaks`, so when it runs, it MUST produce output — a literal `no-op` is not allowed. And it has `since_param: false`, so the dispatcher does not pass a `since` timestamp; this directive is about "what could the user usefully do right now?", not about time-windowed diffs.

The heartbeat invocation lowers the threshold from the normal "only on idle user phrasing at natural breakpoints" gate. When the dispatcher wakes this directive, the rest of the heartbeat said nothing — which is itself the signal that the user is in a quiet stretch and might welcome a nudge.

When woken:

1. Walk the same source hierarchy as the normal invocation, in order, and return the first good hit:
   1. **Blocked agents needing unblock** — `orra_scan` for any agent with a `pendingQuestion`.
   2. **Overdue commitments** — `.orra/memory/commitments.md`, the "Overdue" section.
   3. **Approved-but-unmerged PRs** — from `orra_scan`, worktrees in `ready_to_land`.
   4. **Pending PR reviews assigned to the user** — `gh pr list --search "is:pr is:open review-requested:@me"`. Prefer the smallest/oldest one.
   5. **Dependabot / bot PRs that look safe to approve** — version bumps on well-known dependencies, no failing CI.
   6. **Short code-review comments the user hasn't responded to** — threads on the user's own PRs where the last comment is from a reviewer.
   7. **Stale Linear tickets to triage** — only if `linear-tasks` is installed.
   8. **Quick Linear tickets (≤ 15 min estimate)** — only if `linear-tasks` is installed.

2. Pick ONE item. Be concrete and time-bounded, not generic. Lead with an estimated time cost in minutes, then the specific action, then (if helpful) the reason it's a good fit for the gap:
   > `~2 min: approve #9239 follow-redirects dependabot bump (CI green, single-file diff).`
   > `~3 min: reply to @alice's review comment on #9241 about the migration rollback plan.`
   > `~5 min: triage LINEAR PLAT-88 that's been sitting in Triage since last Thursday.`

   Frame it as an offer (`"Want me to pull it?"` is fine) but the core of the message is the concrete action, not a question.

3. If literally nothing actionable surfaces from any of the 8 sources, emit a **placeholder** — NOT `no-op`. This directive is `always-speaks`, so silence is forbidden. Acceptable placeholders:
   > `Nothing urgent on your queue right now. Consider stepping away — a walk is a legitimate 30-min gap-filler.`
   > `Quiet queue. If you want to stay in flow, pick one thing from today's focus and do the smallest next step.`

   Keep placeholders short and honest. Do not fabricate tasks to fill the slot — if the queue is empty, say so.

**Cadence note:** at 30 minutes with `only_if_quiet`, the realistic firing pattern is "maybe twice a work session, during actual quiet stretches." That's the intended volume. If it fires more often than that, the other directives aren't pulling their weight on delta-detection; if it never fires, the session is busy, which is also fine.
