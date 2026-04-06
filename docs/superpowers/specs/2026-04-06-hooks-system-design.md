# Hooks System — Design Spec

## Overview

Automatic detection of when agents need input, using Claude Code's hook system. Two hooks — `PermissionRequest` (blocks until orchestrator answers) and `Stop` (notifies orchestrator that agent finished a turn) — allow the orchestrator to see all agent questions and respond from one terminal without polling.

## Architecture

```
Claude Code Agent (spawned or external, in worktree)
  │
  ├── PermissionRequest hook ──→ orra-hook.js ──→ .orra/orra.sock
  │     "Allow Bash?"               connects, sends question,
  │                                  BLOCKS until answer,
  │                                  returns allow/deny
  │
  └── Stop hook ───────────────→ orra-hook.js ──→ .orra/orra.sock
        "Turn finished"              connects, sends turn_complete,
                                     exits immediately
```

A single script (`bin/orra-hook.js`) handles both events. It connects to the orchestrator's Unix socket, sends a message, and either blocks (permission) or exits (stop).

## Socket Protocol Additions

### Agent Hook → Orchestrator

**question:** Sent by `PermissionRequest` hook. The hook's socket connection stays open until the orchestrator answers.

```json
{
  "type": "question",
  "agentId": "lisa-a1b2",
  "tool": "Bash",
  "input": {"command": "npm install"}
}
```

**turn_complete:** Sent by `Stop` hook. Fire-and-forget, socket closes immediately after.

```json
{
  "type": "turn_complete",
  "agentId": "lisa-a1b2"
}
```

### Orchestrator → Hook

**answer:** Sent to the hook's socket connection in response to a `question`. The hook reads this and returns the decision to Claude Code.

```json
{"type": "answer", "allow": true}
{"type": "answer", "allow": false, "reason": "Don't install packages without review"}
```

## Agent Status Values

Updated enum:

| Status | Meaning |
|--------|---------|
| `running` | Actively working |
| `idle` | Finished a turn, may need input (Stop hook fired) |
| `waiting` | Blocked on a permission question (PermissionRequest hook fired) |
| `completed` | Exited successfully |
| `failed` | Exited with error |
| `interrupted` | Disconnected unexpectedly |
| `killed` | Stopped by orchestrator |

## Orchestrator Behavior

### On `question` message

1. Update agent status to `"waiting"`
2. Store pending question in memory: `Map<agentId, { question, hookSocket }>`
3. `orra_list` shows: `⏳ waiting — "Allow Bash: npm install?"`

### On `turn_complete` message

1. Read new log content since last offset for this agent
2. Update agent status to `"idle"`
3. Extract last 3 non-empty lines as preview
4. `orra_list` shows: `💬 idle — "Which approach? A) ... B) ..."`

### On `orra_message` to a waiting/idle agent

If agent status is `"waiting"` (pending permission question):
- Parse message: "yes"/"allow"/"y" → `{"type": "answer", "allow": true}`
- Parse message: "no"/"deny"/"n" → `{"type": "answer", "allow": false, "reason": "<message>"}`
- Send answer to the hook's stored socket connection
- Hook receives answer, returns decision to Claude Code, disconnects
- Agent status → `"running"`

If agent status is `"idle"` (finished a turn, needs follow-up input):
- Spawned agent: write message to PTY stdin
- External agent: send message via registration socket
- Agent status → `"running"`

If agent status is `"running"` (already working, just a side message):
- Same as current behavior (PTY stdin or registration socket)

## Log Offset Tracking

Per-agent read offset tracked in AgentManager memory:

```typescript
private logOffsets: Map<string, number> = new Map();
```

On `turn_complete`:
1. `fs.stat` the log file to get current size
2. Read from `lastOffset` to `fileSize` (only the new bytes)
3. Extract last 3 non-empty lines as preview, store in agent metadata
4. Update `lastOffset = fileSize`

This avoids re-reading the entire log on every turn. First turn reads from 0, subsequent turns read only the delta.

`orra_list` shows the preview (last 3 lines of latest turn).
`orra_status` shows the full delta since last turn.
`orra_output` shows the complete log (unchanged behavior).

