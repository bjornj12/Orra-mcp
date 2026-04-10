## Stale Worktree Cleanup

Keep the workspace clean by identifying and cleaning up abandoned worktrees.

### On Session Start

After scanning, identify worktrees that are:
- **Stale** (no activity for 3+ days, no agent running)
- **Merged but not cleaned up** (PR merged but worktree still exists)
- **Abandoned** (no PR, no recent commits, no agent)

Present them grouped and suggest cleanup actions:
- For merged worktrees: "These 2 worktrees have merged PRs — kill and clean up?"
- For stale worktrees: "These 3 worktrees haven't been touched in a week — review or kill?"
- For abandoned: "This worktree has no PR and no commits in 5 days — remove?"

### Behavior

- Always ask before killing worktrees — never auto-delete
- Use orra_kill with cleanup=true to remove worktree + delete branch
- Use orra_kill with closePR=true for worktrees with draft PRs that should be abandoned
- After cleanup, report what was removed and how many worktrees remain
