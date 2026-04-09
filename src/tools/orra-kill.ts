import { z } from "zod";
import type { AgentManager } from "../core/agent-manager.js";

export const orraKillSchema = z.object({
  worktree: z.string().describe("Worktree ID"),
  cleanup: z.boolean().default(true).describe("Remove worktree + delete branch"),
  closePR: z.boolean().default(false).describe("Close associated PR if draft"),
});

export async function handleOrraKill(manager: AgentManager, args: z.infer<typeof orraKillSchema>) {
  try {
    const agent = await manager.getAgent(args.worktree);
    const result = await manager.stopAgent(args.worktree, args.cleanup);
    if (args.closePR && agent?.branch) {
      try {
        const { execFile } = await import("node:child_process");
        const { promisify } = await import("node:util");
        const execFileAsync = promisify(execFile);
        await execFileAsync("gh", ["pr", "close", agent.branch, "--delete-branch"], { timeout: 10000 });
      } catch {}
    }
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    return { content: [{ type: "text" as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
  }
}
