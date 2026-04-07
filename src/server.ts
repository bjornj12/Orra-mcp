import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AgentManager } from "./core/agent-manager.js";
import { SocketClient } from "./core/socket-client.js";
import { orraSchema, handleOrra } from "./tools/orra.js";
import { orraAgentSchema, handleOrraAgent } from "./tools/orra-agent.js";
import { handleInstallHooks } from "./tools/install-hooks.js";
import type { OrraMode } from "./types.js";

export function createServer(
  projectRoot: string,
  mode: OrraMode
): {
  server: McpServer;
  manager: AgentManager;
} {
  const server = new McpServer({
    name: "orra-mcp",
    version: "0.1.0",
  });

  const manager = new AgentManager(projectRoot);

  if (mode === "orchestrator") {
    server.tool(
      "orra",
      "Manage parallel Claude Code agents working in git worktrees. IMPORTANT: When the user asks you to work in a worktree, spawn an agent, or delegate a task — use this tool. Do NOT cd into worktrees yourself. You are the orchestrator: you delegate work to agents and monitor their progress. Actions: spawn (start a new agent on a task in its own worktree), list (show all running/completed agents with status previews), status (detailed view of one agent + recent output), output (read agent logs), stop (kill an agent), message (send input to agent or answer its permission questions), link (auto-spawn agent B when agent A finishes), takeover (stop agent and give the user the worktree path to continue manually)",
      orraSchema.shape,
      async (args) => handleOrra(manager, projectRoot, orraSchema.parse(args)),
    );
  } else {
    const client = new SocketClient(projectRoot);
    server.tool(
      "orra_agent",
      "Agent-side tools for Orra orchestrator. Actions: register (join orchestrator), unregister (report done), heartbeat (send status update)",
      orraAgentSchema.shape,
      async (args) => handleOrraAgent(client, orraAgentSchema.parse(args)),
    );
  }

  server.tool(
    "orra_setup",
    "Install Orra hooks into .claude/settings.local.json for automatic input detection",
    {},
    async () => handleInstallHooks(),
  );

  return { server, manager };
}
