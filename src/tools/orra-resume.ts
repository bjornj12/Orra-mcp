import { z } from "zod";
import * as fsp from "node:fs/promises";
import { ok, fail, toMcpContent } from "../core/envelope.js";
import { readCurrentSession, writeCurrentSession } from "../core/session-id.js";
import {
  readSessionState,
  writeSessionState,
  initialSessionState,
} from "../core/session-state.js";
import { renderResumeMd, resumeMdPath } from "../core/resume-md.js";
import { readRecentTicks } from "../core/tick-log.js";
import { computePressure } from "../core/pressure.js";
import { randomUUID } from "node:crypto";
import type { ResumeResult } from "../types.js";

export const orraResumeSchema = z.object({});

export async function handleOrraResume(projectRoot: string, _args: z.infer<typeof orraResumeSchema>) {
  try {
    const now = new Date().toISOString();

    let current = await readCurrentSession(projectRoot);
    if (!current) {
      current = { session_id: randomUUID(), started_at: now };
      await writeCurrentSession(projectRoot, current);
    }

    const prev = await readSessionState(projectRoot);
    const recent = await readRecentTicks(projectRoot, 5);

    let resumed = false;
    let age_seconds = 0;
    let nextState;
    if (!prev) {
      nextState = initialSessionState({ session_id: current.session_id, now });
    } else {
      const lastTs = prev.last_checkpoint_at ?? prev.last_resume_at;
      age_seconds = Math.max(0, Math.floor((Date.parse(now) - Date.parse(lastTs)) / 1000));
      resumed = age_seconds < 300 && prev.session_id !== current.session_id;
      nextState = {
        ...prev,
        session_id: current.session_id,
        last_resume_at: now,
      };
    }

    nextState.pressure = computePressure({
      session_started_at: nextState.session_started_at,
      tick_count: nextState.tick_count,
      now,
    });

    await writeSessionState(projectRoot, nextState);
    const resume_md = renderResumeMd(nextState, recent);
    await fsp.writeFile(resumeMdPath(projectRoot), resume_md);

    const result: ResumeResult = {
      resumed,
      age_seconds,
      session_id: current.session_id,
      open_threads: nextState.open_threads,
      pressure: nextState.pressure,
      resume_md,
    };
    return toMcpContent(ok(result));
  } catch (err) {
    return toMcpContent(fail(err instanceof Error ? err.message : String(err)));
  }
}
