import { z } from "zod";
import type { AgentManager } from "../core/agent-manager.js";
import { handleSpawnAgent, spawnAgentSchema } from "./spawn-agent.js";
import { handleListAgents } from "./list-agents.js";
import { handleGetAgentStatus } from "./get-agent-status.js";
import { handleGetAgentOutput } from "./get-agent-output.js";
import { handleStopAgent } from "./stop-agent.js";
import { handleSendMessage } from "./send-message.js";
import { handleLinkAgents } from "./link-agents.js";
import { handleTakeover } from "./takeover.js";

export const orraSchema = z.object({
  action: z.enum([
    "spawn",
    "list",
    "wait",
    "status",
    "output",
    "stop",
    "message",
    "link",
    "takeover",
  ]).describe("The action to perform"),

  // spawn
  task: z.string().optional().describe("Task description (spawn, link.to)"),
  branch: z.string().optional().describe("Branch name (spawn, link.to)"),
  model: z.string().optional().describe("Model override (spawn, link.to)"),
  allowedTools: z.array(z.string()).optional().describe("Tool restrictions (spawn)"),

  // wait
  timeout: z.number().optional().describe("Max seconds to wait (wait, default: 120)"),

  // status, output, stop, message, takeover
  agentId: z.string().optional().describe("Target agent ID"),

  // output
  tail: z.number().optional().describe("Number of lines from end (output)"),

  // stop
  cleanup: z.boolean().optional().describe("Remove worktree on stop"),

  // message
  message: z.string().optional().describe("Message to send (message)"),

  // link
  from: z.string().optional().describe("Source agent ID (link)"),
  to: z.object({
    task: z.string(),
    branch: z.string().optional(),
    model: z.string().optional(),
  }).optional().describe("Target agent config (link)"),
  on: z.enum(["success", "failure", "any"]).optional().describe("Trigger condition (link)"),
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

    case "wait": {
      const timeoutMs = (args.timeout ?? 120) * 1000;
      const startTime = Date.now();
      const initialAgents = await manager.listAgents();
      const initialStates = new Map(initialAgents.map(a => [a.id, a.status]));

      // Poll every 2 seconds for state changes
      while (Date.now() - startTime < timeoutMs) {
        await new Promise(r => setTimeout(r, 2000));
        const current = await manager.listAgents();

        const changes: Array<{ id: string; task: string; from: string; to: string }> = [];
        for (const agent of current) {
          const prev = initialStates.get(agent.id);
          if (prev && prev !== agent.status) {
            changes.push({ id: agent.id, task: agent.task, from: prev, to: agent.status });
          }
          if (!prev && agent.status !== "running") {
            // New agent that already finished
            changes.push({ id: agent.id, task: agent.task, from: "new", to: agent.status });
          }
        }

        if (changes.length > 0) {
          const summary = current.map(a => ({ id: a.id, task: a.task, status: a.status }));
          return {
            content: [{
              type: "text" as const,
              text: JSON.stringify({ changes, allAgents: summary }, null, 2),
            }],
          };
        }
      }

      // Timeout — return current state anyway
      const final = await manager.listAgents();
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            timeout: true,
            message: `No state changes in ${args.timeout ?? 120}s`,
            allAgents: final.map(a => ({ id: a.id, task: a.task, status: a.status })),
          }, null, 2),
        }],
      };
    }

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

    case "link": {
      if (!args.from) return error("'from' is required for link");
      if (!args.to) return error("'to' is required for link");
      if (!args.on) return error("'on' is required for link");
      return handleLinkAgents(manager, { from: args.from, to: args.to, on: args.on });
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
