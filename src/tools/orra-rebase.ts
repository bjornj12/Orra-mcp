import { z } from "zod";
import type { AgentManager } from "../core/agent-manager.js";
import { WorktreeManager } from "../core/worktree.js";
import { SafeWorktreeIdSchema } from "../core/validation.js";

export const orraRebaseSchema = z.object({
  worktree: SafeWorktreeIdSchema.describe("Worktree ID"),
});

export async function handleOrraRebase(manager: AgentManager, projectRoot: string, args: z.infer<typeof orraRebaseSchema>) {
  const agent = await manager.getAgent(args.worktree);
  const wasRunning = agent && ["running", "idle"].includes(agent.status);
  if (wasRunning) {
    await manager.stopAgent(args.worktree, false);
  }
  const worktrees = new WorktreeManager(projectRoot);
  const result = await worktrees.rebase(args.worktree);
  const response: Record<string, unknown> = { worktree: args.worktree, success: result.success, conflicts: result.conflicts };
  if (wasRunning && result.success) {
    response.note = "Agent was stopped for rebase. The user should restart their Claude session in the worktree to continue work.";
  }
  return { content: [{ type: "text" as const, text: JSON.stringify(response, null, 2) }] };
}
