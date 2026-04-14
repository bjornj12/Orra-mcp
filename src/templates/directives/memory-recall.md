## Memory Recall

Lets the user ask free-form questions about their past work and answer from `.orra/memory/`. Pairs naturally with `morning-briefing` and `shutdown-ritual` — those directives populate the memory layer; this one mines it.

### When to Act

Watch for questions that are about *the past* rather than the present scan. Examples:

- "When did I start the auth refactor?"
- "What was the decision on token TTL?"
- "Which worktrees touched billing last month?"
- "What was I working on Tuesday?"
- "Have I dealt with the migration question @alice asked about?"
- "What were my loose ends from yesterday?"
- "Show me the retro from last week"

These are recall questions. Don't try to answer from your own session memory — read the actual files.

### Where to Look

The memory layer lives at `.orra/memory/` with this layout:

```
.orra/memory/
├── index.md              — landing note with current pointers
├── daily/<YYYY-MM-DD>.md — one per day, written by shutdown-ritual
├── worktrees/<id>.md     — per-worktree running context
├── retros/<YYYY-Www>.md  — weekly rollups (when Personal Retro is enabled)
└── commitments.md        — Linear deadlines + ad-hoc promises
```

All files are markdown with YAML frontmatter. Use the Read or Grep tool to walk them.

### How to Answer

1. **Pick the right file(s).** Match the question to the most likely source:
   - Date-anchored question ("Tuesday", "yesterday", "last week") → `daily/`
   - Worktree-anchored ("the auth refactor", "billing-fix-c3d4") → `worktrees/<id>.md`, then `daily/` for context
   - Decision/rationale question ("why did we pick X") → grep `daily/` and `worktrees/` for the topic
   - Deadline/promise question ("what did I commit to") → `commitments.md`
   - Pattern question ("what have I been doing this month") → `retros/` if any exist, else aggregate `daily/`

2. **Read the file(s) directly.** Do NOT use `orra_inspect` or `orra_scan` for this — those are about *current* state. Recall is about *historical* state.

3. **Quote the relevant section verbatim.** When answering, cite the file path and the line/section so the user can verify and click through. Example:
   > "From `.orra/memory/daily/2026-04-13.md` under 'Tomorrow's first move': *Pick back up on the JWT refresh — test is failing at token expiry edge case.*"

4. **If the answer isn't in memory, say so.** Don't guess and don't fabricate. Possible responses:
   - "The memory layer doesn't have anything from that date — looks like no shutdown note was written."
   - "I searched `daily/` and `worktrees/` for 'token TTL' and found no mention. Want me to check git log or the PR history instead?"
   - "Your memory layer only has 3 daily notes so far. Once you have a couple weeks of history, I'll be able to answer this kind of question reliably."

5. **Keep answers tight.** Memory recall should feel like asking a coworker who took good notes — concise, cited, no padding.

### What NOT to Do

- **Don't** invent decisions or events that aren't in the files. If memory is silent, say so.
- **Don't** read every file in `daily/` for every question. Use Grep to find candidates first, then Read the matches.
- **Don't** confuse the memory layer with the *current* worktree state. `orra_scan` is for "what's happening now"; memory is for "what happened then."
- **Don't** rewrite memory files in response to questions. This directive is read-only. Editing notes is the job of `shutdown-ritual` and `morning-briefing`.

### When Memory Is Empty

If the user asks a recall question and the memory layer is empty (no daily notes yet), be honest:

> "Your `.orra/memory/` is empty — nothing's been recorded yet. Start running the `shutdown-ritual` directive at the end of your sessions to populate the daily notes; I'll be able to answer questions like this within a few days."

This is the on-ramp message. Don't apologize beyond it.

### Pairs With

- **shutdown-ritual** — populates the daily notes this directive reads
- **morning-briefing** — also reads daily notes; complementary
- **linear-deadline-tracker** — owns `commitments.md`

### Dependencies

- `.orra/memory/` (created by `orra_setup`)
- A few days of accumulated daily notes for meaningful answers (the directive works on day 1 but only becomes useful around day 5–7)
