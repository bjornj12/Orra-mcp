import { z } from "zod";
import { AgentManager } from "../core/agent-manager.js";
import { ConcurrencyLimitError } from "../core/spawn-defaults.js";
import { ok, fail, toMcpContent } from "../core/envelope.js";

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

    return toMcpContent(ok({
      spawned: true,
      ...result,
      reason: input.reason,
    }));
  } catch (err) {
    if (err instanceof ConcurrencyLimitError) {
      return toMcpContent(fail(err.message, {
        code: "concurrency_limit",
        current: err.current,
        limit: err.limit,
      }));
    }
    return toMcpContent(fail(err instanceof Error ? err.message : String(err), {
      code: "spawn_failed",
    }));
  }
}
