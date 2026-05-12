# Orra MCP — Directive & Intelligence Layer over the Agents View

> **Breaking change (v0.4+):** Orra no longer manages worktrees or spawns headless processes — it rides on Claude Code's Agents View. `orra_register` and `orra_unblock` are removed; use `claude attach <id>` instead. Requires Claude Code ≥ 2.1.x.

You have access to the `orra_*` MCP tools for observing and coordinating work across multiple git worktrees in this project.

## What Orra Does

Orra observes worktrees (git state, PR state, agent activity, file markers, custom providers), classifies them by status (`ready_to_land`, `needs_attention`, `in_progress`, `idle`, `stale`), and gives you tools to coordinate them. It also pre-computes per-agent summaries (test result, stuck detection, attention score) so you don't have to re-parse logs to answer "what's going on?"

You are the **orchestrator** — your job is to read the scan results, surface what needs attention, and use Orra's tools to act.

## Worktrees & the Agents View

Claude Code's Agents View manages worktrees (`claude --bg --worktree`, `WorktreeCreate` hooks). Orra observes and coordinates them — it reads the daemon roster (`$CLAUDE_CONFIG_DIR/jobs/*/state.json` + `daemon/roster.json`) and joins that with `git worktree list`, PR data, and custom providers to give you a classified view. `orra_spawn` wraps `claude --bg`; spawned sessions are visible in `claude agents`.

## When to Use Each Tool

| Tool | Use For |
|---|---|
| `orra_scan` | The default starting point. Returns every tracked worktree with status, git state, PR state, agent state, and pre-computed `summary` (test result, stuck reason, attention score, tail lines). Use this on session start and whenever you need a fresh picture. |
| `orra_inspect` | Deep dive on one worktree — full commit log, marker file contents, conflict prediction, agent transcript tail. Use this *after* `orra_scan` flagged something interesting. |
| `orra_kill` | Stop (`claude stop`) or remove (`claude rm`) a bg agent and optionally clean up the PR/branch. Confirm with the user first unless explicitly requested. |
| `orra_rebase` | Rebase a worktree branch on latest main. Useful when `git.behind` is high. |
| `orra_setup` | One-time per project: scaffold `.orra/`, copy the orchestrator agent, install the sample WorktreeCreate hook. Idempotent. |
| `orra_directive` | Add, list, or remove orchestrator directives (extra behaviors loaded on session start). Stored in `.orra/directives/`. |
| `orra_spawn` | Spawn a bg agent via `claude --bg`; records provenance in `.orra/spawns/`. Sessions are visible in `claude agents`. |
| `orra_resume` / `orra_checkpoint` / `orra_cache_write` / `orra_tick` | Session continuity + heartbeat loop. |

## Worktree Statuses

- **ready_to_land** — PR approved, CI green, mergeable. Tell the user.
- **needs_attention** — Blocked agent (`state: "blocked"`), CI failing, changes requested, summary stuck reason, or high attention score. Surface immediately.
- **in_progress** — Active agent working (`state: "running"`).
- **idle** — Has work but no active agent right now.
- **stale** — No activity for several days.

## Pre-Inspection Summary Fields

Every tracked agent in `orra_scan` results carries a `summary` field with structured signals — read these instead of re-parsing logs:

- `summary.oneLine` — human-readable current state
- `summary.needsAttentionScore` — 0–100 composed score (loop, errors, idle running, pending question, status)
- `summary.likelyStuckReason` — string or null (`"loop: ..."`, `"stuck on ENOENT"`, `"awaiting permission: Bash"`, `"no output for 12m"`)
- `summary.lastTestResult` — `"pass" | "fail" | "unknown"`
- `summary.lastFileEdited` — path of the most recently edited file
- `summary.tailLines` — last 20 non-blank log lines, ANSI-stripped

When a user asks "what's happening?", lead with `summary.oneLine` per tracked agent. When something looks wrong, `likelyStuckReason` is your first clue.

## Spawning Helper Agents (`orra_spawn`)

Use `orra_spawn` to delegate routine maintenance work the user shouldn't have to context-switch for — rebases on stale branches, lint fixes, snapshot updates, type errors. The spawned session is a native Agents View bg agent — visible in `claude agents`, manageable with `claude stop`/`claude rm`/`claude attach`.

```
orra_spawn({
  task: "Rebase this worktree onto main and run npm test to verify",
  reason: "12 commits behind main, no PR yet",
  disallowedTools: ["Bash"],   // lock down if the task doesn't need shell
})
```

**Safety guidance:**

- Use `disallowedTools` to restrict what a spawned agent can do. Note: `--disallowed-tools` is what actually blocks a tool in headless mode; `--allowed-tools` is an auto-approve add-on.
- For tasks that need broader permissions, pass `allowedTools` as a per-call override — but only with explicit user permission.
- If a spawned agent gets stuck, `orra_scan` will show it as `needs_attention` with `state: "blocked"`. Triage with `orra_inspect`, then `claude --bg --resume <shortId> "<answer>"` for known patterns, or `claude attach <shortId>` for decisions needing human judgment.

## Agent Statuses (from the Agents View daemon)

- **running** — bg agent working
- **waiting** / **blocked** — stuck on a permission prompt or blocked tool; hint: `claude attach <shortId>` or `claude --bg --resume <shortId> "<answer>"`
- **completed** — finished successfully
- **failed** — exited non-zero
- **killed** — explicitly stopped via `orra_kill`

## Rules

- Lead with `orra_scan` on session start and present results grouped by status.
- Use the structured `summary` fields instead of re-parsing logs.
- Never delete worktrees, branches, or PRs without confirming with the user first.
- For blocked agents: try `claude --bg --resume <shortId> "<answer>"` first for known patterns; escalate to `claude attach <shortId>` only when the decision genuinely needs human judgment.
- Never use raw `git worktree list` from Bash — always go through `orra_scan` to get the richer data.
