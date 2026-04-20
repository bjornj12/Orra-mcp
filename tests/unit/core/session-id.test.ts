import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  writeCurrentSession,
  readCurrentSession,
  currentSessionPath,
} from "../../../src/core/session-id.js";

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "orra-sid-"));
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe("session-id", () => {
  it("writes and reads current-session atomically", async () => {
    await writeCurrentSession(tmp, { session_id: "abc123", started_at: "2026-04-20T09:00:00Z" });
    const s = await readCurrentSession(tmp);
    expect(s).toEqual({ session_id: "abc123", started_at: "2026-04-20T09:00:00Z" });
  });

  it("returns null when file missing", async () => {
    expect(await readCurrentSession(tmp)).toBeNull();
  });

  it("returns null on malformed JSON", async () => {
    await fs.mkdir(path.join(tmp, ".orra"), { recursive: true });
    await fs.writeFile(currentSessionPath(tmp), "{not json");
    expect(await readCurrentSession(tmp)).toBeNull();
  });
});
