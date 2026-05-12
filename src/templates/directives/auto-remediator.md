---
heartbeat:
  cadence: 5m
  output: silent-on-noop
  since_param: true
  only_if_quiet: false
---

## Auto Remediator

Spot routine maintenance work in `orra_scan` and delegate it to background agents — let the
user focus on high-value work while side-quest tasks (rebases, lint fixes, snapshot updates)
get handled automatically.

### How It Works

This directive runs at session start and on each subsequent `orra_scan`. It walks the scan
results, matches each worktree against an allowlist of safe remediation patterns, and uses
`orra_spawn` to delegate.

For anything **outside** the allowlist, the directive proposes the spawn and asks the user — never just acts.

### Concurrency Model

Before spawning, check how many `orra_spawn`-originated agents are already running. `orra_scan`
entries carry provenance: entries whose `summary.oneLine` references an Orra-spawned session or
whose `agent.name` matches a spawn ledger entry in `.orra/spawns/` are "auto-spawned". If 3 or
more are currently `running`, queue the suggestion for the next scan instead of spawning. Surface
a brief note:

> "I'd auto-spawn an agent to fix lint on `feat-payments`, but 3 background agents are already running. Will retry next scan."

### The Allowlist

These patterns auto-spawn without asking. Each is gated on signals from the pre-inspection
cache (`entry.summary.*`) and the basic scan data.

| Pattern | Trigger | Spawned task |
|---|---|---|
| **rebase-on-main** | `git.behind > 5` AND (no PR OR `pr.reviews !== "approved"`) | `"Rebase this worktree onto main using git rebase. If conflicts arise, resolve obvious ones (lockfile noise, line-ending differences, generated files). Leave a comment for the user on anything substantive. After successful rebase, run npm test to verify. Do not push."` |
| **fix-lint** | `summary.tailLines` shows lint errors AND `summary.lastTestResult !== "fail"` | `"Run npm run lint -- --fix, then npm run lint. If errors remain, fix them by hand in source files only — do not modify lint rule configs. Commit the fixes with message chore: fix lint."` |
| **fix-typecheck** | `summary.errorPattern === "syntax_error"` AND `summary.lastTestResult === "unknown"` | `"Run npx tsc --noEmit. Fix any type errors you find. Do not change function signatures unless absolutely required. Commit with message fix: type errors."` |
| **regenerate-lockfile** | `git diff` shows only lockfile drift on a stale worktree (use `orra_inspect` to confirm) | `"Run npm install to regenerate the lockfile. Commit it with message chore: regenerate lockfile."` |

For each match:

1. Call `orra_spawn` with the task, an optional `disallowedTools` list, and a `reason` that
   names the pattern and trigger:

   ```
   orra_spawn({
     task: "<from template>",
     reason: "auto: rebase-on-main (12 commits behind main, no PR yet)",
     worktree: "<id>",
     disallowedTools: ["Bash"]  // only if the task doesn't need shell access
   })
   ```

   The spawned session is a native Agents View bg agent — visible in `claude agents`,
   manageable with `claude stop <short>` / `claude rm <short>` / `claude attach <short>`.

2. Tell the user briefly (one-line aside):

   > "Spawned bg agent to rebase `feat-payments` (12 behind main). I'll surface the result when it finishes."

### When to Propose, Not Spawn

For anything not in the allowlist — or when you're uncertain about the cause — propose and
wait. Examples:

- CI failing on a test that looks unrelated to the worktree's changes
- A merge conflict that needs judgment
- A pattern you haven't seen before

Phrase as offers. Always include the reason and your confidence level.

### Surfacing Completions

When a spawned agent finishes, `orra_scan` shows it with `status: "completed"` (or `"failed"`)
and a fresh `summary`. Surface it once:

> "Auto-spawned `feat-payments` rebase **succeeded** — branch is now even with main, all tests passing."

> "Auto-spawned `feat-billing` lint fix **failed** — exit code 1. Last log line: `Cannot find module '@/utils'`. Needs a real look. Want me to inspect?"

Surface once, then let it drop into history.

### What to Avoid

- **Don't auto-spawn for the user's focus work.** If a worktree is the user's active context
  (mentioned in today's daily note or recently in conversation), leave it alone.
- **Don't auto-spawn the same task twice.** If a spawn already happened for `feat-payments`
  rebase in this session and is still running or recently completed, don't spawn another.
- **Don't auto-spawn on a worktree that already has an active bg agent** (check `agent.status === "running"` in the `orra_scan` result for that worktree). That worktree has a session in flight — sending another agent in would step on toes.
- **Don't widen the tool allowlist on the fly.** If a pattern needs more tools, propose it
  to the user and explain — don't pass `disallowedTools` overrides without explicit user
  permission.

### Killing a Spawned Agent

To stop a bg agent (without removing its transcript):
```
claude stop <short>
```

To remove a bg agent and its associated worktree:
```
orra_kill({ agent: "<short>", cleanup: true })
```

Or use `orra_kill` which wraps `claude stop`/`claude rm` and handles the Orra provenance ledger.

### Dependencies

- `orra_spawn` (this directive's reason for existing)
- `orra_scan` (for pattern matching)
- `orra_inspect` (for confirming candidates like lockfile-only drift)
- The pre-inspection cache provides `summary.*` fields that drive several patterns

### Pairs With

- **monitor-agents** — handles event-driven triage of blocked/completed agents; `auto-remediator` handles scheduled remediation. Complementary, not redundant.
- **morning-briefing** — when you spot work the user should know about, defer mentioning it until they're already engaged with their daily focus.

## Heartbeat invocation

**Critical:** when woken by the heartbeat, this directive is in **suggest-only** mode. It does
NOT call `orra_spawn` — even for allowlisted patterns. The allowlist's "auto-spawn without
asking" behavior is only valid on real user turns where the user is around to see the one-line
aside. On a heartbeat tick, surface candidates as offers and wait for the next user turn.

When the dispatcher wakes this directive with `since=<timestamp>`:

1. Call `orra_scan`. Walk the result and match each worktree against the allowlist patterns
   above (`rebase-on-main`, `fix-lint`, `fix-typecheck`, `regenerate-lockfile`) exactly as in
   the normal invocation.

2. Filter to **newly-eligible** candidates — worktrees where the remediation opportunity
   *became available* since `since`. Do not re-flag worktrees that were already eligible at
   `since`; a previous tick already had its chance to flag them.

3. Filter out anything already offered or spawned this session. If `orra_scan` shows a running
   bg agent (from the spawn ledger in `.orra/spawns/`) for the same worktree + pattern, skip it.

4. For each surviving candidate, emit one line as a **suggestion**:
   > `feat-payments is 12 commits behind main and idle — want me to spawn a rebase agent?`
   > `feat-billing has fresh lint errors from the last test run — spawn an auto-fix agent?`

   Include the trigger reason so the user can decide without clicking.

**No-op condition:** if no new allowlist candidates became eligible since `since`, OR every
candidate was already offered/spawned in a previous tick, return exactly the literal string
`no-op` and nothing else. Silence is the normal case.

Never call `orra_spawn` from a heartbeat tick.
