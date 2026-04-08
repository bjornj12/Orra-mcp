import { z } from "zod";
import type { AgentManager } from "../core/agent-manager.js";
import { WorktreeManager } from "../core/worktree.js";

export const orraRebaseSchema = z.object({
  worktree: z.string().describe("Worktree ID"),
});

export async function handleOrraRebase(manager: AgentManager, projectRoot: string, args: z.infer<typeof orraRebaseSchema>) {
  const status = await manager.getAgentStatus(args.worktree);
  const wasRunning = status?.agent && ["running", "idle"].includes(status.agent.status);
  if (wasRunning) {
    await manager.stopAgent(args.worktree, false);
  }
  const worktrees = new WorktreeManager(projectRoot);
  const result = await worktrees.rebase(args.worktree);
  const response: Record<string, unknown> = { worktree: args.worktree, success: result.success, conflicts: result.conflicts };
  if (wasRunning && result.success) {
    response.note = "Agent was stopped for rebase. Spawn a new agent to continue work.";
  }
  return { content: [{ type: "text" as const, text: JSON.stringify(response, null, 2) }] };
}
