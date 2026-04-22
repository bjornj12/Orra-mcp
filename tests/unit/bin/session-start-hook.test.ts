import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { runSessionStartHook } from "../../../src/bin/session-start-hook.js";

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "orra-hook-"));
});
afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe("session-start hook", () => {
  it("writes current-session.json with session_id from input", async () => {
    const out = await runSessionStartHook({
      projectRoot: tmp,
      sessionIdInput: "claude-session-abc",
      now: "2026-04-20T09:00:00Z",
    });
    expect(out.wrote).toBe(true);
    const cs = JSON.parse(await fs.readFile(path.join(tmp, ".orra", "current-session.json"), "utf8"));
    expect(cs.session_id).toBe("claude-session-abc");
    expect(cs.started_at).toBe("2026-04-20T09:00:00Z");
    expect(out.additionalContext).toContain("<system-reminder>");
    expect(out.additionalContext).toContain("orra_resume");
  });

  it("generates session id when none provided", async () => {
    const out = await runSessionStartHook({ projectRoot: tmp, now: "2026-04-20T09:00:00Z" });
    const cs = JSON.parse(await fs.readFile(path.join(tmp, ".orra", "current-session.json"), "utf8"));
    expect(cs.session_id.length).toBeGreaterThan(8);
  });
});
