# Session-Start Directive Auto-Run Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the orchestrator persona automatically fire the `morning-briefing` directive (and any future directive opting in) on the first session of a new logical day.

**Architecture:** This feature is executed by the LLM reading the persona — same pattern as the existing heartbeat protocol, which is purely prose in `orchestrator.md` with no TypeScript backing. Two files change: `morning-briefing.md` gains opt-in frontmatter, and `orchestrator.md` gains a new "Session-Start Directive Auto-Run" section describing the gate algorithm for the agent to follow.

**Tech Stack:** Markdown template files. No TypeScript changes. No tests (matches heartbeat protocol — persona behavior, verified end-to-end, not unit-tested).

**Spec:** `docs/superpowers/specs/2026-04-20-session-start-directive-auto-run-design.md`

**Deviation from spec:** The spec's "Files Touched" section listed `tests/` for unit tests of the gate algorithm. Dropped — the heartbeat protocol uses the same prose-in-persona approach with no unit tests, and adding a parallel TS helper just for test coverage would add code the runtime never executes. The gate math is small and fully specified in the persona prose.

---

## File Structure

**Modified:**

- `src/templates/directives/morning-briefing.md` — prepend YAML frontmatter declaring `session_start: auto`, `once_per: day`, `resets_at: "08:00"`. No body changes.
- `src/templates/orchestrator.md` — insert a new section "Session-Start Directive Auto-Run" between the existing "On Session Start" step 2 (read directives) and step 3 (scan worktrees). Renumber or restructure as needed.

**Unchanged:** everything else. No new files, no TS changes, no test changes.

---

### Task 1: Add opt-in frontmatter to morning-briefing directive

**Files:**
- Modify: `src/templates/directives/morning-briefing.md` (prepend frontmatter; file currently has no frontmatter and starts with `## Morning Briefing`)

- [ ] **Step 1: Prepend YAML frontmatter to the directive**

Insert these exact 6 lines at the very top of `src/templates/directives/morning-briefing.md`, before the existing `## Morning Briefing` heading:

```yaml
---
session_start: auto
once_per: day
resets_at: "08:00"
---
```

There should be a blank line between the closing `---` and the `## Morning Briefing` heading.

- [ ] **Step 2: Verify the file is well-formed**

Run: `head -10 src/templates/directives/morning-briefing.md`
Expected output: the 4 frontmatter fence/body lines above, a blank line, then `## Morning Briefing`, then the original content.

- [ ] **Step 3: Verify tests still pass (no regressions)**

Run: `npm test`
Expected: all 322 tests pass, identical to baseline. Frontmatter is read only by the orchestrator persona at runtime; nothing in the TS codebase parses directive frontmatter today.

- [ ] **Step 4: Commit**

```bash
git add src/templates/directives/morning-briefing.md
git commit -m "feat(morning-briefing): opt into session_start auto-run"
```

---

### Task 2: Add Session-Start Directive Auto-Run section to orchestrator

**Files:**
- Modify: `src/templates/orchestrator.md` — insert the new section between the current step 2 (read directives) and step 3 (scan worktrees) of "On Session Start"

- [ ] **Step 1: Read the current orchestrator.md to confirm insertion point**

Run: `sed -n '18,32p' src/templates/orchestrator.md`
Expected: shows the "## On Session Start" heading, step 1 (reset heartbeat), step 2 (read directives), step 3 (scan worktrees).

- [ ] **Step 2: Edit orchestrator.md — update the read-directives step and insert a new section**

Make two edits to `src/templates/orchestrator.md`:

**Edit A — update the "read directives" step** so the agent also parses frontmatter (old text on the left, new on the right; the critical change is the added sentence about frontmatter):

Old:
```
2. **Read directives**: Check if `.orra/directives/` exists. If it does, read every `.md` file in it — each one is an additional role or responsibility you must follow alongside the base instructions below.
```

