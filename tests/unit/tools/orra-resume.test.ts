import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { handleOrraResume, orraResumeSchema } from "../../../src/tools/orra-resume.js";
import { writeCurrentSession } from "../../../src/core/session-id.js";
import { writeSessionState, initialSessionState } from "../../../src/core/session-state.js";

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "orra-resume-"));
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe("orra_resume", () => {
  it("bootstraps on first-ever call (no state)", async () => {
    await writeCurrentSession(tmp, { session_id: "s1", started_at: "2026-04-20T09:00:00Z" });
    const res = await handleOrraResume(tmp, orraResumeSchema.parse({}));
    const body = JSON.parse(res.content[0].text);
    expect(body.ok).toBe(true);
    expect(body.data.resumed).toBe(false);
    expect(body.data.session_id).toBe("s1");
  });

  it("returns resumed=true when checkpoint is recent", async () => {
    const now = Date.now();
    const recentIso = new Date(now - 60_000).toISOString();
    const startIso = new Date(now - 3600_000).toISOString();
    await writeCurrentSession(tmp, { session_id: "s-new", started_at: new Date(now).toISOString() });
    await writeSessionState(tmp, {
      ...initialSessionState({ session_id: "s-prev", now: startIso }),
      last_checkpoint_at: recentIso,
      tick_count: 42,
    });
    const res = await handleOrraResume(tmp, orraResumeSchema.parse({}));
    const body = JSON.parse(res.content[0].text);
    expect(body.ok).toBe(true);
    expect(body.data.resumed).toBe(true);
    expect(body.data.age_seconds).toBeLessThan(120);
    expect(body.data.session_id).toBe("s-new");
  });

  it("rewrites session-state with new session_id + last_resume_at", async () => {
    const startIso = new Date(Date.now() - 3600_000).toISOString();
    await writeCurrentSession(tmp, { session_id: "s-new", started_at: new Date().toISOString() });
    await writeSessionState(tmp, {
      ...initialSessionState({ session_id: "s-prev", now: startIso }),
      tick_count: 10,
    });
    await handleOrraResume(tmp, orraResumeSchema.parse({}));
    const raw = await fs.readFile(path.join(tmp, ".orra", "session-state.json"), "utf8");
    const ss = JSON.parse(raw);
    expect(ss.session_id).toBe("s-new");
    expect(ss.tick_count).toBe(10); // preserved
  });
});
