import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { checkResumeGate } from "../../../src/core/resume-gate.js";
import { writeCurrentSession } from "../../../src/core/session-id.js";
import { writeSessionState, initialSessionState } from "../../../src/core/session-state.js";

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "orra-gate-"));
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe("resume-gate", () => {
  it("bootstrap mode: passes when no session-state file exists at all", async () => {
    const r = await checkResumeGate(tmp);
    expect(r.ok).toBe(true);
    expect(r.bootstrap).toBe(true);
  });

  it("fails when session-state session_id differs from current-session", async () => {
    await writeCurrentSession(tmp, { session_id: "s2", started_at: "2026-04-20T12:00:00Z" });
    await writeSessionState(
      tmp,
      initialSessionState({ session_id: "s1", now: "2026-04-20T09:00:00Z" }),
    );
    const r = await checkResumeGate(tmp);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("resume_required");
  });

  it("passes when session-state session_id matches current-session", async () => {
    await writeCurrentSession(tmp, { session_id: "s1", started_at: "2026-04-20T12:00:00Z" });
    await writeSessionState(tmp, {
      ...initialSessionState({ session_id: "s1", now: "2026-04-20T12:00:05Z" }),
    });
    const r = await checkResumeGate(tmp);
    expect(r.ok).toBe(true);
    expect(r.bootstrap).toBe(false);
  });

  it("passes when no current-session but session-state exists (pre-hook install)", async () => {
    await writeSessionState(
      tmp,
      initialSessionState({ session_id: "s1", now: "2026-04-20T09:00:00Z" }),
    );
    const r = await checkResumeGate(tmp);
    expect(r.ok).toBe(true);
  });
});
