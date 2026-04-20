import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { handleOrraCheckpoint, orraCheckpointSchema } from "../../../src/tools/orra-checkpoint.js";
import { handleOrraResume, orraResumeSchema } from "../../../src/tools/orra-resume.js";
import { writeCurrentSession } from "../../../src/core/session-id.js";

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "orra-cp-"));
  await writeCurrentSession(tmp, { session_id: "s1", started_at: new Date().toISOString() });
  await handleOrraResume(tmp, orraResumeSchema.parse({}));
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe("orra_checkpoint", () => {
  it("updates last_checkpoint_at and writes resume.md", async () => {
    const res = await handleOrraCheckpoint(tmp, orraCheckpointSchema.parse({ reason: "pressure" }));
    const body = JSON.parse(res.content[0].text);
    expect(body.ok).toBe(true);
    expect(body.data.checkpointed).toBe(true);

    const ss = JSON.parse(await fs.readFile(path.join(tmp, ".orra", "session-state.json"), "utf8"));
    expect(ss.last_checkpoint_at).toBeTruthy();

    const md = await fs.readFile(path.join(tmp, ".orra", "resume.md"), "utf8");
    expect(md).toContain("# Orra Session Resume");
  });

  it("appends notes to directive_notes when provided", async () => {
    await handleOrraCheckpoint(
      tmp,
      orraCheckpointSchema.parse({ reason: "pressure", notes: "mid-rebase ENG-412" }),
    );
    const ss = JSON.parse(await fs.readFile(path.join(tmp, ".orra", "session-state.json"), "utf8"));
    expect(ss.directive_notes._checkpoint).toContain("mid-rebase ENG-412");
  });

  it("returns a human-readable status string", async () => {
    const res = await handleOrraCheckpoint(tmp, orraCheckpointSchema.parse({}));
    const body = JSON.parse(res.content[0].text);
    expect(body.data.message).toContain("checkpointed");
    expect(body.data.message).toContain(".orra/session-state.json");
  });
});
