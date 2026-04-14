import { z } from "zod";
import { AgentManager } from "../core/agent-manager.js";
import { ConcurrencyLimitError } from "../core/spawn-defaults.js";

export const orraSpawnSchema = z.object({
  task: z.string().min(1).describe("The prompt for the spawned headless Claude agent."),
  reason: z.string().min(1).describe("Why this agent is being spawned (logged for accountability)."),
  worktree: z.string().optional().describe("Optional: id of an existing worktree to attach to. If omitted, a new worktree is created."),
  branch: z.string().optional().describe("Optional: branch name for the new worktree. Ignored if worktree is provided."),
  allowedTools: z.array(z.string()).optional().describe("Optional: override the default --allowed-tools allowlist. Use sparingly — the default is locked-down for safety."),
  model: z.string().optional().describe("Optional: override the default model."),
});

export async function handleOrraSpawn(
  manager: AgentManager,
  input: z.infer<typeof orraSpawnSchema>,
) {
  await manager.init();

  try {
    const result = await manager.spawnAgent({
      task: input.task,
      reason: input.reason,
      worktreeId: input.worktree,
      branch: input.branch,
      allowedTools: input.allowedTools,
      model: input.model,
    });

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            spawned: true,
            ...result,
            reason: input.reason,
          }, null, 2),
        },
      ],
    };
  } catch (err) {
    if (err instanceof ConcurrencyLimitError) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              spawned: false,
              error: "concurrency_limit",
              current: err.current,
              limit: err.limit,
              message: err.message,
            }, null, 2),
          },
        ],
      };
    }
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            spawned: false,
            error: "spawn_failed",
            message: err instanceof Error ? err.message : String(err),
          }, null, 2),
        },
      ],
    };
  }
}
