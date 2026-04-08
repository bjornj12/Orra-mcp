# Orra MCP v2 Refactor — Execution Design

**Date**: 2026-04-08
**Status**: Approved
**Context**: Surgical refactor of Orra MCP v1 into v2 (awareness engine + action engine). Implements the approved v2 design spec from `/Orchestrator/docs/superpowers/specs/2026-04-07-orra-mcp-v2-design.md`.

---

## Overview

Refactor the existing Orra MCP v1 codebase in-place to implement the v2 design. The v2 thesis: Claude is the decision engine — the MCP provides eyes (awareness) and hands (actions). No sockets, no registration, no chaining DSL. Agents are plain Claude Code sessions that report state via hooks writing to `.orra/` files.

**Strategy**: Surgical replace — incremental steps, tests pass after each step, no big-bang swap.

**Starting point**: ~1200 LOC, 132 tests, 8 core modules, 14 tool files, 1 hook script.

**End state**: ~1000-1400 LOC, 7 individual MCP tools, awareness engine, file-based hooks, orchestrator agent persona.

---

## Target Architecture

```
Claude Code (orchestrator agent persona)
       │ MCP protocol (stdio)
┌──────▼──────────────────────────────┐
│  Orra MCP Server                    │
│  ├── Awareness Engine               │
│  │   ├── git state reader           │
│  │   ├── file marker scanner        │
│  │   ├── GitHub PR/CI enricher      │
│  │   ├── agent process monitor      │
│  │   └── status classifier          │
│  ├── Action Engine (agent-manager)  │
│  │   ├── worktree manager           │
│  │   ├── agent spawner (PTY)        │
│  │   ├── agent messenger            │
│  │   ├── permission handler         │
│  │   └── rebase coordinator         │
│  └── State Persistence (.orra/)     │
└──────┬──────────────────────────────┘
       │ spawns / monitors
  Worktree Agents (Claude Code sessions)
  └── Report state via hooks → .orra/
```

---

## What Changes

### Removed

| Module | Why |
|--------|-----|
| `socket-server.ts` | Replaced by file-based hook communication |
| `socket-client.ts` | Agents don't connect to anything |
| `linker.ts` | Claude decides what to chain — no built-in linking |
| Agent mode detection (`index.ts`) | MCP is always the orchestrator |
| `orra-agent.ts` router + agent tools (register, unregister, heartbeat) | No agent self-registration |
| Consolidated `orra` router (`orra.ts`) | Split into 7 individual tools |

### Added

| Module | Purpose |
|--------|---------|
| `src/core/awareness.ts` | Scan worktrees: git state, markers, agent status, GitHub PRs, status classification |
| `src/core/config.ts` | Read `.orra/config.json` for markers, staleDays, driftThreshold, defaults |
| Rebase logic (in worktree manager or standalone) | Fetch main, rebase branch, report conflicts |
| 7 individual tool files | `orra_scan`, `orra_inspect`, `orra_spawn`, `orra_kill`, `orra_message`, `orra_unblock`, `orra_rebase` |
| Orchestrator persona | `.claude/agents/orchestrator.md` template |
| Setup script | `npx @orra/setup` — installs persona + config + .gitignore |

### Evolved

| Module | Changes |
|--------|---------|
| `agent-manager.ts` (591→~300 lines) | Remove socket management, link evaluation, external registration. Becomes the "action engine". |
| `state.ts` | Remove link persistence. Update agent schema (add `agentPersona`, `pendingQuestion`). Add config support. |
| `orra-hook.ts` | Remove socket comms. Write directly to `.orra/agents/<id>.json`. File-based semaphore for permissions. |
| `types.ts` | Remove SocketMessage, Link types. Add ScanResult, WorktreeStatus, Config, StatusClassification. |
| `index.ts` | Remove mode detection. Always orchestrator. |
| `server.ts` | Remove conditional tool registration. Register 7 tools. |
| `worktree.ts` | Add conflict detection. |
| `process.ts` | Support `--agent <persona>` flag when spawning Claude. |

