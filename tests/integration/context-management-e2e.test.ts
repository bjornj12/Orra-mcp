import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { handleOrraResume, orraResumeSchema } from "../../src/tools/orra-resume.js";
import { handleOrraTick, orraTickSchema } from "../../src/tools/orra-tick.js";
import { handleOrraCacheWrite, orraCacheWriteSchema } from "../../src/tools/orra-cache-write.js";
import { handleOrraCheckpoint, orraCheckpointSchema } from "../../src/tools/orra-checkpoint.js";
import { handleOrraInspect, orraInspectSchema } from "../../src/tools/orra-inspect.js";
import { runSessionStartHook } from "../../src/bin/session-start-hook.js";

describe("context management e2e", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "orra-e2e-"));
    await fs.mkdir(path.join(tmp, ".orra", "directives"), { recursive: true });
    await fs.writeFile(
      path.join(tmp, ".orra", "directives", "pr-shepherd.md"),
      `---
lean: true
cache_schema:
  fields: [number, state]
  summary_facets: [state]
escalate_when:
  - "state == mergeable"
allowed_tools: ["mcp__orra__orra_cache_write"]
---

Fetch PRs and classify.`,
    );
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("full cycle: hook → resume → tick → cache_write → inspect cache → checkpoint → re-hook → resume post-compact", async () => {
    // 1. First session start
    await runSessionStartHook({ projectRoot: tmp, sessionIdInput: "sess-1", now: new Date().toISOString() });
    const resume1 = await handleOrraResume(tmp, orraResumeSchema.parse({}));
    const resume1Body = JSON.parse(resume1.content[0].text);
    expect(resume1Body.ok).toBe(true);
    expect(resume1Body.data.resumed).toBe(false);

    // 2. Orchestrator dispatches a tick
    const tick = await handleOrraTick(tmp, orraTickSchema.parse({ directive_id: "pr-shepherd" }));
    const tickBody = JSON.parse(tick.content[0].text);
    expect(tickBody.data.mode).toBe("subagent");

    // 3. Subagent completes, writes cache
    await handleOrraCacheWrite(tmp, orraCacheWriteSchema.parse({
      directive_id: "pr-shepherd",
      digest: "3 PRs, 1 mergeable, 2 in review",
      rows: [
        { number: 1, state: "mergeable" },
        { number: 2, state: "in_review" },
        { number: 3, state: "in_review" },
      ],
      index: {
        directive_id: "pr-shepherd",
        fetched_at: new Date().toISOString(),
        total: 3,
        facets: { state: { mergeable: 1, in_review: 2 } },
        fields: ["number", "state"],
      },
    }));

    // 4. Orchestrator drills in via cache
    const inspect = await handleOrraInspect(tmp, orraInspectSchema.parse({
      target: "cache",
      id: "pr-shepherd",
      filter: { state: "mergeable" },
      fields: ["number"],
    }));
    const inspectBody = JSON.parse(inspect.content[0].text);
    expect(inspectBody.data.rows).toEqual([{ number: 1 }]);

    // 5. Checkpoint
    await handleOrraCheckpoint(tmp, orraCheckpointSchema.parse({ reason: "pressure" }));
    const resumeMdExists = await fs.stat(path.join(tmp, ".orra", "resume.md")).then(() => true).catch(() => false);
    expect(resumeMdExists).toBe(true);

    // 6. New session (simulating /compact restart)
    await runSessionStartHook({ projectRoot: tmp, sessionIdInput: "sess-2", now: new Date().toISOString() });
    const resume2 = await handleOrraResume(tmp, orraResumeSchema.parse({}));
    const resume2Body = JSON.parse(resume2.content[0].text);
    expect(resume2Body.data.resumed).toBe(true);
    expect(resume2Body.data.age_seconds).toBeLessThan(120);
    expect(resume2Body.data.resume_md).toContain("# Orra Session Resume");
    expect(resume2Body.data.session_id).toBe("sess-2");
  });
});
