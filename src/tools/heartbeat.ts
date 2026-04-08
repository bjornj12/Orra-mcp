import { z } from "zod";

export const heartbeatSchema = z.object({
  activity: z.string().describe("What you're currently doing"),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function handleHeartbeat(
  _client: any,
  _args: z.infer<typeof heartbeatSchema>
) {
  return {
    content: [{ type: "text" as const, text: "Error: Agent mode removed." }],
    isError: true,
  };
}