### Kept As-Is

| Module | Why |
|--------|-----|
| `stream-parser.ts` | Still needed for ANSI stripping. No changes. |

---

## MCP Tools (v2)

| Tool | Purpose | Category |
|------|---------|----------|
| `orra_scan` | Scan all worktrees, return structured status summary | awareness |
| `orra_inspect` | Deep dive on one worktree — full git state, markers, PR, agent output | awareness |
| `orra_spawn` | Create worktree + launch Claude agent with task | action |
| `orra_kill` | Stop agent + remove worktree + clean branch + optionally close PR | action |
| `orra_message` | Send message/instruction to a worktree agent | action |
| `orra_unblock` | Answer a pending permission prompt for an agent | action |
| `orra_rebase` | Rebase a worktree branch on latest main | action |

---

## Awareness Engine Details

### scanAll() Flow

1. `git worktree list --porcelain` → parse all worktree paths + branches (filter out main repo)
2. For each worktree, **run git commands in parallel**:
   - `git -C <path> rev-list --count main..<branch>` (commits ahead)
   - `git -C <path> rev-list --count <branch>..main` (commits behind)
   - `git -C <path> status --porcelain` (uncommitted changes)
   - `git -C <path> log -1 --format=%ci` (last commit time)
   - `git -C <path> diff --stat main...<branch>` (diff stat)
   - Read `.orra/agents/<id>.json` (agent state, PID liveness check)
   - Glob for configured marker files in worktree
3. `enrichWithGitHub()` — single `gh pr list --json` call per branch, cached for the scan session
4. Classify each worktree using signal combination rules

Parallelization per-worktree keeps scan time under 2-3 seconds even with 10+ worktrees.

### inspectOne(id) — Additional Data

Everything from scanAll, plus:
- Full commit log vs main
- File marker contents (first ~50 lines of spec.md, PRD.md, etc.)
- PR review comments summary
- Agent output tail (last 50 lines if agent running)
- Conflict prediction (files modified in both worktree and main since diverge point)

### Status Classification Rules

| Status | Signals |
|--------|---------|
| `ready_to_land` | Has PR + approved + CI passing + mergeable + ≤5 behind main |
| `needs_attention` | Agent has pending question, OR PR has change requests, OR CI failing |
| `in_progress` | Agent running + last activity < staleness threshold + not blocked |
| `idle` | No agent running + has commits ahead of main + last activity < staleness threshold |
| `stale` | No agent + last activity ≥ staleness threshold (default: 3 days) |

### GitHub Enrichment

- Uses `gh pr list --head <branch> --json number,state,reviews,statusCheckRollup,mergeable`
- Graceful fallback: if `gh` not installed, not authenticated, or not a GitHub repo — scan works without PR data
- Without PR data, a worktree cannot be classified as `ready_to_land` but all other statuses still work

---

## Hook File-Based Semaphore

Replaces socket-based permission flow from v1.

### Permission Flow

```
Agent hits permission prompt
  → Claude Code fires PermissionRequest hook
  → Hook writes pendingQuestion to .orra/agents/<id>.json
  → Hook polls for .orra/agents/<id>.answer.json (100ms interval, 5min timeout)

Meanwhile:
  → Orchestrator sees pendingQuestion via orra_scan or orra_inspect
  → User says "allow" → orra_unblock writes .orra/agents/<id>.answer.json

  → Hook reads answer → responds to Claude Code → deletes answer file
```

### Safety

- **Timeout**: 5 minutes default. If no answer, hook denies. Prevents zombie hooks if orchestrator crashes.
- **Atomic write**: orra_unblock writes to temp file then renames, preventing hook from reading partial JSON.
- **Crash resilience**: Answer file persists on filesystem — survives MCP server restarts.

### Turn Complete Flow

