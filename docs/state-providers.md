# State Providers

State providers let Orra pull worktree metadata from *external* sources — your own dashboard, a custom CLI, a JSON file — and merge it with the native git/GitHub scan. A provider is anything that returns a JSON document matching the `ProviderResult` schema.

The typical use case: you have a team dashboard that already tracks per-worktree context (pipeline stage, reviewer assignments, test results from your CI), and you want Orra's `orra_scan` to include that context without duplicating the scraping logic.

## The three provider types

| Type | Config | Use when |
|---|---|---|
| `http` | `{ type: "http", url, headers?, timeout? }` | Your dashboard exposes a long-running HTTP endpoint. |
| `file` | `{ type: "file", path }` | Another tool writes a JSON file that Orra should read. Path is resolved relative to the project root. |
| `command` | `{ type: "command", command: string[], cwd?, env?, timeout? }` | You want to exec a CLI and parse its stdout. |

## Configuring providers

Providers live in `.orra/config.json`:

```json
{
  "providers": [
    { "type": "http", "url": "http://localhost:3456/api/state" },
    { "type": "file", "path": ".orra/extra-state.json" }
  ],
  "providerCache": { "ttl": 5000 }
}
```

Orra fetches all providers in parallel on every `orra_scan`, respecting the cache TTL (default 5s). If a provider fails or times out, it's skipped — the native scan still runs, and failed providers show up in `result.providerStatus.failed`.

## The protocol — `ProviderResult`

```json
{
  "protocolVersion": "1.0",
  "worktrees": [
    {
      "id": "feat-auth",
      "path": "/abs/path/to/worktree",
      "branch": "feat/auth",
      "stage": { "name": "review", "metadata": { "score": 92 } },
      "flags": ["blocked"],
      "agent": {
        "status": "waiting",
        "pid": null
      },
      "pr": {
        "number": null,
        "state": "open",
        "reviews": "approved"
      }
    }
  ],
  "provider": {
    "name": "my-dashboard",
    "version": "1.0",
    "generatedAt": "2026-04-14T12:00:00Z"
  }
}
```

**Notes:**

- The envelope field is `protocolVersion`, **not** `orraProtocolVersion`. It is intentionally vendor-neutral so any dashboard can implement the protocol without knowing Orra exists.
- `worktrees[]` is a flat list. Each entry identifies a worktree by `id` (basename) or `path`.
- You only need to populate the fields your provider actually knows about. Leave the rest null or omit them — Orra will fall back to native scanning for missing fields.
- `provider` metadata identifies the implementation for debugging.

## How the merge works

Orra fetches all configured providers in parallel, caches results per-provider (default 5s TTL), and merges them with the native scan. Provider data **augments** native fields rather than replacing them wholesale:

- If a provider sets a worktree's `stage`, that wins over native pipeline-detection.
- If a provider sets `flags: ["blocked"]`, the worktree is classified as `needs_attention` regardless of what the native scan would say.
- Fields the provider doesn't set (or sets to `null`) fall through to native detection.

This means you can start with a provider that only populates `stage` and gradually enrich it as your dashboard learns more — no all-or-nothing commitment.

## Writing a provider for your own dashboard

1. **Pick an endpoint path.** Orra doesn't care: `/api/state`, `/worktrees`, `/.well-known/worktree-state`, whatever fits your service.
2. **Return JSON matching the `ProviderResult` schema** — `protocolVersion: "1.0"` at the root, `worktrees[]` as the payload.
3. **Populate only the fields you know about.** Your dashboard probably knows stage + reviewer assignments but not PR CI status; leave the rest empty.
4. **Identify yourself in `provider.name`** so it shows up in `result.providerStatus.used`.
5. **Keep it fast.** Orra's cache TTL defaults to 5s, but `orra_scan` runs on every user action — if your endpoint is slow, raise the cache TTL or move expensive work into a pre-computed file.

## Minimum viable provider

The smallest legal provider is a shell command that emits a JSON literal:

```json
{
  "type": "command",
  "command": ["bash", "-c", "echo '{\"protocolVersion\":\"1.0\",\"worktrees\":[]}'"]
}
```

This is a useful smoke test to confirm the provider pipeline works before you wire in your real data source.

## Version compatibility

Each provider config can specify `minProtocolVersion`:

```json
{ "type": "http", "url": "...", "minProtocolVersion": "1.1" }
```

Providers returning a protocol version older than the minimum are rejected with an `incompatible protocol version` error visible in `providerStatus.failed`. This lets you upgrade the protocol without breaking old integrations — just bump the minimum on the Orra side when you need new fields.

## Further reading

- Source: [`src/core/providers/`](../src/core/providers/) — the provider types, cache, and merge logic.
- [docs/architecture.md](architecture.md) — how providers fit into the awareness engine.
