import { z } from "zod";
import { execFileSync } from "node:child_process";
import type { SocketClient } from "../core/socket-client.js";

export const registerSchema = z.object({
  task: z.string().describe("Description of what you're working on"),
  branch: z.string().optional().describe("Current branch (auto-detected if omitted)"),
});

export async function handleRegister(
  client: SocketClient,
  args: z.infer<typeof registerSchema>
) {
  if (client.isConnected()) {
    return {
      content: [{ type: "text" as const, text: "Error: Already registered with orchestrator." }],
      isError: true,
    };
  }

  let branch = args.branch;
  if (!branch) {
    try {
      branch = execFileSync("git", ["branch", "--show-current"], {
        encoding: "utf-8",
      }).trim();
    } catch {
      branch = "unknown";
    }
  }

  try {
    await client.connect();
  } catch {
    return {
      content: [{
        type: "text" as const,
        text: "Error: No Orra orchestrator found. Start one in another terminal first.",
      }],
      isError: true,
    };
  }

  const agentId = await new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Registration timeout")), 5000);

    client.onMessage = (msg) => {
      if (msg.type === "registered") {
        clearTimeout(timeout);
        resolve(msg.agentId);
      }
    };

    client.sendRegister(args.task, branch);
  });

  client.onMessage = (msg) => {
    if (msg.type === "stop") {
      console.error(`orra-mcp: orchestrator requested stop: ${msg.reason}`);
    }
  };

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({ agentId, status: "registered" }, null, 2),
    }],
  };
}
