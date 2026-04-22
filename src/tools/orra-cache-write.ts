import { z } from "zod";
import { ok, fail, toMcpContent } from "../core/envelope.js";
import { writeCache } from "../core/cache-store.js";
import { appendTickLog } from "../core/tick-log.js";
import { updateSessionState } from "../core/session-state.js";
import { CacheIndexSchema } from "../types.js";

export const orraCacheWriteSchema = z.object({
  directive_id: z.string().describe("The directive that produced this cache entry."),
  digest: z.string().describe("≤150-token summary that the orchestrator will see."),
  rows: z.array(z.record(z.string(), z.unknown())).describe("Normalized rows matching cache_schema.fields."),
  index: CacheIndexSchema.describe("Facet counts + fetched_at metadata."),
  seen_add: z.array(z.object({
    bucket: z.string(),
    ids: z.array(z.string()),
  })).optional().describe("IDs to merge into session-state.seen for dedup."),
  last_surfaced: z.object({
    suggestion_id: z.string(),
    at: z.string(),
  }).optional().describe("Record of the last suggestion surfaced (dedup across ticks)."),
  subagent_tokens: z.number().int().nonnegative().optional(),
  subagent_duration_ms: z.number().int().nonnegative().optional(),
});

export async function handleOrraCacheWrite(
  projectRoot: string,
  args: z.infer<typeof orraCacheWriteSchema>,
) {
  if (args.index.directive_id !== args.directive_id) {
    return toMcpContent(
      fail(
        `index.directive_id ('${args.index.directive_id}') must match directive_id ('${args.directive_id}').`,
      ),
    );
  }
  if (args.index.total !== args.rows.length) {
    return toMcpContent(
      fail(
        `index.total (${args.index.total}) must equal rows.length (${args.rows.length}).`,
      ),
    );
  }

  const cache_bytes = JSON.stringify(args.rows).length;

  try {
    const fetched_at = args.index.fetched_at;
    await writeCache(projectRoot, {
      directive_id: args.directive_id,
      rows: args.rows,
      index: args.index,
      fetched_at,
    });

    await updateSessionState(projectRoot, (prev) => {
      const seen = { ...prev.seen };
      if (args.seen_add) {
        for (const { bucket, ids } of args.seen_add) {
          const existing = Array.isArray(seen[bucket]) ? (seen[bucket] as string[]) : [];
          seen[bucket] = Array.from(new Set([...existing, ...ids]));
        }
      }
      const last_surfaced = args.last_surfaced
        ? { ...prev.last_surfaced, [args.directive_id]: args.last_surfaced }
        : prev.last_surfaced;
      return {
        ...prev,
        tick_count: prev.tick_count + 1,
        seen,
        last_surfaced,
      };
    });

    await appendTickLog(projectRoot, {
      ts: new Date().toISOString(),
      directive_id: args.directive_id,
      digest: args.digest,
      cache_bytes,
      subagent_tokens: args.subagent_tokens,
      subagent_duration_ms: args.subagent_duration_ms,
      ok: true,
    });

    return toMcpContent(ok({ written: true, directive_id: args.directive_id, cache_bytes }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await appendTickLog(projectRoot, {
      ts: new Date().toISOString(),
      directive_id: args.directive_id,
      digest: args.digest,
      cache_bytes,
      subagent_tokens: args.subagent_tokens,
      subagent_duration_ms: args.subagent_duration_ms,
      ok: false,
      error: message,
    }).catch(() => {});
    return toMcpContent(fail(message));
  }
}
