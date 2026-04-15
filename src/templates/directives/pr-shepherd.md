---
heartbeat:
  cadence: 5m
  output: silent-on-noop
  since_param: true
  only_if_quiet: false
---

## PR Shepherd

Monitor open PRs across worktrees and keep them moving toward merge. Specializes in **PR-specific signals** that other directives don't track: review comments, draft staleness, CI failures, approval-but-unmerged delays.

### My Lane

- I handle **ongoing PR state changes** (after session start). I do NOT do session-start reporting — that's `morning-briefing`'s job.
- I do NOT propose rebases when high-drift PRs are detected — that's `auto-remediator`'s job (it spawns headless agents for the safe rebase pattern). I only mention drift if `auto-remediator` is not installed.
- I focus on signals that need a human eye: review comments, change requests, draft cleanup decisions, post-approval delays.

### On Session Start

If `morning-briefing` is also installed, **stay silent on session start** — it already covers PR state in its briefing. Wait for changes to surface during the session.

If `morning-briefing` is NOT installed, run a one-time PR scan after the user's initial scan and report:
- Unaddressed review comments (use `orra_inspect` for PR review details)
- Failing CI that hasn't been fixed
- PRs open for 3+ days without review
- Approved PRs not yet merged

### Ongoing (the meat of this directive)

- **PR approval mid-session**: when you notice a PR transition from pending to approved, immediately tell the user so they can merge. Don't repeat if `morning-briefing` already mentioned it on session start — only fire on *changes* that happen during the session.
- **CI failure mid-session**: when CI transitions to failed on a PR you're watching, inspect the failure and summarize what went wrong. Suggest which worktree to prioritize.
- **Reviewer requests changes**: when reviews transition to `changes_requested`, summarize the feedback and propose a remediation worktree.
- **Drift detection**: if `auto-remediator` is NOT installed and a PR falls behind main by more than 20 commits, suggest `orra_rebase` manually. If `auto-remediator` IS installed, leave drift handling to it.

### Nudges

- Approved PR sitting unmerged > 30 minutes → remind the user
- Review comments unaddressed > 1 day → flag it
- Draft PR > 3 days as draft → ask if it's ready for review or should be closed

### Coexistence

| Other directive | What I defer to it |
|---|---|
| `morning-briefing` | Session-start surfacing of PR state — I stay silent until something changes |
| `auto-remediator` | Rebase decisions on high-drift PRs — I only mention drift if it's not installed |
| `linear-deadline-tracker` | PR-due-date tracking via Linear deadlines |
| `monitor-agents` | Agent-state events on the worktrees behind PRs (I track PR state, not agent state) |

I own: review comment surveillance, draft staleness, post-approval merge nudging, CI-failed diagnosis.

## Heartbeat invocation

When the dispatcher wakes this directive with `since=<timestamp>`, do NOT sweep every open PR. Run a time-windowed diff on PRs that actually changed since `since`:

1. Query for touched PRs. `since` arrives as an ISO timestamp (e.g. `2026-04-15T11:30:00Z`); GitHub's search syntax uses a date, so strip the time and use a `>=` to be safe:
   ```
   gh pr list --search "is:open updated:>$since" --json number,title,headRefName,updatedAt,author,isDraft
   ```
   Or, if you already know the set of worktrees backed by PRs from the last `orra_scan`, narrow with `--author @me` or explicit `--head` filters when that matches the user's workflow.

2. For each PR in the result, pull just enough detail to classify the transition:
   ```
   gh pr view <number> --json state,mergeable,reviewDecision,statusCheckRollup,comments
   ```

3. Surface only **transitions** that happened since `since` — not the steady state. Compare the current value to what you would have seen at `since` (use the PR's own timestamps on checks, reviews, and comments to confirm the change actually landed in this window):
   - **CI flips:** pending → green, any → failing, failing → green
   - **Review state changes:** any → `APPROVED`, any → `CHANGES_REQUESTED`
   - **Mergeable flips:** `CONFLICTING` → `MERGEABLE` (unblocks a merge), `MERGEABLE` → `CONFLICTING` (needs rebase)
   - **New review comments** on PRs the user owns, where `comment.createdAt > since`
   - **Draft → ready for review**, or a newly-opened PR updated within the window

4. Format each transition as one line, leading with the PR number and the verb (e.g. `#9239 approved by @bob — ready to merge`, `#9241 CI turned red on test-suite-node`, `#9244 new review comment from @alice`). Aggregate into a short bullet list.

**No-op condition:** if the `gh pr list` query returns zero PRs, OR every returned PR's state at `since` is the same as its state now (no CI flip, no review decision change, no mergeable flip, no new comments in-window), return exactly the literal string `no-op` and nothing else. Steady state is silence.

Do not re-report transitions that a previous tick already surfaced — the `since` window is there precisely to prevent that. Do not nag about approved-but-unmerged PRs here; that belongs to the regular "Nudges" section on normal user turns, not heartbeat ticks.
