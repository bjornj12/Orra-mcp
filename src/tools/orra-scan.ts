import { z } from "zod";
import { scanAll, filterScanEntries } from "../core/awareness.js";
import { ok, fail, toMcpContent } from "../core/envelope.js";
import { checkAgentsViewAvailable } from "../core/agents-view-preflight.js";

export const orraScanSchema = z.object({
  filter: z.record(z.string(), z.unknown()).optional().describe("Filter worktrees by equality, e.g. {status:'needs_attention'}."),
  fields: z.array(z.string()).optional().describe("Project to these top-level fields."),
});

export async function handleOrraScan(
  projectRoot: string,
  args: z.infer<typeof orraScanSchema> = {},
) {
  try {
    // Soft preflight: scan still works off git worktree list alone when the daemon
    // is unavailable. Include a warning in the payload so callers know agent-view
    // data is absent. The preflight itself is wrapped here so a thrown exception
    // degrades to a warning rather than failing the whole scan.
    let agentsViewUnavailable: string | undefined;
    try {
      const pf = await checkAgentsViewAvailable();
      agentsViewUnavailable = pf.ok ? undefined : pf.reason;
    } catch (pfErr) {
      agentsViewUnavailable = pfErr instanceof Error ? pfErr.message : String(pfErr);
    }
    const result = await scanAll(projectRoot);
    const entries = filterScanEntries(
      (result as unknown as { worktrees: Array<Record<string, unknown>> }).worktrees ??
        (result as unknown as Array<Record<string, unknown>>),
      { filter: args.filter, fields: args.fields },
    );
    const payload: Record<string, unknown> = {
      total: Array.isArray(result) ? result.length : (result as any).worktrees?.length ?? 0,
      returned: entries.length,
      entries,
    };
    if (agentsViewUnavailable) {
      payload.agentsViewUnavailable = agentsViewUnavailable;
    }
    return toMcpContent(ok(payload));
  } catch (err) {
    return toMcpContent(fail(err instanceof Error ? err.message : String(err)));
  }
}
