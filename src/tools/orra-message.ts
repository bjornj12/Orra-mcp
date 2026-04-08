import { z } from "zod";
import type { AgentManager } from "../core/agent-manager.js";

export const orraMessageSchema = z.object({
  worktree: z.string().describe("Worktree ID"),
  message: z.string().describe("The instruction or message to send"),
});

export async function handleOrraMessage(manager: AgentManager, args: z.infer<typeof orraMessageSchema>) {
  try {
    await manager.sendMessage(args.worktree, args.message);
    return { content: [{ type: "text" as const, text: JSON.stringify({ worktree: args.worktree, sent: true }, null, 2) }] };
  } catch (err) {
    return { content: [{ type: "text" as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
  }
}
