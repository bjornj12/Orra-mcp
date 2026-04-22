import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { gateOrPass } from "../../../src/server.js";
import { writeCurrentSession } from "../../../src/core/session-id.js";
import { writeSessionState, initialSessionState } from "../../../src/core/session-state.js";

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "orra-gt-"));
});
afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe("gateOrPass", () => {
  it("returns resume_required envelope when gate fails", async () => {
    await writeCurrentSession(tmp, { session_id: "s2", started_at: new Date().toISOString() });
    await writeSessionState(tmp, initialSessionState({ session_id: "s1", now: new Date().toISOString() }));
    const r = await gateOrPass(tmp, async () => ({ content: [{ type: "text" as const, text: "unreachable" }] }));
    const body = JSON.parse(r.content[0].text);
    expect(body.ok).toBe(false);
    expect(body.error).toBe("resume_required");
  });

  it("invokes handler when gate passes", async () => {
    await writeCurrentSession(tmp, { session_id: "s1", started_at: new Date().toISOString() });
    await writeSessionState(tmp, initialSessionState({ session_id: "s1", now: new Date().toISOString() }));
    const r = await gateOrPass(tmp, async () => ({ content: [{ type: "text" as const, text: "ran" }] }));
    expect(r.content[0].text).toBe("ran");
  });

  it("bootstrap passes through", async () => {
    const r = await gateOrPass(tmp, async () => ({ content: [{ type: "text" as const, text: "ran" }] }));
    expect(r.content[0].text).toBe("ran");
  });
});
