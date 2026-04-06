import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AgentManager } from "./core/agent-manager.js";
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

export function createServer(projectRoot: string): {
  server: McpServer;
  manager: AgentManager;
} {
  const server = new McpServer({
    name: "orra-mcp",
    version: "0.1.0",
  });

  const manager = new AgentManager(projectRoot);

  server.tool(
    "spawn_agent",
    "Create a git worktree and start a Claude Code agent with a task",
    spawnAgentSchema.shape,
    async (args) => handleSpawnAgent(manager, spawnAgentSchema.parse(args)),
  );

  server.tool(
    "list_agents",
    "List all agents with their status, branch, and last activity",
    {},
    async () => handleListAgents(manager),
  );

  server.tool(
    "get_agent_status",
    "Get one agent's detailed state and recent output",
    getAgentStatusSchema.shape,
    async (args) =>
      handleGetAgentStatus(manager, getAgentStatusSchema.parse(args)),
  );

  server.tool(
    "get_agent_output",
    "Get full or tail of an agent's captured output",
    getAgentOutputSchema.shape,
    async (args) =>
      handleGetAgentOutput(manager, getAgentOutputSchema.parse(args)),
  );

  server.tool(
    "stop_agent",
    "Kill an agent process, optionally remove its worktree",
    stopAgentSchema.shape,
    async (args) => handleStopAgent(manager, stopAgentSchema.parse(args)),
  );

  server.tool(
    "send_message",
    "Send a message to a running agent's session",
    sendMessageSchema.shape,
    async (args) => handleSendMessage(manager, sendMessageSchema.parse(args)),
  );

  server.tool(
    "link_agents",
    "When agent A completes, auto-spawn agent B with context",
    linkAgentsSchema.shape,
    async (args) => handleLinkAgents(manager, linkAgentsSchema.parse(args)),
  );

  return { server, manager };
}
