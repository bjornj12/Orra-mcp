import { z } from "zod";
import type { AgentManager } from "../core/agent-manager.js";
import { SafeWorktreeIdSchema, isSafeBranchName } from "../core/validation.js";

export const orraKillSchema = z.object({
  worktree: SafeWorktreeIdSchema.describe("Worktree ID"),
  cleanup: z.boolean().default(true).describe("Remove worktree + delete branch"),
  closePR: z.boolean().default(false).describe("Close associated PR if draft"),
});

export async function handleOrraKill(manager: AgentManager, args: z.infer<typeof orraKillSchema>) {
  try {
    const agent = await manager.getAgent(args.worktree);
    const result = await manager.stopAgent(args.worktree, args.cleanup);
    if (args.closePR && agent?.branch && isSafeBranchName(agent.branch)) {
      try {
        const { execFile } = await import("node:child_process");
        const { promisify } = await import("node:util");
        const execFileAsync = promisify(execFile);
        // `--` separator ensures agent.branch is treated as a positional
        // arg even if it happens to start with a dash after future schema
        // changes. The isSafeBranchName check above is belt-and-suspenders.
        await execFileAsync("gh", ["pr", "close", "--delete-branch", "--", agent.branch], { timeout: 10000 });
      } catch {}
    }
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    return { content: [{ type: "text" as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
  }
}
