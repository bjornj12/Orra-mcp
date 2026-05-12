---
description: "Start or attach the Orra standing orchestrator background agent"
---

Run the `orra` launcher to ensure the orchestrator is running as a persistent background agent.

Execute: `node "${CLAUDE_PLUGIN_ROOT}/dist/bin/orra-launch.js"`

If the orchestrator is already running, this prints the `claude attach` command to connect to it. If it is not running, it spawns a new `claude --bg --agent orchestrator --name orra` session and prints the attach hint.
