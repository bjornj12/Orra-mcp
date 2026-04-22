import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { handleOrraCacheWrite, orraCacheWriteSchema } from "../../../src/tools/orra-cache-write.js";
import { handleOrraResume, orraResumeSchema } from "../../../src/tools/orra-resume.js";
import { writeCurrentSession } from "../../../src/core/session-id.js";

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "orra-cw-"));
  await writeCurrentSession(tmp, { session_id: "s1", started_at: new Date().toISOString() });
  await handleOrraResume(tmp, orraResumeSchema.parse({}));
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe("orra_cache_write", () => {
  it("writes cache + index + tick-log + bumps tick_count", async () => {
    const res = await handleOrraCacheWrite(tmp, orraCacheWriteSchema.parse({
      directive_id: "pr-shepherd",
      digest: "3 PRs, 1 mergeable",
      rows: [{ id: "123", state: "mergeable" }],
      index: {
        directive_id: "pr-shepherd",
        fetched_at: "2026-04-20T14:40:00Z",
        total: 1,
        facets: { state: { mergeable: 1 } },
        fields: ["id", "state"],
      },
    }));
    const body = JSON.parse(res.content[0].text);
    expect(body.ok).toBe(true);

    const cache = JSON.parse(await fs.readFile(path.join(tmp, ".orra", "cache", "pr-shepherd.json"), "utf8"));
    expect(cache.rows).toHaveLength(1);

    const index = JSON.parse(
      await fs.readFile(path.join(tmp, ".orra", "cache", "pr-shepherd.index.json"), "utf8"),
    );
    expect(index).toEqual({
      directive_id: "pr-shepherd",
      fetched_at: "2026-04-20T14:40:00Z",
      total: 1,
      facets: { state: { mergeable: 1 } },
      fields: ["id", "state"],
    });

    const log = await fs.readFile(path.join(tmp, ".orra", "tick-log.jsonl"), "utf8");
    expect(log).toContain("pr-shepherd");
    expect(log).toContain("3 PRs, 1 mergeable");

    const ss = JSON.parse(await fs.readFile(path.join(tmp, ".orra", "session-state.json"), "utf8"));
    expect(ss.tick_count).toBe(1);
  });

  it("rejects args when index.directive_id disagrees with directive_id", async () => {
    const res = await handleOrraCacheWrite(tmp, orraCacheWriteSchema.parse({
      directive_id: "pr-shepherd",
      digest: "0",
      rows: [],
      index: { directive_id: "linear-tasks", fetched_at: "t", total: 0, facets: {}, fields: [] },
    }));
    expect(res.isError).toBe(true);
    const body = JSON.parse(res.content[0].text);
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/index.directive_id/);
  });

  it("rejects args when index.total disagrees with rows.length", async () => {
    const res = await handleOrraCacheWrite(tmp, orraCacheWriteSchema.parse({
      directive_id: "pr-shepherd",
      digest: "bad-total",
      rows: [{ id: "1" }, { id: "2" }],
      index: { directive_id: "pr-shepherd", fetched_at: "t", total: 5, facets: {}, fields: ["id"] },
    }));
    expect(res.isError).toBe(true);
    const body = JSON.parse(res.content[0].text);
    expect(body.error).toMatch(/index.total/);
  });

  it("merges seen_add into session-state.seen", async () => {
    await handleOrraCacheWrite(tmp, orraCacheWriteSchema.parse({
      directive_id: "linear-tasks",
      digest: "30 tickets",
      rows: [],
      index: { directive_id: "linear-tasks", fetched_at: "t", total: 0, facets: {}, fields: [] },
      seen_add: [{ bucket: "linear_tickets", ids: ["ENG-1", "ENG-2"] }],
    }));
    const ss = JSON.parse(await fs.readFile(path.join(tmp, ".orra", "session-state.json"), "utf8"));
    expect(ss.seen.linear_tickets).toEqual(["ENG-1", "ENG-2"]);

    await handleOrraCacheWrite(tmp, orraCacheWriteSchema.parse({
      directive_id: "linear-tasks",
      digest: "32 tickets",
      rows: [],
      index: { directive_id: "linear-tasks", fetched_at: "t", total: 0, facets: {}, fields: [] },
      seen_add: [{ bucket: "linear_tickets", ids: ["ENG-2", "ENG-3"] }],
    }));
    const ss2 = JSON.parse(await fs.readFile(path.join(tmp, ".orra", "session-state.json"), "utf8"));
    expect(new Set(ss2.seen.linear_tickets)).toEqual(new Set(["ENG-1", "ENG-2", "ENG-3"]));
  });

  it("updates last_surfaced when provided", async () => {
    await handleOrraCacheWrite(tmp, orraCacheWriteSchema.parse({
      directive_id: "wait-time-recycler",
      digest: "suggested X",
      rows: [],
      index: { directive_id: "wait-time-recycler", fetched_at: "t", total: 0, facets: {}, fields: [] },
      last_surfaced: { suggestion_id: "sug_7", at: "2026-04-20T13:10:00Z" },
    }));
    const ss = JSON.parse(await fs.readFile(path.join(tmp, ".orra", "session-state.json"), "utf8"));
    expect(ss.last_surfaced["wait-time-recycler"]).toEqual({
      suggestion_id: "sug_7",
      at: "2026-04-20T13:10:00Z",
    });
  });
});
