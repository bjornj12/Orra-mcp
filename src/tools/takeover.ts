import { z } from "zod";
import * as path from "node:path";
import type { AgentManager } from "../core/agent-manager.js";

export const takeoverSchema = z.object({
  agentId: z.string().describe("The agent ID to take over"),
});

export async function handleTakeover(
  manager: AgentManager,
  projectRoot: string,
  args: z.infer<typeof takeoverSchema>
) {
  const status = await manager.getAgentStatus(args.agentId);
  if (!status) {
    return {
      content: [{ type: "text" as const, text: `Agent ${args.agentId} not found.` }],
      isError: true,
    };
  }

  const agent = status.agent;

  // Stop the agent process if it's still running (no cleanup — keep worktree)
  if (agent.status === "running" || agent.status === "idle" || agent.status === "waiting") {
    await manager.stopAgent(args.agentId, false);
  }

  const worktreePath = agent.worktree
    ? path.resolve(projectRoot, agent.worktree)
    : null;

  const result: Record<string, unknown> = {
    agentId: agent.id,
    task: agent.task,
    branch: agent.branch,
    worktree: worktreePath,
    status: "taken_over",
  };

  if (worktreePath) {
    result.command = `cd ${worktreePath} && claude`;
    result.hint = `Open a new terminal and run: cd ${worktreePath} && claude`;
  } else {
    result.hint = `Agent was external (branch: ${agent.branch}). Switch to that branch to continue the work.`;
  }

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify(result, null, 2),
    }],
  };
}
