import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AgentManager } from "./core/agent-manager.js";
import { SocketClient } from "./core/socket-client.js";
import { spawnAgentSchema, handleSpawnAgent } from "./tools/spawn-agent.js";
import { handleListAgents } from "./tools/list-agents.js";
import {
  getAgentStatusSchema,
  handleGetAgentStatus,
} from "./tools/get-agent-status.js";
import {
  getAgentOutputSchema,
  handleGetAgentOutput,
} from "./tools/get-agent-output.js";
import { stopAgentSchema, handleStopAgent } from "./tools/stop-agent.js";
import { sendMessageSchema, handleSendMessage } from "./tools/send-message.js";
import { linkAgentsSchema, handleLinkAgents } from "./tools/link-agents.js";
import { registerSchema, handleRegister } from "./tools/register.js";
import { unregisterSchema, handleUnregister } from "./tools/unregister.js";
import { heartbeatSchema, handleHeartbeat } from "./tools/heartbeat.js";
import { handleInstallHooks } from "./tools/install-hooks.js";
import { takeoverSchema, handleTakeover } from "./tools/takeover.js";
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
    registerOrchestratorTools(server, manager, projectRoot);
  } else {
    const client = new SocketClient(projectRoot);
    registerAgentTools(server, client);
  }

  // Available in both modes
  server.tool(
    "orra_install_hooks",
    "Install Orra hooks into this project's .claude/settings.local.json for automatic input detection",
    {},
    async () => handleInstallHooks(),
  );

  return { server, manager };
}

function registerOrchestratorTools(server: McpServer, manager: AgentManager, projectRoot: string): void {
  server.tool(
    "orra_spawn",
    "Create a git worktree and start a Claude Code agent with a task",
    spawnAgentSchema.shape,
    async (args) => handleSpawnAgent(manager, spawnAgentSchema.parse(args)),
  );

  server.tool(
    "orra_list",
    "List all agents with their status, branch, and last activity",
    {},
    async () => handleListAgents(manager),
  );

  server.tool(
    "orra_status",
    "Get one agent's detailed state and recent output",
    getAgentStatusSchema.shape,
    async (args) =>
      handleGetAgentStatus(manager, getAgentStatusSchema.parse(args)),
  );

  server.tool(
    "orra_output",
    "Get full or tail of an agent's captured output",
    getAgentOutputSchema.shape,
    async (args) =>
      handleGetAgentOutput(manager, getAgentOutputSchema.parse(args)),
  );

  server.tool(
    "orra_stop",
    "Kill an agent process, optionally remove its worktree",
    stopAgentSchema.shape,
    async (args) => handleStopAgent(manager, stopAgentSchema.parse(args)),
  );

  server.tool(
    "orra_message",
    "Send a message to a running agent's session",
    sendMessageSchema.shape,
    async (args) => handleSendMessage(manager, sendMessageSchema.parse(args)),
  );

  server.tool(
    "orra_link",
    "When agent A completes, auto-spawn agent B with context",
    linkAgentsSchema.shape,
    async (args) => handleLinkAgents(manager, linkAgentsSchema.parse(args)),
  );

  server.tool(
    "orra_takeover",
    "Stop an agent and get the worktree path so you can take over manually in a new terminal",
    takeoverSchema.shape,
    async (args) => handleTakeover(manager, projectRoot, takeoverSchema.parse(args)),
  );
}

function registerAgentTools(server: McpServer, client: SocketClient): void {
  server.tool(
    "orra_register",
    "Register this terminal as an agent with the Orra orchestrator",
    registerSchema.shape,
    async (args) => handleRegister(client, registerSchema.parse(args)),
  );

  server.tool(
    "orra_unregister",
    "Unregister from the Orra orchestrator and report completion status",
    unregisterSchema.shape,
    async (args) => handleUnregister(client, unregisterSchema.parse(args)),
  );

  server.tool(
    "orra_heartbeat",
    "Send a status update to the Orra orchestrator",
    heartbeatSchema.shape,
    async (args) => handleHeartbeat(client, heartbeatSchema.parse(args)),
  );
}
