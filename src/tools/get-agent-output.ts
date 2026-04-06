import { z } from "zod";
import type { AgentManager } from "../core/agent-manager.js";

export const getAgentOutputSchema = z.object({
  agentId: z.string().describe("The agent ID"),
  tail: z
    .number()
    .optional()
    .describe("Number of lines from end (default: all)"),
});

export async function handleGetAgentOutput(
  manager: AgentManager,
  args: z.infer<typeof getAgentOutputSchema>,
) {
  const output = await manager.getAgentOutput(args.agentId, args.tail);
  if (output === null) {
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
        text: output.length === 0 ? "No output yet." : output,
      },
    ],
  };
}
