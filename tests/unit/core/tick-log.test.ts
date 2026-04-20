import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { appendTickLog, readRecentTicks } from "../../../src/core/tick-log.js";

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "orra-log-"));
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe("tick-log", () => {
  it("appends entries and reads them back", async () => {
    await appendTickLog(tmp, { ts: "t1", directive_id: "d1", digest: "x", cache_bytes: 10, ok: true });
    await appendTickLog(tmp, { ts: "t2", directive_id: "d2", digest: "y", cache_bytes: 20, ok: true });
    const entries = await readRecentTicks(tmp, 10);
    expect(entries).toHaveLength(2);
    expect(entries[0].directive_id).toBe("d1");
    expect(entries[1].directive_id).toBe("d2");
  });

  it("readRecentTicks respects limit", async () => {
    for (let i = 0; i < 5; i++) {
      await appendTickLog(tmp, { ts: `t${i}`, directive_id: "d", digest: "x", cache_bytes: 0, ok: true });
    }
    const entries = await readRecentTicks(tmp, 2);
    expect(entries).toHaveLength(2);
    expect(entries[0].ts).toBe("t3");
    expect(entries[1].ts).toBe("t4");
  });

  it("readRecentTicks returns empty when file missing", async () => {
    expect(await readRecentTicks(tmp, 10)).toEqual([]);
  });

  it("skips malformed lines", async () => {
    await appendTickLog(tmp, { ts: "t1", directive_id: "d", digest: "x", cache_bytes: 0, ok: true });
    await fs.appendFile(path.join(tmp, ".orra", "tick-log.jsonl"), "garbage\n");
    await appendTickLog(tmp, { ts: "t2", directive_id: "d", digest: "y", cache_bytes: 0, ok: true });
    const entries = await readRecentTicks(tmp, 10);
    expect(entries).toHaveLength(2);
  });
});
