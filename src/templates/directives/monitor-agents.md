---
heartbeat:
  cadence: 5m
  output: silent-on-noop
  since_param: true
  only_if_quiet: false
---

## Real-time Agent Monitor

*Requires: `fswatch` installed (`brew install fswatch`)*

Watch agent state files in real-time and react to events immediately — don't wait for the user to ask "what's happening?".

### How This Directive Works

You react to two kinds of signals:

1. **Push** (low-latency): `fswatch` notifies you when an agent state file changes. Use this for permission-request reactions where seconds matter.
2. **Pull** (rich context): `orra_scan` returns each tracked agent's pre-computed `summary` field — `oneLine`, `needsAttentionScore`, `likelyStuckReason`, `lastTestResult`, `lastFileEdited`, `tailLines`. Use this for "what's the situation?" questions and stuck-detection without re-parsing logs yourself.

You almost never need to read raw `.orra/agents/<id>.log` files directly. The summary cache has done the parsing for you.

### On Session Start

1. Check if `fswatch` is available: `which fswatch`
   - Not found: fall back to periodic `/loop 2m orra_scan`. Tell the user: "Install `fswatch` (`brew install fswatch`) for real-time agent monitoring. Falling back to scanning every 2 minutes."
   - Found: continue.

2. Check if `.orra/agents/` exists. If not, skip Monitor setup — monitoring activates once the first agent is registered.

3. Run an initial `orra_scan` to load the current state of every tracked agent. For each entry, remember:
   - `agent.status`
   - `agent.pendingQuestion` presence
   - `summary.needsAttentionScore` and `summary.likelyStuckReason` (so you can detect when they change later)

4. Use the Monitor tool to run:
   ```bash
   fswatch --event Updated --exclude '\.log$' --exclude '\.answer\.json$' --exclude 'self\.id$' .orra/agents/
   ```
   This watches agent state JSON files. Excludes log files (noisy — the summary already covers them), answer files (you write those, would loop), and self.id files (static).

### Event Reactions

When Monitor surfaces a file change, immediately call `orra_scan` (cheap — summaries are cached) and find the entry whose state changed. Compare against what you last knew about that agent.

#### Permission Request (`agent.pendingQuestion` appeared)

Read `agent.pendingQuestion.tool` and `agent.pendingQuestion.input` to understand what the agent is requesting.

**Auto-approve these safe operations** — call `orra_unblock` with `allow: true` and a brief reason:

- **Read, Glob, Grep**: always safe — read-only
- **Bash read-only commands**: `git status`, `git log`, `git diff`, `git branch`, `ls`, `cat`, `head`, `tail`, `wc`, `npm test`, `npm run test`, `npx jest`, `npx vitest`, `tsc --noEmit`, `npm run build`, `npm run lint`
- **Write/Edit**: only if the target file path is inside the agent's own worktree directory
- **Agent**: spawning subagents inside the worktree

**Surface these risky operations to the user** — describe the request and ask them to decide:

- **Bash destructive commands**: `rm`, `kill`, `git push`, `git reset --hard`, `git checkout .`, `git clean`, `docker`, `curl`, `wget`, or any network command
- **Write/Edit outside the worktree**
- **Bash with `sudo`**
- **Anything not in the safe list** — when in doubt, surface it. A false "ask the user" costs seconds. A false "auto-approve" could cause damage.

After deciding, call `orra_unblock` with the decision and a one-line reason.

#### Agent Stuck (`summary.likelyStuckReason` became non-null)

The summary cache detects three kinds of stuck:

- `"loop: same line repeats in tail"` — the agent is in an output loop (same line ≥ 3× in the tail-20 window)
- `"stuck on <errorPattern>"` — repeated error family (ENOENT, ECONNREFUSED, timeout, command_not_found, permission_denied, syntax_error)
- `"no output for Nm"` — running for > 10 minutes with no log activity

For each, summarize the situation using `summary.oneLine` + `summary.tailLines` (last 20 log lines, already ANSI-stripped) and propose a concrete action:

- Loop → "the agent has been writing the same line for the last N updates — looks like it's not making progress. Want me to interrupt and inspect?"
- Error pattern → "agent has been hitting <ENOENT> repeatedly. Probably needs a manual fix. Want me to call `orra_inspect` for context?"
- No output for Nm → "no output for N minutes. Want me to inspect or restart?"

Don't act unless the user agrees — these are diagnoses, not auto-fixes.

#### Agent Completed (`status` changed from `running` to `idle`)

