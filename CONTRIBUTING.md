# Contributing to Orra MCP

Thanks for your interest. Orra is MIT-licensed, and contributions — bug reports, feature requests, PRs, new directives — are welcome.

## Dev setup

```bash
git clone https://github.com/bjornj12/Orra-mcp.git
cd Orra-mcp
npm install
npm run build
npm test
```

Requires **Node 20+** and a working git installation. No database or external services.

## Running tests

```bash
npm test              # run the full suite once
npm run test:watch    # watch mode
npm run build         # tsc compile + copy templates (used by CI)
```

The test suite creates real temporary git worktrees and runs real `git` commands — it does not mock the filesystem or git. This catches edge cases that mock-based tests would miss, but it also means tests need `git` on your `PATH`.

## Project structure

See [docs/architecture.md](docs/architecture.md) for the full source layout. In short:

- `src/core/` — awareness, state, agent management, providers, spawn defaults
- `src/tools/` — one file per MCP tool handler (9 tools)
- `src/bin/` — hook script + standalone setup CLI
- `src/templates/` — orchestrator persona, shipped directives, memory skeleton
- `tests/unit/` + `tests/integration/` — vitest

## Filing issues

Use the issue templates. For bugs, please include:

- Repro steps
- Expected vs actual behavior
- Your Node version (`node --version`), OS, and Orra version (`npm list orra-mcp` or the tag/commit you installed from)
- Relevant output from `.orra/agents/<id>.log` if the bug involves a spawned agent (redact secrets first)

For feature requests, describe the *problem* before the proposed solution — we'd rather solve the underlying issue than ship a specific API.

## Submitting PRs

Before opening a PR:

- [ ] `npm test` passes
- [ ] `npm run build` passes
- [ ] No unrelated refactors — keep the PR focused on one thing
- [ ] Match existing patterns (look at neighbor files before inventing new structure)
- [ ] Update `CHANGELOG.md` under `## [Unreleased]` if your change is user-visible

PRs are reviewed in-tree — `CLAUDE.md` at the repo root has the instructions that set `bjornj12` as the reviewer. When in doubt, ask in the PR description and we'll figure it out.

## Adding a new MCP tool

1. Create `src/tools/orra-<name>.ts` exporting:
   - A Zod schema: `export const orra<Name>Schema = z.object({ ... })`
   - A handler: `export async function handleOrra<Name>(projectRoot: string, args: ...) { ... }`
2. Register it in `src/server.ts` alongside the other tools.
3. Add unit tests under `tests/unit/tools/orra-<name>.test.ts`.
4. Update `docs/architecture.md` if you're introducing a new subsystem (not needed for simple tools).
5. Update the tool table in `README.md` and the tool list in `CLAUDE.template.md`.

## Adding a new directive

Directives are markdown files under `src/templates/directives/`. To contribute one:

1. Write the directive file following the format described in [docs/directives.md](docs/directives.md).
2. Include a clear `### My Lane` section so it composes cleanly with existing directives.
3. If it reads or writes memory files, document that in `### Dependencies`.
4. Add it to the shipped directive table in `docs/directives.md` and the CHANGELOG.

## Code style

- **TypeScript, strict mode.** No implicit any, no `@ts-ignore` without a comment explaining why.
- **Comments are rare.** Don't explain *what* code does — the code does that. Only comment *why* when the reason is non-obvious (a workaround, a subtle invariant, a deliberate trade-off).
- **Small files.** If a file is growing past ~300 lines and doing more than one thing, consider splitting it.
- **DRY, YAGNI, TDD.** Especially YAGNI — don't add features or abstractions that aren't needed yet.

## License

By contributing, you agree that your contributions will be licensed under the same MIT license that covers the project.
