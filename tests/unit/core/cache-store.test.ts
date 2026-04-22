import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  writeCache,
  readCache,
  readCacheIndex,
  queryCache,
} from "../../../src/core/cache-store.js";

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "orra-cache-"));
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe("cache-store", () => {
  it("writes cache file + index atomically", async () => {
    await writeCache(tmp, {
      directive_id: "linear-tasks",
      rows: [
        { id: "ENG-1", priority: "high", age_days: 2 },
        { id: "ENG-2", priority: "low", age_days: 9 },
      ],
      index: {
        directive_id: "linear-tasks",
        fetched_at: "2026-04-20T14:40:00Z",
        total: 2,
        facets: { priority: { high: 1, low: 1 } },
        fields: ["id", "priority", "age_days"],
      },
      fetched_at: "2026-04-20T14:40:00Z",
    });
    const cache = await readCache(tmp, "linear-tasks");
    expect(cache!.rows).toHaveLength(2);
    const idx = await readCacheIndex(tmp, "linear-tasks");
    expect(idx!.total).toBe(2);
  });

  it("returns null for missing cache", async () => {
    expect(await readCache(tmp, "nope")).toBeNull();
  });

  it("queryCache filters and projects", async () => {
    await writeCache(tmp, {
      directive_id: "d",
      rows: [
        { id: "A", p: "high", age: 1 },
        { id: "B", p: "low", age: 1 },
        { id: "C", p: "high", age: 5 },
      ],
      index: { directive_id: "d", fetched_at: "t", total: 3, facets: {}, fields: ["id", "p", "age"] },
      fetched_at: "t",
    });
    const res = await queryCache(tmp, "d", { filter: { p: "high" }, fields: ["id"] });
    expect(res.total).toBe(3);
    expect(res.returned).toBe(2);
    expect(res.rows).toEqual([{ id: "A" }, { id: "C" }]);
  });

  it("queryCache honors limit", async () => {
    await writeCache(tmp, {
      directive_id: "d",
      rows: [{ id: "A" }, { id: "B" }, { id: "C" }],
      index: { directive_id: "d", fetched_at: "t", total: 3, facets: {}, fields: ["id"] },
      fetched_at: "t",
    });
    const res = await queryCache(tmp, "d", { limit: 2 });
    expect(res.returned).toBe(2);
    expect(res.rows).toHaveLength(2);
  });
});
