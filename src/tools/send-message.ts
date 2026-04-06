import { z } from "zod";
import type { AgentManager } from "../core/agent-manager.js";

export const sendMessageSchema = z.object({
  agentId: z.string().describe("The agent ID"),
  message: z.string().describe("The message to send to the agent"),
});

export async function handleSendMessage(
  manager: AgentManager,
  args: z.infer<typeof sendMessageSchema>,
) {
  try {
    await manager.sendMessage(args.agentId, args.message);
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            { agentId: args.agentId, sent: true },
            null,
            2,
          ),
        },
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
