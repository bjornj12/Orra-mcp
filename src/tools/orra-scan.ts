import { z } from "zod";
import { scanAll, filterScanEntries } from "../core/awareness.js";
import { ok, fail, toMcpContent } from "../core/envelope.js";

export const orraScanSchema = z.object({
  filter: z.record(z.string(), z.unknown()).optional().describe("Filter worktrees by equality, e.g. {status:'needs_attention'}."),
  fields: z.array(z.string()).optional().describe("Project to these top-level fields."),
});

export async function handleOrraScan(
  projectRoot: string,
  args: z.infer<typeof orraScanSchema> = {},
) {
  try {
    const result = await scanAll(projectRoot);
    const entries = filterScanEntries(
      (result as unknown as { worktrees: Array<Record<string, unknown>> }).worktrees ??
        (result as unknown as Array<Record<string, unknown>>),
      { filter: args.filter, fields: args.fields },
    );
    return toMcpContent(ok({ total: Array.isArray(result) ? result.length : (result as any).worktrees?.length ?? 0, returned: entries.length, entries }));
  } catch (err) {
    return toMcpContent(fail(err instanceof Error ? err.message : String(err)));
  }
}
