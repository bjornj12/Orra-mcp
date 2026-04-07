import { z } from "zod";
import type { AgentManager } from "../core/agent-manager.js";

export const spawnAgentSchema = z.object({
  task: z.string().describe("The task description/prompt for the agent"),
  branch: z
    .string()
    .optional()
    .describe("Custom branch name (auto-generated if omitted)"),
  model: z
    .string()
    .optional()
    .describe("Model override (e.g., 'sonnet', 'opus')"),
  allowedTools: z
    .array(z.string())
    .optional()
    .describe("Restrict which tools the agent can use"),
});

export async function handleSpawnAgent(
  manager: AgentManager,
  args: z.infer<typeof spawnAgentSchema>,
) {
  const result = await manager.spawnAgent(args);
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(result, null, 2) +
          "\n\nAgent is now running. Use orra({ action: \"list\" }) to check status. " +
          "Agents update to 'completed', 'failed', or 'idle' (needs input) when their state changes. " +
          "Poll periodically or after a reasonable wait.",
      },
    ],
  };
}
