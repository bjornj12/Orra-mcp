## Real-time Agent Monitor

*Requires: `fswatch` installed (`brew install fswatch`)*

Watch agent state files in real-time and react to events immediately — don't wait for manual scans.

### On Session Start

1. Check if `fswatch` is available by running `which fswatch`
   - If not found: fall back to periodic scanning via `/loop 2m orra_scan`. Tell the user: "Install `fswatch` (`brew install fswatch`) for real-time agent monitoring. Falling back to scanning every 2 minutes."
   - If found: continue with Monitor setup below
2. Check if `.orra/agents/` exists
   - If not: skip Monitor setup. Note that monitoring will activate once the first agent is registered.
   - If exists: proceed
3. Run an initial `orra_scan` to load current state of all agents. Remember each agent's current status and whether they have a `pendingQuestion`.
4. Use the Monitor tool to run:
   ```bash
   fswatch --event Updated --exclude '\.log$' --exclude '\.answer\.json$' --exclude 'self\.id$' .orra/agents/
   ```
   This watches agent state JSON files. It excludes log files (noisy), answer files (written by you — would cause loops), and self.id files (static).

### Event Reactions

When Monitor surfaces a file change, read the changed agent state file. Compare against what you last knew about that agent to classify the event:

#### Permission Request (`pendingQuestion` appeared)

Read the pending question to understand what tool and command the agent is requesting.

**Auto-approve these safe operations** — call `orra_unblock` with `allow: true` and a brief reason:
- **Read, Glob, Grep**: Always safe — these only read files
- **Bash read-only commands**: `git status`, `git log`, `git diff`, `git branch`, `ls`, `cat`, `head`, `tail`, `wc`, `npm test`, `npm run test`, `npx jest`, `npx vitest`, `tsc --noEmit`, `npm run build`, `npm run lint`
- **Write/Edit**: Only if the target file path is within the agent's own worktree directory
- **Agent**: Spawning subagents within the worktree

**Surface these risky operations to the user** — describe the request and ask them to decide:
- **Bash destructive commands**: `rm`, `kill`, `git push`, `git reset --hard`, `git checkout .`, `git clean`, `docker`, `curl`, `wget`, or any network command
- **Write/Edit outside worktree**: Any file path that is not under the agent's worktree directory
- **Bash with `sudo`**: Always surface
- **Anything not in the safe list**: When in doubt, surface it. A false "ask the user" costs seconds. A false "auto-approve" could cause damage.

After deciding, call `orra_unblock` with the decision (`allow: true/false`) and a reason explaining why.

#### Agent Completed (`status` changed to `idle` from `running`)

1. Call `orra_inspect` on the agent's worktree
2. Summarize what the agent accomplished: commits made, files changed, tests run
3. Suggest next steps: review the diff, create a PR, merge, or start follow-up work

#### Agent Error/Crash (`status` changed to `interrupted`)

1. Call `orra_inspect` to get full worktree context
2. Read the agent's log (last 50 lines) for error details
3. Diagnose the likely cause
4. Attempt to restart the agent with the same task it was working on
5. If the restart also fails (status goes to `interrupted` again), stop retrying and surface the issue to the user with your diagnosis

#### New Agent Registered (new state file appears)

A new agent was registered. Read its state file, note its task and worktree, and start tracking it. No action needed beyond awareness.

### Ongoing

These checks don't come from Monitor events — run them on your normal scan cadence:

- **Drift**: If a worktree branch is behind main, call `orra_rebase`. If it succeeds cleanly, just mention it was handled. If conflicts are predicted, surface to the user with the conflicting files.
- **PR ready to land** (approved + CI green + mergeable): Notify the user with the PR link, summary, and approval details. Do not auto-merge — just notify.

### Key Principle

You are not passively watching — you are the first responder. Permission requests should be resolved in seconds, not minutes. Completions should be surfaced immediately so the user can keep momentum. Errors should be diagnosed and restarted before the user even notices. The goal is zero dead time for agents.
