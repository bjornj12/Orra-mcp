import { z } from "zod";
import type { SocketClient } from "../core/socket-client.js";

export const heartbeatSchema = z.object({
  activity: z.string().describe("What you're currently doing"),
});

export async function handleHeartbeat(
  client: SocketClient,
  args: z.infer<typeof heartbeatSchema>
) {
  if (!client.isConnected()) {
    return {
      content: [{ type: "text" as const, text: "Error: Not registered with any orchestrator." }],
      isError: true,
    };
  }

  client.sendOutput(args.activity + "\n");

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({ sent: true }, null, 2),
    }],
  };
}
