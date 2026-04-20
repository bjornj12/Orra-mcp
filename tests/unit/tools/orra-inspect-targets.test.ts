import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { handleOrraInspect, orraInspectSchema } from "../../../src/tools/orra-inspect.js";
import { writeCache } from "../../../src/core/cache-store.js";
import { handleOrraResume, orraResumeSchema } from "../../../src/tools/orra-resume.js";
import { writeCurrentSession } from "../../../src/core/session-id.js";

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "orra-ins-"));
  await writeCurrentSession(tmp, { session_id: "s1", started_at: new Date().toISOString() });
  await handleOrraResume(tmp, orraResumeSchema.parse({}));
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe("orra_inspect — targets", () => {
  it("target:'session' returns pressure and tick state", async () => {
    const res = await handleOrraInspect(tmp, orraInspectSchema.parse({ target: "session" }));
    const body = JSON.parse(res.content[0].text);
    expect(body.ok).toBe(true);
    expect(body.data.tick_count).toBe(0);
    expect(body.data.pressure).toHaveProperty("score");
    expect(body.data.pressure).toHaveProperty("recommend_compact");
  });

  it("target:'cache' returns filtered rows", async () => {
    await writeCache(tmp, {
      directive_id: "d",
      rows: [
        { id: "A", p: "high" },
        { id: "B", p: "low" },
        { id: "C", p: "high" },
      ],
      index: { directive_id: "d", fetched_at: "t", total: 3, facets: {}, fields: ["id", "p"] },
      fetched_at: "t",
    });
    const res = await handleOrraInspect(tmp, orraInspectSchema.parse({
      target: "cache",
      id: "d",
      filter: { p: "high" },
      fields: ["id"],
    }));
    const body = JSON.parse(res.content[0].text);
    expect(body.ok).toBe(true);
    expect(body.data.total).toBe(3);
    expect(body.data.returned).toBe(2);
    expect(body.data.rows).toEqual([{ id: "A" }, { id: "C" }]);
  });

  it("target:'worktree' with id delegates to existing inspectOne (smoke)", async () => {
    // Fake a minimal git state by pointing at a fresh repo-free dir.
    // We just assert the tool routes correctly; deep worktree behavior is tested elsewhere.
    const res = await handleOrraInspect(tmp, orraInspectSchema.parse({ target: "worktree", id: "nonexistent" }));
    const body = JSON.parse(res.content[0].text);
    expect(body.ok).toBe(false);
  });

  it("defaults target:'worktree' when only a string arg is given (back-compat)", async () => {
    // Legacy shape: { worktree: "x" } — we preserve by coercing in handler.
    const res = await handleOrraInspect(tmp, orraInspectSchema.parse({ worktree: "legacy-id" } as any));
    const body = JSON.parse(res.content[0].text);
    expect(body.ok).toBe(false); // still resolves to the worktree path which doesn't exist; what we want is the routing
  });
});
