import { z } from "zod";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import { SafeWorktreeIdSchema } from "../core/validation.js";
import { ok, fail, toMcpContent } from "../core/envelope.js";

export const orraUnblockSchema = z.object({
  worktree: SafeWorktreeIdSchema.describe("Worktree ID"),
  allow: z.boolean().describe("Allow or deny the permission request"),
  reason: z.string().optional().describe("Explanation (shown to agent on deny)"),
});

export async function handleOrraUnblock(projectRoot: string, args: z.infer<typeof orraUnblockSchema>) {
  const answerPath = path.join(projectRoot, ".orra", "agents", `${args.worktree}.answer.json`);
  const tmpPath = answerPath + ".tmp";
  try {
    await fsp.writeFile(tmpPath, JSON.stringify({ allow: args.allow, reason: args.reason }));
    await fsp.rename(tmpPath, answerPath);
    return toMcpContent(ok({ worktree: args.worktree, action: args.allow ? "allowed" : "denied", reason: args.reason }));
  } catch (err) {
    return toMcpContent(fail(err instanceof Error ? err.message : String(err)));
  }
}
