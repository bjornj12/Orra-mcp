import * as fsp from "node:fs/promises";
import * as path from "node:path";
import { SessionStateSchema, type SessionState } from "../types.js";

export function sessionStatePath(projectRoot: string): string {
  return path.join(projectRoot, ".orra", "session-state.json");
}

export function initialSessionState(opts: { session_id: string; now: string }): SessionState {
  return {
    schema_version: 1,
    session_id: opts.session_id,
    session_started_at: opts.now,
    last_resume_at: opts.now,
    last_checkpoint_at: null,
    tick_count: 0,
    pressure: { score: 0, recommend_compact: false },
    seen: {},
    last_surfaced: {},
    open_threads: [],
    directive_notes: {},
  };
}

export async function readSessionState(
  projectRoot: string,
): Promise<SessionState | null> {
  try {
    const raw = await fsp.readFile(sessionStatePath(projectRoot), "utf8");
    const parsed = SessionStateSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function writeSessionState(
  projectRoot: string,
  state: SessionState,
): Promise<void> {
  const p = sessionStatePath(projectRoot);
  await fsp.mkdir(path.dirname(p), { recursive: true });
  const tmp = p + ".tmp";
  await fsp.writeFile(tmp, JSON.stringify(state));
  await fsp.rename(tmp, p);
}

export async function updateSessionState(
  projectRoot: string,
  fn: (prev: SessionState) => SessionState,
): Promise<SessionState> {
  const prev = await readSessionState(projectRoot);
  if (!prev) throw new Error("session-state.json missing — call orra_resume first");
  const next = SessionStateSchema.parse(fn(prev));
  await writeSessionState(projectRoot, next);
  return next;
}
