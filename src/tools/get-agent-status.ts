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

  const response: Record<string, unknown> = {
    ...result.agent,
    recentOutput: result.recentOutput,
  };

  if (result.agent.status === "idle") {
    const preview = manager.getTurnPreview(args.agentId);
    if (preview) response.turnPreview = preview;
  }

  if (result.agent.status === "waiting") {
    const question = manager.getPendingQuestion(args.agentId);
    if (question) response.pendingQuestion = { tool: question.tool, input: question.input };
  }

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(response, null, 2),
      },
    ],
  };
}
