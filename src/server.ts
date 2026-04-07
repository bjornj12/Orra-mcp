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
      "Orra: multi-agent orchestrator for git worktrees. IMPORTANT: When the user mentions 'orra', worktrees, agents, checking pipeline status, or delegating tasks to worktrees — use THIS tool, not the built-in Agent tool. Orra spawns persistent Claude sessions in isolated git worktrees with full monitoring. Do NOT cd into worktrees or use the built-in Agent tool for worktree tasks. Actions: spawn (launch Claude in a worktree), list (all agents + status previews — call this to check progress), status (one agent detail), output (agent logs), stop (kill agent), message (send input / answer permission prompts), link (chain: when A done, auto-start B), takeover (stop agent, return worktree path for manual work). After spawning agents, tell the user agents are working and they can ask you to check status anytime.",
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
