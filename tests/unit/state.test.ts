import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { StateManager, recordSpawn, readSpawnLedger, readSpawn } from "../../src/core/state.js";

describe("StateManager", () => {
  let tmpDir: string;
  let state: StateManager;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "orra-test-"));
    state = new StateManager(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("init", () => {
    it("should create .orra directory structure", async () => {
      await state.init();
      expect(fs.existsSync(path.join(tmpDir, ".orra"))).toBe(true);
    });

    it("should not create config.json", async () => {
      await state.init();
      expect(fs.existsSync(path.join(tmpDir, ".orra", "config.json"))).toBe(false);
    });
  });

  describe("agent log", () => {
    beforeEach(async () => {
      await state.init();
    });

    it("should append to log and read it back", async () => {
      await state.appendLog("test-a1b2", "line 1\n");
      await state.appendLog("test-a1b2", "line 2\n");
      const log = await state.readLog("test-a1b2");
      expect(log).toBe("line 1\nline 2\n");
    });

    it("should return empty string for non-existent log", async () => {
      const log = await state.readLog("nonexistent");
      expect(log).toBe("");
    });

    it("should tail last N lines", async () => {
      await state.appendLog("test-a1b2", "line 1\nline 2\nline 3\nline 4\nline 5\n");
      const tail = await state.readLog("test-a1b2", 2);
      expect(tail).toBe("line 4\nline 5");
    });
  });

  describe("readLogRange", () => {
    beforeEach(async () => {
      await state.init();
    });

    it("should read from offset to end", async () => {
      await state.appendLog("test-a1b2", "line 1\nline 2\nline 3\n");
      const result = await state.readLogRange("test-a1b2", 7);
      expect(result.content).toBe("line 2\nline 3\n");
      expect(result.newOffset).toBe(21);
    });

    it("should return empty content if offset is at end", async () => {
      await state.appendLog("test-a1b2", "line 1\n");
      const result = await state.readLogRange("test-a1b2", 7);
      expect(result.content).toBe("");
      expect(result.newOffset).toBe(7);
    });

    it("should read from 0 on first call", async () => {
      await state.appendLog("test-a1b2", "hello\nworld\n");
      const result = await state.readLogRange("test-a1b2", 0);
      expect(result.content).toBe("hello\nworld\n");
      expect(result.newOffset).toBe(12);
    });

    it("should return offset 0 for non-existent log", async () => {
      const result = await state.readLogRange("nonexistent", 0);
      expect(result.content).toBe("");
      expect(result.newOffset).toBe(0);
    });
  });
});

describe("Spawn Ledger", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "orra-spawn-ledger-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("recordSpawn writes a JSON file at .orra/spawns/<shortId>.json", async () => {
    await recordSpawn(tmpDir, {
      shortId: "abcd1234",
      sessionId: "192c325c-9d2f-4b11-bb54-ea933ddcb36b",
      slug: "fix-flaky-test",
      task: "fix the flaky test in CI",
      reason: "CI is red on main",
      spawnedBy: "orchestrator",
    });

    const filePath = path.join(tmpDir, ".orra", "spawns", "abcd1234.json");
    expect(fs.existsSync(filePath)).toBe(true);
    const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    expect(data.shortId).toBe("abcd1234");
    expect(data.slug).toBe("fix-flaky-test");
    expect(data.reason).toBe("CI is red on main");
    expect(data.spawnedAt).toBeTruthy();
    // spawnedAt should be a valid ISO date
    expect(() => new Date(data.spawnedAt).toISOString()).not.toThrow();
  });

  it("recordSpawn creates the spawns directory if it doesn't exist", async () => {
    const spawnsDir = path.join(tmpDir, ".orra", "spawns");
    expect(fs.existsSync(spawnsDir)).toBe(false);

    await recordSpawn(tmpDir, {
      shortId: "dead1234",
      sessionId: "some-uuid",
      slug: "some-task",
      task: "do something",
      reason: "because",
      spawnedBy: "orchestrator",
    });

    expect(fs.existsSync(spawnsDir)).toBe(true);
  });

  it("readSpawnLedger returns all recorded entries", async () => {
    await recordSpawn(tmpDir, {
      shortId: "aaaa1111",
      sessionId: "uuid-a",
      slug: "task-a",
      task: "task A",
      reason: "reason A",
      spawnedBy: "orchestrator",
    });
    await recordSpawn(tmpDir, {
      shortId: "bbbb2222",
      sessionId: "uuid-b",
      slug: "task-b",
      task: "task B",
      reason: "reason B",
      spawnedBy: "orchestrator",
    });

    const entries = await readSpawnLedger(tmpDir);
    expect(entries).toHaveLength(2);
    const shortIds = entries.map((e) => e.shortId).sort();
    expect(shortIds).toEqual(["aaaa1111", "bbbb2222"]);
  });

  it("readSpawnLedger returns empty array when no spawns exist", async () => {
    const entries = await readSpawnLedger(tmpDir);
    expect(entries).toEqual([]);
  });

  it("readSpawn returns a single entry by shortId", async () => {
    await recordSpawn(tmpDir, {
      shortId: "abcd1234",
      sessionId: "uuid",
      slug: "fix-test",
      task: "fix the test",
      reason: "broken",
      spawnedBy: "orchestrator",
    });

    const entry = await readSpawn(tmpDir, "abcd1234");
    expect(entry).not.toBeNull();
    expect(entry!.shortId).toBe("abcd1234");
    expect(entry!.task).toBe("fix the test");
  });

  it("readSpawn returns null for unknown shortId", async () => {
    const entry = await readSpawn(tmpDir, "deadbeef");
    expect(entry).toBeNull();
  });

  it("readSpawnLedger is resilient to malformed JSON files", async () => {
    // Create a valid entry
    await recordSpawn(tmpDir, {
      shortId: "abcd1234",
      sessionId: "uuid",
      slug: "task",
      task: "t",
      reason: "r",
      spawnedBy: "orchestrator",
    });

    // Inject a bad file
    const spawnsDir = path.join(tmpDir, ".orra", "spawns");
    fs.writeFileSync(path.join(spawnsDir, "garbage.json"), "{not json");

    const entries = await readSpawnLedger(tmpDir);
    // Should return only the valid entry, skipping the malformed one
    expect(entries).toHaveLength(1);
    expect(entries[0].shortId).toBe("abcd1234");
  });
});
