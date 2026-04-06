import { z } from "zod";
import type { AgentManager } from "../core/agent-manager.js";

export const linkAgentsSchema = z.object({
  from: z.string().describe("Source agent ID"),
  to: z
    .object({
      task: z.string().describe("Task for the linked agent"),
      branch: z.string().optional().describe("Custom branch name"),
      model: z.string().optional().describe("Model override"),
    })
    .describe("Configuration for the agent to spawn"),
  on: z
    .enum(["success", "failure", "any"])
    .describe("When to trigger: on success, failure, or any exit"),
});

export async function handleLinkAgents(
  manager: AgentManager,
  args: z.infer<typeof linkAgentsSchema>,
) {
  try {
    const result = await manager.linkAgents(args.from, args.to, args.on);
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
