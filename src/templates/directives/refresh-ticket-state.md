---
lean: false
allowed_tools: [
  "mcp__orra__orra_scan",
  "mcp__orra__orra_attach_ticket",
  "mcp__claude_ai_Linear__list_issues",
  "mcp__claude_ai_Linear__get_issue",
  "Bash(gh issue:*)"
]
heartbeat:
  cadence: 1h
  output: silent-on-noop
  since_param: false
  only_if_quiet: false
---

## Refresh Ticket State

Sync per-worktree ticket data from the user's installed ticket MCP into Orra's structured ticket store at `.orra/tickets/{worktree}.json`. Used by `orra_scan` to surface tickets in worktree summaries, and (when the daemon is enabled) by the Symphony HTTP backend.

This directive is **complementary** to `linear-deadline-tracker`. That directive maintains `commitments.md` for due-date tracking. This one maintains structured per-worktree ticket attachments.

### When to run

- On orchestrator session start
- On the declared 1-hour heartbeat
- On user request: "refresh tickets" / "sync tickets"

If the user has the Symphony daemon enabled with `tracker.kind: linear`, return `no-op` — the daemon's LinearProvider handles this automatically. Check `.orra/config.json` for `symphony.tracker.kind == "linear"`.

### Procedure

1. **Identify the ticket source.** Read `.orra/config.json` for `tickets.mcp` (e.g., `"linear"` for `mcp__claude_ai_Linear__*`, `"github"` for `gh issue`). If unset, prompt once: "Which ticket source should I sync from?"

2. **Fetch active issues.** Call the configured MCP for issues in active states (todo, in_progress, in review). For Linear, use `mcp__claude_ai_Linear__list_issues` with the user's project filter.

3. **Get the current worktree list.** Call `mcp__orra__orra_scan` and read `result.worktrees`. Note each entry's `id`, `branch`, and `path`.

4. **Correlate each issue to a worktree.** Apply the mechanisms in priority order; first match wins:
   - **Mechanism 2 (Linear branch_name):** if `issue.branch_name` exists and equals (case-insensitive) any worktree's `branch`, that's a match.
   - **Mechanism 3 (regex):** extract `[A-Z]+-\d+` from each worktree's branch and path. If `issue.identifier` matches, that's a match.

5. **Attach matched tickets.** For each matched `(worktree, issue)`:
   - Convert the MCP-returned issue to Symphony's normalized issue model (`id`, `identifier`, `title`, `description`, `priority`, `state`, `branch_name`, `url`, `labels`, `blocked_by`, `created_at`, `updated_at`).
   - Call `mcp__orra__orra_attach_ticket` with `{worktree, ticket, primary: true, source: "directive"}`.
   - If the call returns an error mentioning "manual", that's expected — the user has a manual override. Skip silently.

6. **Heartbeat output.**
   - If at least one ticket was attached or updated this run, emit a one-line summary: `refreshed N tickets across M worktrees`.
   - If no changes, return exactly `no-op`.

### Configuration

In `.orra/config.json`:

```json
{
  "tickets": {
    "mcp": "linear",
    "linear": { "project_slug": "your-project" }
  }
}
```

### Dependencies

- `mcp__orra__orra_scan` (scan worktrees)
- `mcp__orra__orra_attach_ticket` (write tickets)
- A ticket MCP installed by the user (Linear, GitHub, or other)
