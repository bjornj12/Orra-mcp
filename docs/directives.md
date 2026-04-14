# Directives

A **directive** is a plain markdown file in `.orra/directives/` that the orchestrator reads at session start and follows as a standing instruction. Think of it as a *standing order* — behavior Claude should apply automatically without being asked each session.

Directives are how you teach Orra your specific workflow. The shipped set gives you a sensible default; writing your own is how you make Orra yours.

## The 10 shipped directives

| Directive | When it fires | What it does |
|---|---|---|
| `morning-briefing` | Session start | Composes a 60-second picture from `orra_scan` + yesterday's daily note + `commitments.md`. Recommends a first action. |
| `shutdown-ritual` | End of session | Writes today's daily note's "What shipped / Still open / Tomorrow's first move" sections. |
| `memory-recall` | On-demand | Answers historical questions by searching `.orra/memory/`. |
| `linear-tasks` | Session start + every 10 min | Surfaces your open Linear tickets so you don't have to context-switch. |
| `linear-deadline-tracker` | Session start + every 10 min | Keeps `commitments.md` in sync with Linear ticket due dates. |
| `pr-shepherd` | Ongoing | Watches PR state changes during the session (approvals, CI flips, review comments). |
| `stale-cleanup` | After morning briefing | Proposes cleanup of merged-and-orphaned worktrees. |
| `monitor-agents` | Event-driven | Reacts to agent state file changes (permission requests, completions). |
| `auto-remediator` | Ongoing | Spots remediation candidates in `orra_scan` and auto-spawns headless agents within a safety allowlist. |
| `wait-time-recycler` | When agents are blocked | Suggests gap-sized tasks during waits. |

## Installing the shipped set

The easiest starting point is to install everything:

```
"install all orra directives"
```

This invokes `orra_directive` with `action: "install-all"`, copying each shipped directive into `.orra/directives/`. Existing directives are skipped so your customizations are preserved.

If you want a subset:

```
"install the morning-briefing directive"
"install the pr-shepherd directive"
```

See what's currently active:

```
"list orra directives"
```

## Writing your own directive

### The format

A directive is plain markdown. No YAML frontmatter, no template engine — just prose that Claude reads and follows. Structure:

- **Start with `## Directive Title`** (H2 — not H1, so the title shows up as a section when Claude loads the directive into context).
- **Write free-form sections** describing when the directive fires, what to check, what to present, and how to act.
- **Optionally add `### My Lane`** declaring which concerns you own, so you compose cleanly with other directives.
- **Optionally add `### Dependencies`** listing the MCP tools or files you rely on.

### Example skeleton

```markdown
## CI Guard

When I see any worktree with `summary.testResult === "failing"`, surface
it immediately and offer to investigate.

### On Session Start

Run `orra_scan`. For each worktree whose `summary.testResult` is
`"failing"`, print a one-line alert with the worktree id and the
last failing test name from `summary.tailLines`.

### During the Session

When `monitor-agents` fires a completion event with a non-zero exit
code, re-run `orra_inspect` on the worktree and summarize the failing
test output.

### My Lane

I own "test failure visibility." Other directives (pr-shepherd,
auto-remediator) do not need to surface failing tests — they can
assume I handle it.

### Dependencies

- orra_scan (always available)
- orra_inspect (always available)
- Agent summaries from the pre-inspection cache
```

### Two ways to create one

**a) Live via `orra_directive add`** — creates the file *and* applies it to the current session immediately. Use when you're iterating:

```
"add a directive called ci-guard that flags failing tests at session start"
```

Claude will compose the content and call `orra_directive` with `action: "add"`, `name: "ci-guard"`, and `content` as the markdown. The file lands at `.orra/directives/ci-guard.md` and the instruction takes effect in the current session — no restart needed.

**b) Drop a file manually** — create `.orra/directives/<name>.md` in your editor and restart the session. The orchestrator picks it up on startup. Use this when you want to write with your own tooling, or when you're porting a directive from another project.

### Fastest starting point: copy a shipped directive

The single fastest way to write your first directive is to install a shipped one and edit it:

```
"install the pr-shepherd directive"
```

Open `.orra/directives/pr-shepherd.md`, strip what you don't need, rename the file, and you're done. The shipped directives demonstrate every pattern you might want: session-start composition (`morning-briefing`), on-demand recall (`memory-recall`), event-driven reaction (`monitor-agents`), autonomous action (`auto-remediator`), memory writes (`shutdown-ritual`), and lane declarations (all of them).

### Removing a directive

```
"remove the ci-guard directive"
```

This deletes `.orra/directives/ci-guard.md`. You'll need to restart the session for the change to take full effect (removed directives are gone immediately from disk, but still live in the current session's context until you reload).

## The "lane" concept

Directives are designed to *coexist*. When multiple directives might react to the same event — say, a PR getting approved during the day — each declares a "lane," a concern it owns, so they don't trip over each other.

For example:
- `morning-briefing` owns **session-start surfacing**. Every worktree status, PR state, and commitment that's true when you open your session gets reported by `morning-briefing`, and only by `morning-briefing`.
- `pr-shepherd` owns **PR state changes during the session** (approval, CI flip, new review comment). It defers to `morning-briefing` for anything already true at session start.
- `auto-remediator` owns **autonomous background maintenance**. It's the only directive that may spawn headless agents without asking.
- `monitor-agents` owns **event-driven reactions to agent state file changes** (permission prompts, completions). Other directives check `orra_scan` on their own cadence; only `monitor-agents` reacts to filesystem events.

When you write your own directive, include a `### My Lane` section describing what you own. This is optional for the smallest directives, but strongly recommended if your directive overlaps with any shipped one — it prevents double-reporting and gives Claude a clear picture of who's responsible for what.

## Dependencies between directives

Some directives depend on others. For example, `morning-briefing` will check whether `linear-tasks` is enabled and, if so, wait for its initial fetch before composing the picture. This is documented in each directive's `### Dependencies` section.

If you remove a directive, read the remaining directives' `Dependencies` sections to make sure nothing breaks silently.

## Further reading

- The shipped directive source lives in [`src/templates/directives/`](../src/templates/directives/). Each file is a working example of the format in action.
- See [docs/memory-layer.md](memory-layer.md) for how directives interact with the memory layer.
- See [docs/headless-spawning.md](headless-spawning.md) for how `auto-remediator` uses `orra_spawn` safely.
