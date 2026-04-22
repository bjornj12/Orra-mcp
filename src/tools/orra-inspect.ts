import { z } from "zod";
import { inspectOne } from "../core/awareness.js";
import { SafeWorktreeIdSchema, isSafeWorktreeId } from "../core/validation.js";
import { ok, fail, toMcpContent } from "../core/envelope.js";
import { readSessionState } from "../core/session-state.js";
import { queryCache } from "../core/cache-store.js";
import { computePressure } from "../core/pressure.js";

export const orraInspectSchema = z.object({
  target: z.enum(["worktree", "session", "cache"]).optional().describe("What to inspect. Defaults to 'worktree' if 'worktree' or 'id' looks like a worktree id."),
  id: z.string().optional().describe("For target='worktree' or 'cache': the worktree id or directive id."),
  worktree: SafeWorktreeIdSchema.optional().describe("DEPRECATED — use {target:'worktree', id:'...'} instead. Still accepted for back-compat."),
  filter: z.record(z.string(), z.unknown()).optional().describe("For target='cache': filter rows by equality or {$gt: N}."),
  fields: z.array(z.string()).optional().describe("For target='cache': project to these row fields."),
  limit: z.number().int().nonnegative().optional().describe("For target='cache': cap rows returned."),
});

function defaultTarget(args: {
  target?: string;
  worktree?: string;
  id?: string;
  filter?: unknown;
  fields?: unknown;
  limit?: unknown;
}): "worktree" | "session" | "cache" {
  if (args.target === "worktree" || args.target === "session" || args.target === "cache") return args.target;
  // Worktree ids and directive ids share the same slug shape, so we can't
  // disambiguate from `id` alone. Cache-only arg presence (filter/fields/limit)
  // is a strong signal; otherwise fall back to "worktree" for back-compat.
  if (args.filter !== undefined || args.fields !== undefined || args.limit !== undefined) return "cache";
  if (args.worktree) return "worktree";
  if (args.id && isSafeWorktreeId(args.id)) return "worktree";
  return "worktree";
}

export async function handleOrraInspect(
  projectRoot: string,
  args: z.infer<typeof orraInspectSchema>,
) {
  const target = defaultTarget(args);
  try {
    if (target === "session") return handleSession(projectRoot);
    if (target === "cache") return handleCache(projectRoot, args);
    return handleWorktree(projectRoot, args);
  } catch (err) {
    return toMcpContent(fail(err instanceof Error ? err.message : String(err)));
  }
}

async function handleWorktree(
  projectRoot: string,
  args: z.infer<typeof orraInspectSchema>,
) {
  const id = args.id ?? args.worktree;
  if (!id) return toMcpContent(fail("target:'worktree' requires 'id' (or legacy 'worktree')."));
  try {
    const result = await inspectOne(projectRoot, id);
    return toMcpContent(ok(result));
  } catch (err) {
    return toMcpContent(fail(err instanceof Error ? err.message : String(err)));
  }
}

async function handleSession(projectRoot: string) {
  const state = await readSessionState(projectRoot);
  if (!state) return toMcpContent(fail("No session-state yet. Call orra_resume first."));
  const now = new Date().toISOString();
  const pressure = computePressure({
    session_started_at: state.session_started_at,
    tick_count: state.tick_count,
    now,
  });
  const minutes_running = Math.max(
    0,
    Math.floor((Date.parse(now) - Date.parse(state.session_started_at)) / 60000),
  );
  return toMcpContent(
    ok({
      session_id: state.session_id,
      session_started_at: state.session_started_at,
      minutes_running,
      tick_count: state.tick_count,
      pressure,
      recommend_compact: pressure.recommend_compact,
      last_checkpoint_at: state.last_checkpoint_at,
      last_resume_at: state.last_resume_at,
      open_threads: state.open_threads,
    }),
  );
}

async function handleCache(
  projectRoot: string,
  args: z.infer<typeof orraInspectSchema>,
) {
  if (!args.id) return toMcpContent(fail("target:'cache' requires 'id' (directive id)."));
  const result = await queryCache(projectRoot, args.id, {
    filter: args.filter,
    fields: args.fields,
    limit: args.limit,
  });
  return toMcpContent(ok(result));
}
