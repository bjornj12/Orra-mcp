import { z } from "zod";
import type { AgentManager } from "../core/agent-manager.js";
import { handleSpawnAgent, spawnAgentSchema } from "./spawn-agent.js";
import { handleListAgents } from "./list-agents.js";
import { handleGetAgentStatus } from "./get-agent-status.js";
import { handleGetAgentOutput } from "./get-agent-output.js";
import { handleStopAgent } from "./stop-agent.js";
import { handleSendMessage } from "./send-message.js";
import { handleTakeover } from "./takeover.js";

export const orraSchema = z.object({
  action: z.enum([
    "spawn",
    "list",
    "status",
    "output",
    "stop",
    "message",
    "takeover",
  ]).describe("The action to perform"),

  // spawn
  task: z.string().optional().describe("Task description (spawn, link.to)"),
  branch: z.string().optional().describe("Branch name (spawn, link.to)"),
  model: z.string().optional().describe("Model override (spawn, link.to)"),
  allowedTools: z.array(z.string()).optional().describe("Tool restrictions (spawn)"),

  // status, output, stop, message, takeover
  agentId: z.string().optional().describe("Target agent ID"),

  // output
  tail: z.number().optional().describe("Number of lines from end (output)"),

  // stop
  cleanup: z.boolean().optional().describe("Remove worktree on stop"),

  // message
  message: z.string().optional().describe("Message to send (message)"),

});

export async function handleOrra(
  manager: AgentManager,
  projectRoot: string,
  args: z.infer<typeof orraSchema>
) {
  switch (args.action) {
    case "spawn": {
      if (!args.task) return error("'task' is required for spawn");
      return handleSpawnAgent(manager, {
        task: args.task,
        branch: args.branch,
        model: args.model,
        allowedTools: args.allowedTools,
      });
    }

    case "list":
      return handleListAgents(manager);

    case "status": {
      if (!args.agentId) return error("'agentId' is required for status");
      return handleGetAgentStatus(manager, { agentId: args.agentId });
    }

    case "output": {
      if (!args.agentId) return error("'agentId' is required for output");
      return handleGetAgentOutput(manager, { agentId: args.agentId, tail: args.tail });
    }

    case "stop": {
      if (!args.agentId) return error("'agentId' is required for stop");
      return handleStopAgent(manager, { agentId: args.agentId, cleanup: args.cleanup ?? false });
    }

    case "message": {
      if (!args.agentId) return error("'agentId' is required for message");
      if (!args.message) return error("'message' is required for message");
      return handleSendMessage(manager, { agentId: args.agentId, message: args.message });
    }

    case "takeover": {
      if (!args.agentId) return error("'agentId' is required for takeover");
      return handleTakeover(manager, projectRoot, { agentId: args.agentId });
    }

    default:
      return error(`Unknown action: ${args.action}`);
  }
}

function error(msg: string) {
  return {
    content: [{ type: "text" as const, text: `Error: ${msg}` }],
    isError: true,
  };
}
