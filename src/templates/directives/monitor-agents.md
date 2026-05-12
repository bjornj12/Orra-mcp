---
lean: true
cache_schema:
  fields: [worktree_id, status, last_activity, attention_score, blocked_on]
  summary_facets: [status, blocked_on]
escalate_when:
  - "status == waiting"
  - "attention_score >= 60"
allowed_tools: ["mcp__orra__orra_scan", "mcp__orra__orra_inspect", "mcp__orra__orra_cache_write"]
heartbeat:
  cadence: 5m
  output: silent-on-noop
  since_param: true
  only_if_quiet: false
---

## Triage Waiting Agents

React to blocked and newly-completed bg agents surfaced by `orra_scan`. Each tick:
call `orra_scan` → for each entry with `status: needs_attention` or `flags` including `blocked`
→ `orra_inspect` to read the transcript tail / `detail` → handle it (or escalate to the human
as ONE concise line), then write a condensed status summary to `.orra/memory/`.

You are the first responder for agent state events — blocked agents should be triaged in
seconds, completions surfaced immediately, and the human interrupted only for genuine decisions.

### How Agent State Works (Agents View)

Agent state is daemon-backed. `orra_scan` returns a classified view joining the daemon roster
(`$CLAUDE_CONFIG_DIR/jobs/*/state.json` + `daemon/roster.json`) with `git worktree list` and
PR data. Key fields:

- `agent.status` — `running` | `waiting` | `blocked` | `completed` | `failed` | `killed`
- `agent.flags` — array; includes `"blocked"` when the agent is waiting for input
- `agent.detail` — one-liner from the daemon: what the agent is doing or waiting on
- `agent.daemonShort` — the short ID used by `claude attach`/`claude stop`/`claude rm`

For a deeper look at what the agent is waiting on, call `orra_inspect` on the worktree id —
it reads the transcript `.jsonl` and surfaces the last few turns.

### On Session Start

1. Call `orra_scan` to load the current state of every tracked agent.
2. For each entry with `flags` including `"blocked"` or `status === "waiting"`, immediately
   run the **Blocked Agent** handling below.
3. For entries with high `summary.needsAttentionScore` (≥ 60), surface them to the user.
4. Remember each agent's current `status`, `agent.flags`, and `summary.likelyStuckReason` as
   the baseline for delta-detection on subsequent ticks.

### Blocked Agent Handling

When `orra_scan` shows an agent with `flags` including `"blocked"`:

1. Read `agent.detail` for the one-liner reason.
2. Call `orra_inspect({ target: "worktree", id: "<slug>" })` for the transcript tail.
3. Classify the block:

**Routine pattern — answer non-interactively:**
`claude --bg --resume <shortId> "<answer>"` (this mints a new daemon job row continuing the same conversation; no human needed):
- "Should I run the tests?" → answer `"yes"`
- "Which file should I edit?" when the answer is obvious from context
- "Confirm you want me to commit?" → answer `"yes, commit"` after verifying it looks safe
- Any yes/no gating question on a task you (Orra) spawned via `orra_spawn`

**Needs human judgment — escalate as ONE concise line:**
`"feat-auth blocked: agent is asking whether to delete migration files — needs your call (claude attach abc1234f)"`
- Destructive operations outside the agent's assigned scope
- Architectural or design decisions
- Anything involving credentials, external services, or irreversible actions
- Any block where you're not confident of the right answer

Surface the `claude attach <shortId>` command so the user can jump in immediately.

### Agent Stuck Detection

The summary cache detects stuck patterns. Read `summary.likelyStuckReason`:

- `"loop: same line repeats"` — the agent is spinning. Propose `orra_kill({ agent: "<short>", cleanup: false })` to stop and preserve the transcript, then inspect.
- `"stuck on <errorPattern>"` — repeated errors. Call `orra_inspect` for context; spawn a fixer via `orra_spawn` if the pattern is clear (e.g. a dependency is missing).
- `"no output for Nm"` — may be a long-running task or genuinely hung. Surface with `summary.detail` and offer to `claude attach <shortId>`.

Do not act on stuck detection without confirming with the user — these are diagnoses.

### Agent Completed

When `status` transitions to `completed`:

1. Read `summary.oneLine` and `summary.lastTestResult` — no need to re-parse the transcript.
2. Call `orra_inspect` only if you need the full detail (PR state, conflict prediction).
3. Surface: `"feat-billing completed — tests passing, last file: src/billing.ts."` Suggest review/PR/merge as appropriate.
4. Write a one-liner to `.orra/memory/worktrees/<id>.md` under "Recent completions" (append, don't overwrite).

### Agent Failed / Killed

1. Read `summary.oneLine` and `summary.tailLines` for immediate context.
2. If the agent was spawned by `orra_spawn` (check `orra_inspect` for provenance via `.orra/spawns/`): do NOT restart — a failed background agent usually means the task hit something outside its allowed scope. Surface once with the diagnosis.
3. If it's a user-started interactive session: surface with diagnosis. Offer `orra_spawn` with a retry prompt if the failure reason is clear.

### Drift and PR State (Ongoing)

On your normal scan cadence:

- **Drift:** If a worktree branch is significantly behind main, call `orra_rebase`. Clean rebase → mention it. Conflicts predicted → surface the conflicting files.
- **PR ready to land** (approved + CI green + mergeable): Notify the user with the PR link. Do not auto-merge.

### Writing Status to Memory

After each triage pass, write a condensed status summary to `.orra/memory/worktrees/`. One file per recently-active worktree, one line per update:

```
last_triage: <iso-timestamp>
<shortId>: <status> — <summary.oneLine>
```

Keep it brief — this is a breadcrumb for `memory-recall`, not a log.

### What NOT to Do

- Do not use `orra_unblock` — it no longer exists. Use `claude --bg --resume <shortId> "<answer>"` for routine answers, or `claude attach <shortId>` for human decisions.
- Do not read raw `.orra/agents/<id>.json` or `.orra/agents/<id>.log` — those are from the old lifecycle and are not written anymore. Agent state comes from `orra_scan` (daemon-backed).
- Do not shell out to `git worktree list` or `claude agents` directly — always go through `orra_scan` for the classified view.

## Heartbeat invocation

When the dispatcher wakes this directive with `since=<timestamp>`:

1. Call `orra_scan`. The scan is cheap — pre-computed summaries from the daemon state + disk cache.
2. Find agents whose `agent.updatedAt` (or the daemon job's `updatedAt`) is strictly after `since`. These were touched in this window; ignore the rest.
3. For each touched agent, surface only **transitions** since `since`:
   - `flags` gained `"blocked"` → run the Blocked Agent triage loop above; if it's a routine pattern, answer via `claude --bg --resume`; otherwise emit ONE line with `claude attach <shortId>`.
   - `status` changed to `completed` → emit `"<id> completed — <summary.oneLine>"`.
   - `status` changed to `failed` → emit `"<id> failed — <summary.tailLines[-1]>"`.
   - `summary.likelyStuckReason` became non-null → emit `"<id> stuck: <reason>"`.
   - `summary.needsAttentionScore` crossed 60 → emit `"<id> attention score <score>: <oneLine>"`.
4. Aggregate into a short bullet list. Omit agents with no transitions.

**No-op condition:** if zero agents were touched since `since`, OR every touched agent's signals are unchanged (same status, same flags, same `likelyStuckReason`, same attention bracket), return exactly the literal string `no-op` and nothing else.

Do not re-parse raw transcript files on heartbeat ticks. Do not re-emit the rich per-event narratives above — heartbeat output is a deliberately thinner digest.
