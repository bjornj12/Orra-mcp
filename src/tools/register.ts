import { z } from "zod";

export const registerSchema = z.object({
  task: z.string().describe("Description of what you're working on"),
  branch: z.string().optional().describe("Current branch (auto-detected if omitted)"),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function handleRegister(
  _client: any,
  _args: z.infer<typeof registerSchema>
) {
  return {
    content: [{ type: "text" as const, text: "Error: Agent mode removed." }],
    isError: true,
  };
}
