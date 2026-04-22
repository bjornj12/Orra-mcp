import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  readSessionState,
  writeSessionState,
  updateSessionState,
  sessionStatePath,
  initialSessionState,
} from "../../../src/core/session-state.js";

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "orra-ss-"));
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe("session-state", () => {
  it("returns null when file missing", async () => {
    expect(await readSessionState(tmp)).toBeNull();
  });

  it("writes and reads a full state", async () => {
    const s = initialSessionState({ session_id: "s1", now: "2026-04-20T09:00:00Z" });
    await writeSessionState(tmp, s);
    const back = await readSessionState(tmp);
    expect(back).toMatchObject({ session_id: "s1", tick_count: 0 });
  });

  it("updateSessionState merges fields atomically", async () => {
    const s = initialSessionState({ session_id: "s1", now: "2026-04-20T09:00:00Z" });
    await writeSessionState(tmp, s);
    const next = await updateSessionState(tmp, (prev) => ({
      ...prev,
      tick_count: prev.tick_count + 1,
    }));
    expect(next.tick_count).toBe(1);
    const back = await readSessionState(tmp);
    expect(back!.tick_count).toBe(1);
  });

  it("updateSessionState on missing file throws", async () => {
    await expect(
      updateSessionState(tmp, (p) => p),
    ).rejects.toThrow();
  });

  it("throws on corrupted state so callers see the failure", async () => {
    await fs.mkdir(path.join(tmp, ".orra"), { recursive: true });
    await fs.writeFile(sessionStatePath(tmp), '{"schema_version":99}');
    await expect(readSessionState(tmp)).rejects.toThrow(/corrupted/);
  });

  it("returns null when state file is missing (ENOENT)", async () => {
    expect(await readSessionState(tmp)).toBeNull();
  });
});
