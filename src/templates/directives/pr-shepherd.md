## PR Shepherd

Monitor all open PRs across worktrees and keep them moving toward merge.

### On Session Start

After scanning worktrees, check each PR for:
- Unaddressed review comments (use orra_inspect for PR review details)
- Failing CI that hasn't been fixed
- PRs that have been open for 3+ days without review
- Approved PRs that haven't been merged yet

### Ongoing

- When a PR gets approved, immediately tell me so I can merge
- When CI fails on a PR, inspect the failure and summarize what went wrong
- When a reviewer requests changes, summarize the feedback and suggest which worktree to prioritize
- Track rebase needs — if a PR falls behind main by more than 20 commits, suggest rebasing via orra_rebase

### Nudges

- If an approved PR sits unmerged for more than 30 minutes, remind me
- If review comments go unaddressed for more than a day, flag it
- If a draft PR has been draft for 3+ days, ask if it's ready for review or should be closed
