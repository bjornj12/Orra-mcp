# Memory Layer

Orra's directive pack writes to a markdown-based memory layer at `.orra/memory/`. It's where Orra "remembers" your day: what you focused on, what shipped, what's still open, what you committed to, and where you left off. No database, no external service — just plain markdown files that are yours to read, edit, or version-control as you see fit.

## Directory layout

```
.orra/memory/
├── index.md              — landing note, auto-updated at session start
├── daily/                — one file per day, written by shutdown-ritual
│   └── 2026-04-13.md
├── worktrees/            — per-worktree notes, survive worktree deletion
│   └── auth-refactor.md
├── retros/               — weekly rollups (when Personal Retro directive is enabled)
└── commitments.md        — Linear deadlines + ad-hoc promises
```

## Who writes what

The memory layer is not magic — specific directives own specific files. This table describes the default directive pack; if you swap in your own directives, the contract is whatever you write.

| File / directory | Written by | Read by |
|---|---|---|
| `daily/<yesterday>.md` | `shutdown-ritual` (at end of previous session) | `morning-briefing` (next session start) |
| `daily/<today>.md` | `morning-briefing` (creates skeleton), `shutdown-ritual` (fills it in) | `morning-briefing`, `memory-recall` |
| `commitments.md` | `linear-deadline-tracker` | `morning-briefing`, `memory-recall` |
| `worktrees/<id>.md` | `shutdown-ritual`, `memory-recall` | `morning-briefing`, any directive that needs historical context for a worktree |
| `index.md` | `morning-briefing` | the user (and any directive landing here for quick orientation) |
| `retros/` | `personal-retro` (if installed — not in the default pack) | you |

## File format

Every memory file is plain markdown with YAML frontmatter. The frontmatter keys are lightweight — just enough for `memory-recall` to filter by date, type, and tags.

```markdown
---
date: 2026-04-14
type: daily
tags: [daily]
---

# 2026-04-14

## Today's focus

Ship JWT refresh by 4pm.

## What shipped

- JWT refresh merged to main (PR #412)

## Still open

- AUTH-142 review feedback (parked, tomorrow)

## Tomorrow's first move

Address the review comments on AUTH-142.
```

Wikilinks (`[[worktrees/auth-refactor]]`) are used throughout so any markdown vault tool can cross-link notes.

## Using Obsidian (or any markdown vault tool)

Memory files use YAML frontmatter, `[[wikilinks]]`, and ISO date filenames so Obsidian, Logseq, Foam, or plain `grep` all read them the same way. No plugin required.

**Setup with Obsidian:**

1. In Obsidian, "Open folder as vault" → select `.orra/memory/`.
2. Settings → Core plugins → Daily notes → folder: `daily`, format: `YYYY-MM-DD`.
3. Settings → Files and Links → New link format: `Shortest path when possible`.

You now get backlinks, graph view, search, and daily notes for free.

Non-Obsidian users: the same files work with Logseq, Foam, or plain `grep` / `rg` / Claude-reading-files. Nothing is Obsidian-specific.

## Secrets warning

Your daily notes will contain session context — task descriptions, decisions, sometimes code snippets. Before enabling Obsidian Sync, iCloud, Dropbox, or any cloud sync on this vault, make sure you're comfortable with that content leaving your machine.

**Recommended: use a local-only vault for `.orra/memory/`.** If you want some of your memory synced (e.g. a "public" retros folder), make that a separate vault you opt into explicitly.

`.orra/` is added to your `.gitignore` by `orra_setup` for the same reason — so your memory layer doesn't accidentally end up in a shared repo.

## Querying the memory layer

The `memory-recall` directive (part of the default pack) answers historical questions by searching these files. You can also query them yourself:

```bash
# What did I do last Tuesday?
cat .orra/memory/daily/2026-04-08.md

# Everything I've written about the auth refactor
grep -r "auth-refactor" .orra/memory/

# Open commitments
cat .orra/memory/commitments.md
```

Or ask Claude: *"what was I working on last week?"* and `memory-recall` will read the relevant files and summarize.