New:
```
2. **Read directives**: Check if `.orra/directives/` exists. If it does, read every `.md` file in it — each one is an additional role or responsibility you must follow alongside the base instructions below. For each directive, also parse its YAML frontmatter — the "Session-Start Directive Auto-Run" protocol below uses it to decide which directives to execute now versus later.
```

**Edit B — insert a new top-level section** immediately after the existing "## On Session Start" section ends (before the "## Pre-Inspection Summary Fields" section begins). Paste this verbatim:

```markdown
## Session-Start Directive Auto-Run

Some directives opt into automatic execution on session start via their frontmatter. Process them before continuing with the rest of the session (including the worktree scan in "On Session Start" step 3).

### When a directive opts in

A directive opts in when its YAML frontmatter contains:

```yaml
session_start: auto
once_per: day
resets_at: "08:00"
```

- `session_start: auto` — the opt-in flag. If absent or set to anything other than `auto`, skip the directive in this protocol (it still gets read as part of step 2, as normal).
- `once_per: day` — the only supported granularity in v1. Treat other values as if the frontmatter was absent.
- `resets_at: "HH:MM"` — local-time boundary. Required when `once_per: day`; if missing or unparseable, skip the directive and do nothing (do not fire, do not error).

### The gate algorithm

For each opt-in directive, in alphabetical filename order:

1. Read `.orra/heartbeat-state.json`. The session-start ledger lives under the top-level key `session_start`, keyed by directive name: `session_start["<name>"].last_ran_at`. If the file does not exist, or the key is absent, treat `last_ran_at` as `null`.
2. Compute `boundary`: today's date at `resets_at` in the system's local timezone. If the current time is before `boundary`, subtract one day from it.
3. Decide:
   - If `last_ran_at` is `null`, **fire**.
   - Else if `last_ran_at < boundary`, **fire**.
   - Else, **skip** (do not read the directive's body for execution, do not mention it).

Worked examples with `resets_at: "08:00"`:

| Now (local)  | last_ran_at    | Boundary     | Decision |
|--------------|----------------|--------------|----------|
| 09:00 Mon    | null           | 08:00 Mon    | fire     |
| 09:00 Mon    | 23:50 Sun      | 08:00 Mon    | fire     |
| 11:00 Mon    | 09:00 Mon      | 08:00 Mon    | skip     |
| 00:05 Tue    | 23:50 Mon      | 08:00 Mon    | skip     |
| 09:00 Tue    | 23:50 Mon      | 08:00 Tue    | fire     |

### Firing a directive

When the gate says fire:

1. Execute the directive's "On Session Start" section inline, in this same turn, following its instructions exactly.
2. Set `session_start["<name>"].last_ran_at = <now in ISO 8601 with offset>` in the in-memory state.

### Persisting state

After all opt-in directives have been processed (fired or skipped), write the updated state back to `.orra/heartbeat-state.json`. Preserve any other top-level keys (`armed_at`, `last_user_activity_at`, `directives`, etc.) unchanged. If the file did not exist, create it; the `session_start` block may be the only populated top-level key in that case.

### Interaction with "On Session Start" step 3

`morning-briefing`'s "On Session Start" section calls `orra_scan` as its first action. If `morning-briefing` fires via this protocol, it has already scanned — do not scan again in "On Session Start" step 3. If no opt-in directive fired (or if the ones that fired did not call `orra_scan`), proceed with step 3 as normal.

### Error handling

- Malformed frontmatter on one directive → skip that directive, continue with the rest. Do not abort session start.
- The directive's "On Session Start" body throws or a tool call inside it fails → emit a single line `⚠️ <directive-name> session-start failed: <short reason>` and continue. Do **not** update `last_ran_at` for that directive — the next session will retry.
- `.orra/heartbeat-state.json` is missing or unparseable → treat all directives as "never run" and rebuild the file fresh when persisting.
```

- [ ] **Step 3: Verify the edits produced the expected structure**

