import { readCurrentSession } from "./session-id.js";
import { readSessionState } from "./session-state.js";

export type GateResult =
  | { ok: true; bootstrap: boolean }
  | { ok: false; reason: "resume_required"; hint: string };

export async function checkResumeGate(projectRoot: string): Promise<GateResult> {
  const state = await readSessionState(projectRoot);
  if (!state) return { ok: true, bootstrap: true };

  const current = await readCurrentSession(projectRoot);
  if (!current) return { ok: true, bootstrap: false };

  if (state.session_id !== current.session_id) {
    return {
      ok: false,
      reason: "resume_required",
      hint: "Call orra_resume() first — new session detected, handshake required.",
    };
  }
  return { ok: true, bootstrap: false };
}
