import { z } from "zod";

export const unregisterSchema = z.object({
  status: z
    .enum(["completed", "failed"])
    .default("completed")
    .describe("Final status to report"),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function handleUnregister(
  _client: any,
  _args: z.infer<typeof unregisterSchema>
) {
  return {
    content: [{ type: "text" as const, text: "Error: Agent mode removed." }],
    isError: true,
  };
}
