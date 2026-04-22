import { z } from "zod";
import * as fsp from "node:fs/promises";
import { ok, fail, toMcpContent } from "../core/envelope.js";
import { updateSessionState } from "../core/session-state.js";
import { renderResumeMd, resumeMdPath } from "../core/resume-md.js";
import { readRecentTicks } from "../core/tick-log.js";
import { computePressure } from "../core/pressure.js";

export const orraCheckpointSchema = z.object({
  reason: z.string().optional().describe("Why the checkpoint is being taken (pressure, periodic, user)."),
  notes: z.string().optional().describe("Free-form notes about in-flight work to preserve across /compact."),
});

export async function handleOrraCheckpoint(
  projectRoot: string,
  args: z.infer<typeof orraCheckpointSchema>,
) {
  const now = new Date().toISOString();
  try {
    const nextState = await updateSessionState(projectRoot, (prev) => {
      const notes = args.notes ? { ...prev.directive_notes, _checkpoint: args.notes } : prev.directive_notes;
      const pressure = computePressure({
        session_started_at: prev.session_started_at,
        tick_count: prev.tick_count,
        now,
      });
      return {
        ...prev,
        last_checkpoint_at: now,
        pressure,
        directive_notes: notes,
      };
    });

    const recent = await readRecentTicks(projectRoot, 5);
    const resume_md = renderResumeMd(nextState, recent);
    await fsp.writeFile(resumeMdPath(projectRoot), resume_md);

    const message = `checkpointed to .orra/session-state.json and regenerated .orra/resume.md (${nextState.tick_count} ticks, pressure ${nextState.pressure.score}).`;
    return toMcpContent(
      ok({
        checkpointed: true,
        reason: args.reason ?? null,
        tick_count: nextState.tick_count,
        pressure: nextState.pressure,
        message,
      }),
    );
  } catch (err) {
    return toMcpContent(fail(err instanceof Error ? err.message : String(err)));
  }
}
