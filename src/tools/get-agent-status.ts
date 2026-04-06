import { z } from "zod";
import type { AgentManager } from "../core/agent-manager.js";

export const getAgentStatusSchema = z.object({
  agentId: z.string().describe("The agent ID"),
});

export async function handleGetAgentStatus(
  manager: AgentManager,
  args: z.infer<typeof getAgentStatusSchema>,
) {
  const result = await manager.getAgentStatus(args.agentId);
  if (!result) {
    return {
      content: [
        { type: "text" as const, text: `Agent ${args.agentId} not found.` },
      ],
      isError: true,
    };
  }

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            ...result.agent,
            recentOutput: result.recentOutput,
          },
          null,
          2,
        ),
      },
    ],
  };
}
