# Security Policy

## Supported versions

Orra is pre-1.0. Only the latest published version on npm receives security fixes.

| Version | Supported |
|---|---|
| latest (`0.x`) | ✅ |
| older `0.x` | ❌ |

## Reporting a vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Email **bjorn.olafur@gmail.com** with:

- A description of the vulnerability and the impact you believe it has
- Steps to reproduce (a minimal test case if possible)
- The version of Orra you tested against (`npm list orra-mcp` or commit hash)
- Your assessment of severity, if you have one

You should expect an acknowledgement within **72 hours**. If the report is valid, I will work with you on a fix and a coordinated disclosure timeline (typically 30–90 days depending on severity).

## Scope

In scope:

- The MCP server itself (`src/`)
- The headless agent spawn path (`orra_spawn`, `--allowed-tools` allowlist defaults)
- Hook scripts installed by `orra_register` and `orra_setup`
- Path-handling and worktree-id validation

Out of scope:

- Vulnerabilities in upstream dependencies — please report those to the relevant project. If a transitive dep affects Orra and an upgrade is blocked, that *is* in scope.
- Issues that require an attacker to already have local code execution as the user
- Anything in `node_modules` or `dist/` (those are build outputs)

## Hardening defaults

Some defaults are deliberately conservative because Orra spawns subprocesses on the user's machine:

- `orra_spawn` runs `claude --print` with a locked-down `--allowed-tools` allowlist (no `rm`, no network, no shell escapes by default).
- Worktree IDs are validated against a strict character set before being used in paths.
- Hooks are installed as plain shell scripts under the project's `.claude/` — review them before granting permissions in your MCP client.

If you find a way around any of these, that's a security report, not a feature request.
