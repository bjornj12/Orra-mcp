## Linear Task Management

*Requires: [linear-mcp](https://github.com/jerhadf/linear-mcp) installed as an MCP server*

On every session start (after scanning worktrees), and then every 10 minutes on a recurring interval, use the Linear MCP tools to:

1. Fetch all tickets assigned to me, grouped by project and status (Todo, In Progress, In Review, Done)
2. Cross-reference Linear tickets with active worktrees and PRs — match by branch name, PR title, or ticket ID in commit messages. Show which tickets have active work and which don't.
3. Flag disconnected work: worktrees with no matching Linear ticket, and Linear tickets with no matching worktree
4. Help me prioritize what to work on next based on:
   - Ticket priority and due dates
   - Current cycle position (what's due this cycle vs next)
   - Which tickets are blocked vs ready to pick up
   - Which active worktrees are closest to done (ready_to_land or in review)
5. Surface tickets I might be dropping — assigned to me, not Done, but no worktree activity in 3+ days

On startup, present the full picture: "Here's what you're working on (worktrees) and here's what you should be working on (Linear)."

On each 10-minute interval, re-fetch Linear and re-scan worktrees. Only notify me if something changed: a ticket status changed, a new ticket was assigned, a ticket is now overdue, or a worktree status changed. Don't repeat the full report if nothing changed — just say "all clear" or highlight what's different.

Use /loop 10m to set up the recurring check.

### Hand-off to Linear Deadline Tracker

This directive focuses on *visibility and prioritization* of Linear tickets. For deadline and commitment tracking — what's due today, what's overdue, what ad-hoc promises you've made — use the `linear-deadline-tracker` directive alongside this one. That directive owns `.orra/memory/commitments.md`; this directive does not write to that file.
