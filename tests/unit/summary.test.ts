import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  getOrComputeSummary,
  CURRENT_SUMMARY_SCHEMA_VERSION,
  MAX_TAIL_BYTES,
} from "../../src/core/summary.js";
import type { AgentState } from "../../src/types.js";

let tmpDir: string;
let agentsDir: string;

const fakeAgent: AgentState = {
  id: "agent-1",
  task: "do stuff",
  branch: "feature/x",
  worktree: "/tmp/wt",
  pid: 99999,
  status: "running",
  agentPersona: null,
  model: null,
  createdAt: "2026-04-13T09:00:00.000Z",
  updatedAt: "2026-04-13T09:30:00.000Z",
  exitCode: null,
  pendingQuestion: null,
};

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "orra-summary-"));
  agentsDir = path.join(tmpDir, "agents");
  await fs.mkdir(agentsDir, { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("getOrComputeSummary — cache miss", () => {
  it("computes a summary when no summary file exists", async () => {
    const logPath = path.join(agentsDir, "agent-1.log");
    await fs.writeFile(logPath, "building...\nTests: 3 passed\nmodified: src/foo.ts");

    const summary = await getOrComputeSummary("agent-1", fakeAgent, {
      stateDir: agentsDir,
      now: () => new Date("2026-04-13T10:00:00.000Z"),
    });

    expect(summary.agentId).toBe("agent-1");
    expect(summary.schemaVersion).toBe(CURRENT_SUMMARY_SCHEMA_VERSION);
    expect(summary.lastTestResult).toBe("pass");
    expect(summary.lastFileEdited).toBe("src/foo.ts");
    expect(summary.summarizedAt).toBe("2026-04-13T10:00:00.000Z");
  });

  it("writes the summary to disk as <id>.summary.json", async () => {
    await fs.writeFile(path.join(agentsDir, "agent-1.log"), "Tests: 1 failed");
    await getOrComputeSummary("agent-1", fakeAgent, {
      stateDir: agentsDir,
      now: () => new Date(),
    });
    const written = await fs.readFile(path.join(agentsDir, "agent-1.summary.json"), "utf-8");
    const parsed = JSON.parse(written);
    expect(parsed.lastTestResult).toBe("fail");
  });

  it("returns a minimal summary when the log file is missing", async () => {
    const summary = await getOrComputeSummary("agent-1", fakeAgent, {
      stateDir: agentsDir,
      now: () => new Date("2026-04-13T10:00:00.000Z"),
    });
    expect(summary.lastTestResult).toBe("unknown");
    expect(summary.oneLine).toBeTypeOf("string");
    expect(summary.needsAttentionScore).toBeGreaterThanOrEqual(0);
  });
});

describe("getOrComputeSummary — cache hit", () => {
  it("returns cached summary without re-parsing when log mtime matches", async () => {
    const logFile = path.join(agentsDir, "agent-1.log");
    await fs.writeFile(logFile, "Tests: 3 passed");

    // First call — cold, writes summary file
    const first = await getOrComputeSummary("agent-1", fakeAgent, {
      stateDir: agentsDir,
      now: () => new Date("2026-04-13T10:00:00.000Z"),
    });

    // Capture the summary file's contents
    const sumFile = path.join(agentsDir, "agent-1.summary.json");
    const firstWritten = await fs.readFile(sumFile, "utf-8");

    // Second call — should NOT rewrite the file
    const second = await getOrComputeSummary("agent-1", fakeAgent, {
      stateDir: agentsDir,
      now: () => new Date("2026-04-13T10:05:00.000Z"), // different "now"
    });

    const secondWritten = await fs.readFile(sumFile, "utf-8");

    expect(secondWritten).toBe(firstWritten); // unchanged
    expect(second.summarizedAt).toBe(first.summarizedAt); // not re-timestamped
  });

  it("recomputes when log mtime advances", async () => {
    const logFile = path.join(agentsDir, "agent-1.log");
    await fs.writeFile(logFile, "Tests: 3 passed");

    const first = await getOrComputeSummary("agent-1", fakeAgent, {
      stateDir: agentsDir,
      now: () => new Date("2026-04-13T10:00:00.000Z"),
    });

    // Wait a tick, then touch the log with new content
    await new Promise((r) => setTimeout(r, 20));
    await fs.writeFile(logFile, "Tests: 3 passed\nTests: 1 failed");

    const second = await getOrComputeSummary("agent-1", fakeAgent, {
      stateDir: agentsDir,
      now: () => new Date("2026-04-13T10:05:00.000Z"),
    });

    expect(first.lastTestResult).toBe("pass");
    expect(second.lastTestResult).toBe("fail");
    expect(second.summarizedAt).toBe("2026-04-13T10:05:00.000Z");
  });
});

describe("getOrComputeSummary — invalidation", () => {
  it("recomputes when cached summary has an old schema version", async () => {
    const logFile = path.join(agentsDir, "agent-1.log");
    await fs.writeFile(logFile, "Tests: 3 passed");

    // Plant a summary file with an intentionally old schema version
    const planted = {
      agentId: "agent-1",
      summarizedAt: "2020-01-01T00:00:00.000Z",
      logMtime: (await fs.stat(logFile)).mtime.toISOString(),
      schemaVersion: 0, // stale
      oneLine: "stale summary",
      needsAttentionScore: 0,
      likelyStuckReason: null,
      lastTestResult: "unknown",
      lastFileEdited: null,
      lastActivityAt: null,
      tailLines: [],
    };
    await fs.writeFile(
      path.join(agentsDir, "agent-1.summary.json"),
      JSON.stringify(planted),
    );

    const result = await getOrComputeSummary("agent-1", fakeAgent, {
      stateDir: agentsDir,
      now: () => new Date("2026-04-13T10:00:00.000Z"),
    });

    expect(result.schemaVersion).toBe(CURRENT_SUMMARY_SCHEMA_VERSION);
    expect(result.lastTestResult).toBe("pass"); // recomputed fresh
  });

  it("recovers from a corrupt (non-JSON) summary file", async () => {
    const logFile = path.join(agentsDir, "agent-1.log");
    await fs.writeFile(logFile, "Tests: 3 passed");
    await fs.writeFile(
      path.join(agentsDir, "agent-1.summary.json"),
      "this is not JSON { } [",
    );

    const result = await getOrComputeSummary("agent-1", fakeAgent, {
      stateDir: agentsDir,
      now: () => new Date("2026-04-13T10:00:00.000Z"),
    });

    expect(result.lastTestResult).toBe("pass");
    expect(result.schemaVersion).toBe(CURRENT_SUMMARY_SCHEMA_VERSION);

    // And the garbage file should have been replaced with a valid one
    const after = await fs.readFile(path.join(agentsDir, "agent-1.summary.json"), "utf-8");
    expect(() => JSON.parse(after)).not.toThrow();
  });
});

describe("getOrComputeSummary — bounded tail read", () => {
  it("only reads the last MAX_TAIL_BYTES of a huge log", async () => {
    const logFile = path.join(agentsDir, "agent-1.log");

    // Write 200KB of filler followed by a test-result marker at the end
    const filler = "x".repeat(200 * 1024);
    const body = filler + "\nTests: 1 failed\n";
    await fs.writeFile(logFile, body);

    const stat = await fs.stat(logFile);
    expect(stat.size).toBeGreaterThan(MAX_TAIL_BYTES);

    const result = await getOrComputeSummary("agent-1", fakeAgent, {
      stateDir: agentsDir,
      now: () => new Date("2026-04-13T10:00:00.000Z"),
    });

    // The marker is within the tail window → should still be detected
    expect(result.lastTestResult).toBe("fail");
  });

  it("works when the log is smaller than MAX_TAIL_BYTES", async () => {
    const logFile = path.join(agentsDir, "agent-1.log");
    await fs.writeFile(logFile, "Tests: 3 passed");

    const result = await getOrComputeSummary("agent-1", fakeAgent, {
      stateDir: agentsDir,
      now: () => new Date(),
    });

    expect(result.lastTestResult).toBe("pass");
  });
});
