import { z } from "zod";
import type { SocketClient } from "../core/socket-client.js";

export const unregisterSchema = z.object({
  status: z
    .enum(["completed", "failed"])
    .default("completed")
    .describe("Final status to report"),
});

export async function handleUnregister(
  client: SocketClient,
  args: z.infer<typeof unregisterSchema>
) {
  if (!client.isConnected()) {
    return {
      content: [{ type: "text" as const, text: "Error: Not registered with any orchestrator." }],
      isError: true,
    };
  }

  const exitCode = args.status === "completed" ? 0 : 1;
  client.sendStatus(args.status, exitCode);
  client.disconnect();

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({ status: "unregistered" }, null, 2),
    }],
  };
}
