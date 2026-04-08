import { z } from "zod";
import { inspectOne } from "../core/awareness.js";

export const orraInspectSchema = z.object({
  worktree: z.string().describe("Worktree ID or path"),
});

export async function handleOrraInspect(projectRoot: string, args: z.infer<typeof orraInspectSchema>) {
  try {
    const result = await inspectOne(projectRoot, args.worktree);
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    return { content: [{ type: "text" as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
  }
}