## Hook Script: `bin/orra-hook.js`

Single Node.js script shipped with the package. Reads hook event data from stdin, determines agent ID, connects to orchestrator socket, and handles the event.

### Agent ID Resolution

The hook needs to know which agent it belongs to. Resolution order:

1. `$ORRA_AGENT_ID` environment variable (set by `orra_spawn` when launching the agent)
2. `.orra/agents/self.id` file (written by `orra_register` on the agent side)
3. If neither found → `exit 1` (not an Orra agent, let normal Claude Code behavior proceed)

### PermissionRequest Handler

1. Read JSON from stdin (tool name, tool input, permission info)
2. Resolve agent ID
3. Connect to `.orra/orra.sock`
4. Send `question` message with agent ID, tool name, and tool input
5. Wait for `answer` message (blocks, up to 5 minute timeout)
6. If `allow: true` → print `{"hookSpecificOutput": {"hookEventName": "PermissionRequest", "decision": {"behavior": "allow"}}}` to stdout, exit 0
7. If `allow: false` → print reason to stderr, exit 2 (blocks the tool)
8. On timeout or socket error → exit 1 (fall back to normal prompt)

### Stop Handler

1. Read JSON from stdin
2. Resolve agent ID
3. Connect to `.orra/orra.sock`
4. Send `turn_complete` message with agent ID
5. Close socket, exit 0

## Hook Installation

### For spawned agents (`orra_spawn`)

Before spawning the claude process, `orra_spawn` writes `.claude/settings.json` in the worktree:

```json
{
  "hooks": {
    "PermissionRequest": [
      {
        "matcher": "",
        "hooks": [{
          "type": "command",
          "command": "node <absolute-path-to-orra-mcp>/dist/bin/orra-hook.js",
          "timeout": 300
        }]
      }
    ],
    "Stop": [
      {
        "matcher": "",
        "hooks": [{
          "type": "command",
          "command": "node <absolute-path-to-orra-mcp>/dist/bin/orra-hook.js",
          "timeout": 5
        }]
      }
    ]
  }
}
```

The `<absolute-path-to-orra-mcp>` is resolved from the MCP server's own `__dirname` at runtime.

`orra_spawn` also sets `ORRA_AGENT_ID=<agentId>` in the spawned process environment so the hook can identify itself.

### For external agents

Users add the hooks to their project's `.claude/settings.json` (or their sandbox script writes it). The hook resolves the agent ID from `.orra/agents/self.id`, which is written by `orra_register`.

## Project Structure Changes

```
bin/
└── orra-hook.js            — NEW: Hook script for PermissionRequest + Stop

src/
├── core/
│   ├── agent-manager.ts    — Add: question handling, turn_complete handling,
│   │                         log offset tracking, pending questions map
│   ├── socket-server.ts    — Add: question/turn_complete/answer message handling
│   └── ...
├── tools/
│   ├── spawn-agent.ts      — Add: write .claude/settings.json with hooks,
│   │                         set ORRA_AGENT_ID env var
│   └── ...
└── types.ts                — Add: question, turn_complete, answer message types,
                              "idle" and "waiting" status values
```

## Error Handling

- **Hook can't connect to socket:** Exit 1 — Claude Code falls back to normal prompt (agent not managed by Orra, or orchestrator is down).
- **Hook timeout on permission answer (5 min):** Exit 1 — falls back to normal prompt. The pending question is cleaned up on the orchestrator side.
- **Multiple permission requests from same agent:** Queue them. Only one `question` is active at a time per agent. If a second arrives while first is pending, it waits.
- **Orchestrator restarts while hook is blocking:** Hook detects socket close, exits 1, falls back to normal prompt.
- **`orra_message` to wrong status:** If agent is `waiting` but you send a conversational message instead of yes/no, treat it as a denial with the message as the reason.

## Out of Scope

- Automatic approval rules (always allow Read, always deny rm -rf) — v2 feature
- Hook installation for external agents via `orra_register` (manual for now)
- Parsing `AskUserQuestion` tool calls (these go through the normal turn → Stop hook path)
