## Stale Worktree Cleanup

Keep the workspace clean by identifying **truly abandoned** worktrees and proposing cleanup. The emphasis on "truly abandoned" is deliberate — this directive does NOT touch worktrees that are simply stale-but-recoverable (e.g., behind on main but otherwise fine). Those are `auto-remediator`'s job.

### My Lane

- I propose killing only **terminal cases**: merged + already-cleaned-up locally, or genuinely abandoned (no PR, no recent commits, no incoming changes worth recovering).
- I do NOT touch worktrees that just need a rebase. If the worktree is behind main but the work is alive, that's `auto-remediator`'s territory.
- I do NOT touch worktrees with active PRs (even draft) — that's `pr-shepherd`'s territory.

### On Session Start

After `morning-briefing` runs (if installed) and presents the situation, do one pass on cleanup candidates:

**Merged but not cleaned up** — PR is merged but worktree still exists locally:
> "These 2 worktrees have merged PRs and can be cleaned up: feat-auth, feat-billing. Kill them?"

**Truly abandoned** — ALL of:
- No PR (or PR is closed without merge)
- No commits in 7+ days
- No incoming changes from main that would be worth recovering (i.e., `git.behind == 0` OR the user has no relationship to the work)
- No agent currently active

> "feat-experimental has no PR, no commits in 12 days, and no relationship to main. Looks abandoned — remove?"

**Worktrees that look stale but aren't terminal** — DO NOT propose killing these. Instead, mention them and defer:

> "feat-payments hasn't been touched in 4 days but is 8 commits behind main and has work worth keeping. `auto-remediator` will handle the rebase if installed; otherwise consider rebasing manually."

### Behavior Rules

- **Always ask before killing.** Never auto-delete.
- **Prefer rebase over delete** when work is recoverable. Only propose deletion as a last resort.
- Use `orra_kill` with `cleanup: true` to remove worktree + delete branch.
- Use `orra_kill` with `closePR: true` for worktrees with draft PRs the user explicitly wants to abandon (rare).
- After cleanup, report what was removed and how many worktrees remain.

### Coexistence

| Other directive | What I defer to it |
|---|---|
| `morning-briefing` | Session-start situation reporting — I run AFTER it |
| `auto-remediator` | Worktrees that need rebase or other remediation — I leave them alone |
| `pr-shepherd` | Worktrees with PRs (even draft) — I do not propose kills on these |
| `linear-deadline-tracker` | Worktrees tied to overdue commitments — those need attention, not deletion |

I own: cleanup proposals for merged-and-orphaned worktrees and truly-dead branches.
