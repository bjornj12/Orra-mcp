---
lean: true
cache_schema:
  fields: [id, title, priority, status, age_days, assignee, sla_state]
  summary_facets: [priority, sla_state, status]
escalate_when:
  - "sla_state == breached"
  - "age_days > 14"
allowed_tools: ["Bash(linear:*)", "mcp__linear__*", "mcp__orra__orra_cache_write"]
heartbeat:
  cadence: 30m
  output: silent-on-noop
  since_param: true
  only_if_quiet: false
---

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

## Heartbeat invocation

When the dispatcher wakes this directive with `since=<timestamp>`, do NOT re-run the full "assigned to me, grouped by project and status" sweep from the normal invocation. Run a cheap `updatedAt`-filtered query instead. (The `/loop 10m` mentioned in the normal invocation is superseded by the heartbeat for heartbeat-armed sessions — do not start your own loop.)

1. Query Linear for tickets assigned to the user where `updatedAt > since`. In the Linear MCP, this looks like an `issues` query with a filter `{ assignee: { isMe: true }, updatedAt: { gt: "<since>" } }`. Keep the field set small — `id`, `identifier`, `title`, `state.name`, `updatedAt`, `priority`, `comments.nodes[last]` is enough.

2. For each returned ticket, classify the change. Surface only transitions that happened since `since`:
   - **New assignment:** ticket was assigned to the user in this window (i.e. `updatedAt > since` and this ticket was not in the previous tick's known-set, or its assignee changed to the user).
   - **Status change by someone else:** `state.name` changed and the most recent `history` entry shows an actor that is not the user. The user moving their own tickets should stay silent.
   - **New comment on a ticket the user owns:** `comments.nodes[last].createdAt > since` AND the commenter is not the user.
   - **Priority bumped:** `priority` changed in this window, especially to Urgent or High.

3. Format each transition as one line, leading with the Linear identifier: `AUTH-142 reassigned to you`, `BILLING-87 moved In Review → Done by @alice`, `PLAT-12 new comment from @bob`. Aggregate into a short bullet list.

**No-op condition:** if the `updatedAt > since` query returns zero tickets, OR every returned ticket's only change is the user themselves editing the ticket (no external activity worth surfacing), return exactly the literal string `no-op` and nothing else.

Do not re-emit the full prioritization report here — that's the normal-invocation job, and it's too long to fire every 30 minutes. Heartbeat ticks are deltas only.