1. Read `summary.oneLine` and `summary.lastTestResult` for an immediate verdict — no need to re-parse the log.
2. Call `orra_inspect` only if you need details beyond the summary (e.g. PR state, conflict prediction, full marker contents).
3. Surface to the user: "X finished — last test run <passed|failed>, last file edited: <summary.lastFileEdited>." Suggest review/PR/merge as appropriate.

#### Agent Failed or Interrupted (`status` changed to `failed` or `interrupted`)

1. Read `summary.oneLine` and `summary.tailLines` for the immediate context.
2. Note: `likelyStuckReason` will be **null** for failed/interrupted agents — that's by design (they're done, not currently stuck). Use `summary.tailLines` and `summary.lastTestResult` instead to diagnose.
3. **Check `agent.agentPersona`.** If it's `"headless-spawn"` (an `auto-remediator`-spawned agent), do NOT attempt restart. A failed headless agent usually means the task hit something the safe `--allowed-tools` allowlist couldn't handle — restarting won't fix that. Surface it to the user with the diagnosis and the reason it was spawned, so they can decide whether to widen the allowlist, take it manually, or ignore it. The `auto-remediator` directive should also be aware via the next scan and stop re-spawning the same pattern.
4. If it's an interactive/registered agent (not headless-spawn): attempt a single restart with the same task. If it interrupts again, stop retrying and surface to the user with your diagnosis from the tail.
5. If failed (non-zero exit) on an interactive agent, surface immediately with diagnosis — don't restart.

#### High Attention Score (`summary.needsAttentionScore >= 60`)

Even if no other event fired, a high score means the agent is in trouble — failed status, repeated errors, stuck patterns. Surface it to the user with the score and the reason.

#### New Agent Registered (new state file appears)

Read its state via `orra_scan`, note its task and worktree, and start tracking it. No action needed beyond awareness.

### Ongoing (Not Event-Driven)

These checks don't come from Monitor events — run them on your normal scan cadence:

- **Drift**: If a worktree branch is behind main, call `orra_rebase`. Clean rebase → just mention it was handled. Conflicts predicted → surface with the conflicting files.
- **PR ready to land** (approved + CI green + mergeable): Notify the user with the PR link, summary, and approval details. Do not auto-merge — just notify.

### Key Principle

You are not passively watching — you are the first responder. Permission requests should be resolved in seconds. Stuck agents should be diagnosed before the user notices. Completions should be surfaced immediately. The goal is zero dead time for agents.

The pre-inspection cache does the heavy lifting (parsing, scoring, stuck-detection) so you don't have to. Read the structured `summary` fields from `orra_scan` and react — don't re-parse logs yourself.

## Heartbeat invocation

When the dispatcher wakes this directive with `since=<timestamp>`, do NOT run a full `fswatch`-style sweep. Run a cheap time-windowed diff instead:

1. Call `orra_scan`. The scan is cheap — it reads pre-computed summaries from disk.
2. For each tracked agent, look at its state file in `.orra/agents/<id>.json`. Treat any agent whose state file `mtime` is strictly after `since` as "touched this window"; ignore the rest. (The `since` value is the ISO timestamp passed by the dispatcher, or `armed_at` on the first tick.)
3. For each touched agent, compare its current signals to what the previous tick knew. Specifically, surface transitions that happened since `since`:
   - `status` changed from `running` to `idle` (completed), `failed`, or `interrupted`
   - `agent.pendingQuestion` newly appeared (permission request — auto-approve safe operations via `orra_unblock` per the allowlist above, surface risky ones)
   - `summary.likelyStuckReason` became non-null (newly stuck)
   - `summary.needsAttentionScore` crossed 60 in this window
4. Aggregate transitions into a short report. One line per agent, leading with `summary.oneLine` and the transition verb (e.g. `"feat-auth completed — tests passing"`, `"feat-billing newly blocked on Bash permission for rm"`).

**No-op condition:** if the scan finds zero agents whose state file was touched since `since`, OR every touched agent's signals are unchanged from what the previous tick would have observed (same status, same `pendingQuestion`, same `likelyStuckReason`, same attention bracket), return exactly the literal string `no-op` and nothing else. The dispatcher will suppress it.

Do not run `fswatch`, do not re-parse raw log files, and do not emit the rich per-event narratives from the "Event Reactions" section above — those are for interactive, `fswatch`-driven reactions on a normal user turn. The heartbeat invocation is a deliberately thinner digest.
