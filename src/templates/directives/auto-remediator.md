## Auto Remediator

Spot routine maintenance work in `orra_scan` and delegate it to headless background agents — let the user focus on high-value work while side-quest tasks (rebases, lint fixes, snapshot updates) get handled automatically.

### How It Works

This directive runs at session start and on each subsequent `orra_scan`. It walks the scan results, matches each worktree against an allowlist of safe remediation patterns, and uses `orra_spawn` to delegate.

For anything **outside** the allowlist, the directive proposes the spawn and asks the user — never just acts.

### The Allowlist

These patterns auto-spawn without asking. Each is gated on signals from the pre-inspection cache (`entry.summary.*`) and the basic scan data.

| Pattern | Trigger | Spawned task template |
|---|---|---|
| **rebase-on-main** | `git.behind > 5` AND (no PR OR `pr.reviews !== "approved"`) | "Rebase this worktree onto main using `git rebase`. If conflicts arise, resolve obvious ones (lockfile noise, line-ending differences, generated files). Leave a comment for the user on anything substantive. After successful rebase, run `npm test` to verify. Do not push." |
| **fix-lint** | `summary.tailLines` shows lint errors AND `summary.lastTestResult !== "fail"` | "Run `npm run lint -- --fix`, then `npm run lint`. If errors remain, fix them by hand in source files only — do not modify lint rule configs. Commit the fixes with message `chore: fix lint`." |
| **fix-typecheck** | `summary.errorPattern === "syntax_error"` AND `summary.lastTestResult === "unknown"` | "Run `npx tsc --noEmit`. Fix any type errors you find. Do not change function signatures unless absolutely required. Commit with message `fix: type errors`." |
| **regenerate-lockfile** | `git diff` shows only lockfile drift on a stale worktree (use `orra_inspect` to confirm) | "Run `npm install` to regenerate the lockfile. Commit it with message `chore: regenerate lockfile`." |

For each match, before spawning:

1. **Check concurrency.** Call `orra_scan` and count entries whose `agent.agentPersona === "headless-spawn"` AND `agent.status === "running"`. If the count is at the configured limit (default 3, in `.orra/config.json` → `headlessSpawnConcurrency`), queue the suggestion for later instead of spawning. Surface a brief note: "I'd auto-spawn an agent to fix lint on `feat-payments`, but 3 headless agents are already running. Will retry next scan."

2. **Spawn.** Call `orra_spawn` with the task template, the worktree id, and a `reason` that includes the pattern name and the trigger:

   ```
   orra_spawn({
     task: "<from template>",
     reason: "auto: rebase-on-main (12 commits behind main, no PR yet)",
     worktree: "<id>"
   })
   ```

3. **Tell the user briefly.** Don't interrupt their flow; mention it as a one-line aside:

   > "Spawned headless agent to rebase `feat-payments` (12 behind main). I'll surface the result when it finishes."

### When to Propose, Not Spawn

For anything not in the allowlist — including any case where you're uncertain about the cause — propose the spawn and wait for the user. Examples:

- CI failing on a test that looks unrelated to the worktree's changes ("CI is failing on `auth.test.ts` but the PR only touches billing — want me to spawn an investigator?")
- A merge conflict that needs judgment ("conflict in `migrations/` — could go either way, want me to spawn an agent or take it yourself?")
- A pattern you've never seen before ("`feat-foo` looks stuck on something I don't recognize — log shows X. Spawn an agent to dig in?")

Phrase as offers, not actions. Always include the reason and your confidence level.

### Surfacing Completions

When a spawned agent finishes, the next `orra_scan` shows it with `status: "completed"` (or `"failed"`) and a fresh summary. When you notice a transition, surface it once:

> "Auto-spawned `feat-payments` rebase **succeeded** — branch is now even with main, all tests passing."

> "Auto-spawned `feat-billing` lint fix **failed** — exit code 1. Last log line: `Cannot find module '@/utils'`. The fix needs a real human look. Want me to inspect?"

Don't keep mentioning completed agents on every scan — surface once, then let it drop into history.

### What to Avoid

- **Don't auto-spawn for the user's focus work.** If a worktree is the user's active context (mentioned in today's daily note's "Today's focus" or recently in conversation), leave it alone. The point of this directive is to handle background tasks, not interfere with priority work.
- **Don't auto-spawn the same task twice.** If a spawn already happened for `feat-payments` rebase in this session and is still running or recently completed, don't spawn another.
- **Don't auto-spawn on a worktree that already has an agent registered (via `orra_register`).** That worktree has a human or interactive session in flight — sending a headless agent into it would step on toes.
- **Don't widen the allowlist on the fly.** If a pattern needs more tools than the default allowlist provides, propose it to the user and explain — don't pass `allowedTools` overrides without explicit user permission.

### Dependencies

- `orra_spawn` (this directive's reason for existing)
- `orra_scan` (for pattern matching)
- `orra_inspect` (for confirming candidates like lockfile-only drift)
- The pre-inspection cache provides `summary.*` fields that drive several patterns
- `.orra/config.json` defines `headlessSpawnConcurrency` (default 3)

### Pairs With

- **monitor-agents** — handles event-driven reactions; `auto-remediator` handles scheduled remediation. They're complementary, not redundant.
- **morning-briefing** — when you spot work the user should know about, defer mentioning it until they're already engaged with their daily focus.
