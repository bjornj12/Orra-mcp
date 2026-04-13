import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  getOrComputeSummary,
  CURRENT_SUMMARY_SCHEMA_VERSION,
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
