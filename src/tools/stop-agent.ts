import { z } from "zod";
import type { AgentManager } from "../core/agent-manager.js";

export const stopAgentSchema = z.object({
  agentId: z.string().describe("The agent ID"),
  cleanup: z
    .boolean()
    .optional()
    .default(false)
    .describe("If true, also remove the worktree"),
});

export async function handleStopAgent(
  manager: AgentManager,
  args: z.infer<typeof stopAgentSchema>,
) {
  try {
    const result = await manager.stopAgent(args.agentId, args.cleanup);
    return {
      content: [
        { type: "text" as const, text: JSON.stringify(result, null, 2) },
      ],
    };
  } catch (err) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Error: ${err instanceof Error ? err.message : String(err)}`,
        },
      ],
      isError: true,
    };
  }
}
