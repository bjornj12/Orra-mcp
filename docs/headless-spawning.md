# Headless Agent Spawning

Orra can spawn detached `claude --print` (headless) agents in worktrees to handle routine maintenance work — rebases, lint fixes, snapshot updates, dependency bumps — while you focus on the work that actually needs your attention. The process survives the MCP server; state is captured on disk and surfaces in the next `orra_scan`.

## Manual spawning

```
orra_spawn({
  task: "Rebase this worktree onto main and run the tests",
  reason: "12 commits behind",
  worktree: "feat-payments"
})
```

**Inputs:**

- `task` *(required)* — the prompt for the spawned agent, in natural language.
- `reason` *(required)* — why this agent is being spawned. Logged for accountability so you can always trace back *why* an autonomous action was taken.
- `worktree` *(optional)* — the id of an existing worktree to attach to. If omitted, Orra creates a new worktree for the agent.

## Automatic spawning via `auto-remediator`

The `auto-remediator` directive (part of the default directive pack) watches `orra_scan` results for remediation candidates and spawns headless agents automatically when it finds work that matches its allowlist.

Typical triggers:
- A worktree is N commits behind main → spawn a rebase agent.
- Lint is broken on an idle worktree → spawn a lint-fix agent.
- Test snapshots are stale → spawn a snapshot-update agent.

Tasks that fall **outside** the directive's allowlist are *proposed* to you, never auto-executed. `auto-remediator` errs on the side of asking.

## Safety defaults

Spawned agents run with a locked-down `--allowed-tools` allowlist defined in [`src/core/spawn-defaults.ts`](../src/core/spawn-defaults.ts):

**Read-only file access:**
- `Read`, `Glob`, `Grep`

**File modification (scoped to where the agent is running):**
- `Edit`, `Write`

**Git — read:**
- `git status`, `git log`, `git diff`, `git show`, `git branch`, `git fetch`

**Git — write:**
- `git add`, `git commit`, `git rebase`, `git checkout`, `git stash`, `git merge`, `git pull`, `git push`

**Build / test / lint:**
- `npm test`, `npm run lint`, `npm run build`, `npm run typecheck`
- `npx tsc`, `npx vitest`, `npx jest`

**Explicitly blocked:** `rm`, `kill`, `sudo`, `curl`, `wget`, package installs (`npm install`, `npm i`), anything destructive, anything that hits the network beyond `git fetch` / `git pull` / `git push`. If you need an agent with broader permissions, you spawn it manually with your own `allowedTools` override — `auto-remediator` will never do so.

## Concurrency limit

Orra caps how many headless agents run at once. The default is **3**, set in `.orra/config.json`:

```json
{
  "headlessSpawnConcurrency": 3
}
```

When the cap is reached, new spawn requests throw `ConcurrencyLimitError` and `auto-remediator` queues the candidate for a later session.

Bump the limit carefully. Headless agents compete for CPU, I/O, and (if they run tests) test-runner resources.

## State storage

Each spawned agent writes to:

- `.orra/agents/<id>.json` — metadata (status, persona: `"headless-spawn"`, pid, exit code when complete, `task`, `reason`, timestamps).
- `.orra/agents/<id>.log` — captured stdout/stderr from the detached process.

The agent process is **detached** from the MCP server — it keeps running if you restart Orra, and its exit code is captured on next `orra_scan`. This is intentional: routine maintenance shouldn't be coupled to your main session's lifecycle.

## When to use `orra_spawn` vs. in-session work

**Good fit for headless spawning:**
- Rebases, lint autofixes, snapshot updates, dependency bumps.
- Tasks where the "right answer" is obvious and you just want the work done.
- Maintenance you'd do yourself if you had time, but don't want to interrupt your focus.

**Bad fit for headless spawning:**
- Feature work where you'd want to review each decision.
- Anything that might need to ask you a question — headless agents can't prompt, so they'll either give up or make a bad guess.
- Tasks outside the default allowlist — if you find yourself wanting to override the allowlist for a one-off, that's a sign the work isn't routine enough for autonomous execution.

The rule of thumb: **if you'd be annoyed by an agent doing this wrong, don't spawn it headless.**

## Further reading

- [docs/directives.md](directives.md) — how `auto-remediator` decides what to spawn.
- [docs/architecture.md](architecture.md) — how Orra's agent state persistence works.