```
Agent finishes a turn
  → Claude Code fires Stop hook
  → Hook updates status in .orra/agents/<id>.json (status: "idle", updatedAt: now)
```

### Hook Environment

Hooks receive via env vars (set in `.claude/settings.local.json`):
- `ORRA_AGENT_ID` — worktree ID
- `ORRA_STATE_DIR` — absolute path to `.orra/` in main repo

---

## Execution Phases

### Phase 1: Add New (no old code touched)

| Step | What | Details |
|------|------|---------|
| 1 | Add v2 types | New Zod schemas alongside existing. ScanResult, WorktreeStatus, Config, etc. Old types stay temporarily. |
| 2 | Config system | `src/core/config.ts` — read/write `.orra/config.json`. Defaults for markers, staleDays, worktreeDir, driftThreshold, defaultModel, defaultAgent. |
| 3 | Awareness engine | `src/core/awareness.ts` — scanAll(), inspectOne(), enrichWithGitHub(). Pure functions over git/filesystem/gh CLI output. |
| 4 | Rebase logic | Add rebase capability — fetch main, rebase branch, report conflicts, optionally restart agent. |

### Phase 2: Switch Hooks (critical migration)

| Step | What | Details |
|------|------|---------|
| 5 | File-based hooks | Rewrite `orra-hook.ts` — remove socket connection, write directly to `.orra/agents/<id>.json`, poll for answer file on permission requests. |
| 6 | Remove sockets | Delete `socket-server.ts`, `socket-client.ts`. Remove socket initialization from agent-manager. Delete `.orra/orra.sock`. |

### Phase 3: Remove Old, Wire New

| Step | What | Details |
|------|------|---------|
| 7 | Remove linker | Delete `linker.ts`. Remove link methods from agent-manager. Remove `links.json` persistence. Remove Link types. |
| 8 | Remove agent mode | Remove mode detection in `index.ts`. Delete `orra-agent.ts` and agent tools (register, unregister, heartbeat). Simplify `server.ts`. |
| 9 | Replace tool surface | Delete `orra.ts` router. Create 7 individual tool files. Register in `server.ts`. |
| 10 | Update state manager | Remove link persistence. Update agent state schema. Add config support. Clean up old types. |

### Phase 4: Polish

| Step | What | Details |
|------|------|---------|
| 11 | Orchestrator persona | Create `.claude/agents/orchestrator.md` template. Create `npx @orra/setup` script. |
| 12 | Update tests | New tests for awareness, config, classification, file-based hooks, rebase. Update existing. Delete socket/linker/agent-mode tests. |
| 13 | Update README + CLAUDE.md | Reflect new architecture. |

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Hook migration breaks active agents | High — agents become unresponsive | Integration test file-based flow thoroughly before removing socket code. Step 5 before step 6. |
| 132 existing tests break | Medium — false confidence | Delete tests alongside the code they test. Never leave broken tests. |
| `git worktree list` includes main repo | Low — wrong scan results | Filter by checking if path matches the main repo root. |
| `gh` CLI missing or unauthenticated | Low — degraded scan | Graceful fallback — scan works without PR data. |
| Race on answer file read/write | Medium — corrupt JSON | Atomic write (temp file + rename). |
| Agent state file conflicts (hook + MCP writing simultaneously) | Medium — data loss | Read-modify-write with atomic rename. Both hook and MCP read current state, update their fields, write to temp file, rename over original. Last writer wins but no partial writes. |

---

## Design Principles

1. **Claude is the decision engine.** MCP provides eyes and hands. No decision logic in the MCP.
2. **Read state, don't ask agents.** Awareness engine reads filesystem/git/GitHub. Never interrupts agents for status.
3. **Filesystem is the source of truth.** .orra/ state files, git state, file markers. No databases.
4. **Agents are just Claude Code sessions.** They don't know about the orchestrator. Hooks handle state reporting transparently.
5. **Minimal tool surface.** 7 tools, clearly split between awareness and action.
6. **Tests pass at every step.** No big-bang migration.
