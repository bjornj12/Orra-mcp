import { z } from "zod";
import type { AgentManager } from "../core/agent-manager.js";

export const orraSpawnSchema = z.object({
  task: z.string().describe("What the agent should do"),
  worktree: z.string().optional().describe("Existing worktree to spawn into"),
  branch: z.string().optional().describe("Branch name (auto-generated if omitted)"),
  model: z.string().optional().describe("Model override"),
  agent: z.string().optional().describe("Agent persona from .claude/agents/"),
  allowedTools: z.array(z.string()).optional().describe("Tool restrictions"),
});

export async function handleOrraSpawn(manager: AgentManager, args: z.infer<typeof orraSpawnSchema>) {
  const result = await manager.spawnAgent({
    task: args.task,
    branch: args.branch,
    model: args.model,
    agent: args.agent,
    allowedTools: args.allowedTools,
  });
  return {
    content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) + "\n\nAgent is now running. Use orra_scan to check all agents, or orra_inspect to check this one." }],
  };
}
