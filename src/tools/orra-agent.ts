import { z } from "zod";
import { handleRegister } from "./register.js";
import { handleUnregister } from "./unregister.js";
import { handleHeartbeat } from "./heartbeat.js";

export const orraAgentSchema = z.object({
  action: z.enum([
    "register",
    "unregister",
    "heartbeat",
  ]).describe("The action to perform"),

  // register
  task: z.string().optional().describe("What you're working on (register)"),
  branch: z.string().optional().describe("Current branch (register, auto-detected if omitted)"),

  // unregister
  status: z.enum(["completed", "failed"]).optional().describe("Final status (unregister, default: completed)"),

  // heartbeat
  activity: z.string().optional().describe("What you're currently doing (heartbeat)"),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function handleOrraAgent(
  client: any,
  args: z.infer<typeof orraAgentSchema>
) {
  switch (args.action) {
    case "register": {
      if (!args.task) return error("'task' is required for register");
      return handleRegister(client, { task: args.task, branch: args.branch });
    }

    case "unregister":
      return handleUnregister(client, { status: args.status ?? "completed" });

    case "heartbeat": {
      if (!args.activity) return error("'activity' is required for heartbeat");
      return handleHeartbeat(client, { activity: args.activity });
    }

    default:
      return error(`Unknown action: ${args.action}`);
  }
}

function error(msg: string) {
  return {
    content: [{ type: "text" as const, text: `Error: ${msg}` }],
    isError: true,
  };
}