Run: `grep -n "^## " src/templates/orchestrator.md`
Expected: the section list now includes `## Session-Start Directive Auto-Run` inserted between `## On Session Start` and `## Pre-Inspection Summary Fields`.

- [ ] **Step 4: Verify tests still pass (no regressions)**

Run: `npm test`
Expected: all 322 tests pass. The orchestrator template is shipped as-is to users; there is no TS parsing of it, so template edits cannot break unit or integration tests.

- [ ] **Step 5: Commit**

```bash
git add src/templates/orchestrator.md
git commit -m "feat(orchestrator): add session-start directive auto-run protocol"
```

---

### Task 3: Manual end-to-end verification

This is the primary verification for the feature — unit tests cannot exercise LLM-driven persona behavior.

**Files:**
- None modified.

- [ ] **Step 1: Build and link the package locally**

Run: `npm run build`
Expected: clean build, no TypeScript errors.

- [ ] **Step 2: In a project with Orra set up and `morning-briefing` installed, confirm the template install picks up the new frontmatter**

If you have a test project with `.orra/directives/morning-briefing.md` from a previous `orra_directive` install, re-install it so the frontmatter is included:

Run (from inside the test project): invoke `orra_directive` with `action: "install"` and `name: "morning-briefing"` through the orchestrator. Alternatively delete `.orra/directives/morning-briefing.md` and re-install.

Check the installed file:
Run: `head -6 .orra/directives/morning-briefing.md`
Expected: the YAML frontmatter is present.

- [ ] **Step 3: Run the orchestrator and confirm auto-fire**

In the test project, delete any existing `.orra/heartbeat-state.json` so the gate treats `last_ran_at` as null:

Run: `rm -f .orra/heartbeat-state.json`

Then launch: `claude --agent orchestrator`

Expected: the agent produces the morning briefing output automatically, without being prompted. `.orra/heartbeat-state.json` now contains a `session_start.morning-briefing.last_ran_at` timestamp.

- [ ] **Step 4: Confirm same-day re-run skips**

Exit and immediately re-launch: `claude --agent orchestrator`

Expected: no morning briefing output. The agent proceeds to the worktree scan (step 3) normally.

- [ ] **Step 5: Confirm cross-boundary re-run fires**

Manually edit `.orra/heartbeat-state.json` to set `session_start.morning-briefing.last_ran_at` to a timestamp that is before the most recent 08:00 boundary (e.g., `2025-01-01T00:00:00-08:00`).

Re-launch: `claude --agent orchestrator`

Expected: morning briefing fires again; `last_ran_at` is updated to the current time.

- [ ] **Step 6: No commit needed — verification only**

---

## Self-Review

**Spec coverage:** each requirement in `2026-04-20-session-start-directive-auto-run-design.md` has a corresponding task step:

- Directive frontmatter shape → Task 1 Step 1.
- Gate algorithm with the worked-examples table → Task 2 Edit B (verbatim copy of the spec's table).
- State extension to `heartbeat-state.json` under `session_start` key → Task 2 Edit B persistence section.
- Orchestrator persona changes (new section between steps 2 and 3) → Task 2 Edits A and B.
- Interaction with step 3 (skip redundant scan) → Task 2 Edit B "Interaction with …" subsection.
- Error handling (malformed frontmatter, directive throws, missing state file) → Task 2 Edit B "Error handling" subsection.
- Backwards compat (no breaking changes) → Tasks 1 & 2 Step 3 both re-run `npm test` to confirm.
- Success criteria #1–#4 → Task 3 Steps 3–5.
- Success criteria #5 (independent firing for a second opt-in directive) → implicitly covered by the per-directive algorithm description; not explicitly tested in Task 3 because no second directive exists yet.

**Placeholders:** none. All edits show exact text to insert.

**Type consistency:** no types involved — all markdown.

**Deviations from spec (documented):** the "Files Touched" `tests/` entry is not implemented. Rationale above.
