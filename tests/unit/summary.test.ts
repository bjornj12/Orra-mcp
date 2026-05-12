import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  getOrComputeSummary,
  invalidateSummary,
  CURRENT_SUMMARY_SCHEMA_VERSION,
} from "../../src/core/summary.js";
import type { AgentState } from "../../src/types.js";

let tmpDir: string;
let agentsSummaryDir: string;

const fakeAgent: AgentState = {
  id: "agent-1",
  sessionId: "192c325c-9d2f-4b11-bb54-ea933ddcb36b",
  shortId: "192c325c",
  task: "do stuff",
  branch: "feature/x",
  worktree: "/tmp/wt",
  status: "running",
  agentPersona: null,
  model: null,
  detail: null,
  tempo: null,
  createdAt: "2026-04-13T09:00:00.000Z",
  updatedAt: "2026-04-13T09:30:00.000Z",
};

async function writeTranscriptFixture(dir: string, name: string, content: string): Promise<string> {
  const filePath = path.join(dir, `${name}.jsonl`);
  await fs.writeFile(filePath, content);
  return filePath;
}

function makeTranscriptLine(text: string, timestamp = "2026-04-13T10:00:00.000Z"): string {
  return JSON.stringify({
    type: "assistant",
    message: { role: "assistant", content: [{ type: "text", text }] },
    timestamp,
  });
}

function makeToolResultLine(content: string, timestamp = "2026-04-13T10:00:00.000Z"): string {
  return JSON.stringify({
    type: "user",
    message: {
      role: "user",
      content: [{ type: "tool_result", tool_use_id: "t1", content }],
    },
    timestamp,
  });
}

function makeEditToolLine(filePath: string, timestamp = "2026-04-13T10:00:00.000Z"): string {
  return JSON.stringify({
    type: "assistant",
    message: {
      role: "assistant",
      content: [{ type: "tool_use", id: "t1", name: "Edit", input: { file_path: filePath } }],
    },
    timestamp,
  });
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "orra-summary-"));
  agentsSummaryDir = path.join(tmpDir, ".orra", "agents-summary");
  await fs.mkdir(agentsSummaryDir, { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("getOrComputeSummary — cache miss", () => {
  it("computes a summary when no summary file exists", async () => {
    const transcriptPath = await writeTranscriptFixture(
      tmpDir,
      "agent-1",
      [
        makeToolResultLine("Tests: 3 passed, 3 total"),
        makeEditToolLine("src/foo.ts"),
      ].join("\n"),
    );

    const summary = await getOrComputeSummary("agent-1", fakeAgent, {
      transcriptPath,
      stateDir: agentsSummaryDir,
      now: () => new Date("2026-04-13T10:00:00.000Z"),
    });

    expect(summary.agentId).toBe("agent-1");
    expect(summary.schemaVersion).toBe(CURRENT_SUMMARY_SCHEMA_VERSION);
    expect(summary.lastTestResult).toBe("pass");
    expect(summary.lastFileEdited).toBe("src/foo.ts");
    expect(summary.summarizedAt).toBe("2026-04-13T10:00:00.000Z");
  });

  it("writes the summary to disk as agents-summary/<id>.summary.json", async () => {
    const transcriptPath = await writeTranscriptFixture(
      tmpDir,
      "agent-1",
      makeToolResultLine("Tests: 1 failed, 2 total"),
    );
    await getOrComputeSummary("agent-1", fakeAgent, {
      transcriptPath,
      stateDir: agentsSummaryDir,
      now: () => new Date(),
    });
    const written = await fs.readFile(
      path.join(agentsSummaryDir, "agent-1.summary.json"),
      "utf-8",
    );
    const parsed = JSON.parse(written);
    expect(parsed.lastTestResult).toBe("fail");
  });

  it("returns a minimal summary when transcriptPath is missing", async () => {
    const summary = await getOrComputeSummary("agent-1", fakeAgent, {
      transcriptPath: "/no/such/file.jsonl",
      stateDir: agentsSummaryDir,
      now: () => new Date("2026-04-13T10:00:00.000Z"),
    });
    expect(summary.lastTestResult).toBe("unknown");
    expect(summary.oneLine).toBeTypeOf("string");
    expect(summary.needsAttentionScore).toBeGreaterThanOrEqual(0);
  });

  it("uses agent.detail as oneLine fallback when transcript missing", async () => {
    const agentWithDetail: AgentState = { ...fakeAgent, detail: "doing important work" };
    const summary = await getOrComputeSummary("agent-1", agentWithDetail, {
      transcriptPath: "/no/such/file.jsonl",
      stateDir: agentsSummaryDir,
      now: () => new Date("2026-04-13T10:00:00.000Z"),
    });
    expect(summary.oneLine).toContain("doing important work");
  });
});

describe("getOrComputeSummary — cache hit", () => {
  it("returns cached summary without re-parsing when transcript mtime matches", async () => {
    const transcriptPath = await writeTranscriptFixture(
      tmpDir,
      "agent-1",
      makeToolResultLine("Tests: 3 passed"),
    );

    // First call — cold, writes summary file
    const first = await getOrComputeSummary("agent-1", fakeAgent, {
      transcriptPath,
      stateDir: agentsSummaryDir,
      now: () => new Date("2026-04-13T10:00:00.000Z"),
    });

    // Capture the summary file contents
    const sumFile = path.join(agentsSummaryDir, "agent-1.summary.json");
    const firstWritten = await fs.readFile(sumFile, "utf-8");

    // Second call — should NOT rewrite the file (same mtime)
    const second = await getOrComputeSummary("agent-1", fakeAgent, {
      transcriptPath,
      stateDir: agentsSummaryDir,
      now: () => new Date("2026-04-13T10:05:00.000Z"), // different "now"
    });

    const secondWritten = await fs.readFile(sumFile, "utf-8");

    expect(secondWritten).toBe(firstWritten); // unchanged
    expect(second.summarizedAt).toBe(first.summarizedAt); // not re-timestamped
  });

  it("recomputes when transcript mtime advances", async () => {
    const transcriptPath = await writeTranscriptFixture(
      tmpDir,
      "agent-1",
      makeToolResultLine("Tests: 3 passed"),
    );

    const first = await getOrComputeSummary("agent-1", fakeAgent, {
      transcriptPath,
      stateDir: agentsSummaryDir,
      now: () => new Date("2026-04-13T10:00:00.000Z"),
    });

    // Overwrite with new content, then advance mtime deterministically so the
    // cache invalidation check sees a newer file regardless of filesystem mtime
    // granularity (avoids 20ms sleep that flakes on 1s-granularity filesystems).
    await fs.writeFile(
      transcriptPath,
      makeToolResultLine("Tests: 1 failed, 2 total"),
    );
    const futureTime = new Date(Date.now() + 2000);
    await fs.utimes(transcriptPath, futureTime, futureTime);

    const second = await getOrComputeSummary("agent-1", fakeAgent, {
      transcriptPath,
      stateDir: agentsSummaryDir,
      now: () => new Date("2026-04-13T10:05:00.000Z"),
    });

    expect(first.lastTestResult).toBe("pass");
    expect(second.lastTestResult).toBe("fail");
    expect(second.summarizedAt).toBe("2026-04-13T10:05:00.000Z");
  });
});

describe("getOrComputeSummary — cache invalidation", () => {
  it("recomputes when cached summary has an old schema version", async () => {
    const transcriptPath = await writeTranscriptFixture(
      tmpDir,
      "agent-1",
      makeToolResultLine("Tests: 3 passed"),
    );

    // Plant a summary file with old schema version
    const transcriptStat = await fs.stat(transcriptPath);
    const planted = {
      agentId: "agent-1",
      summarizedAt: "2020-01-01T00:00:00.000Z",
      logMtime: transcriptStat.mtime.toISOString(),
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
      path.join(agentsSummaryDir, "agent-1.summary.json"),
      JSON.stringify(planted),
    );

    const result = await getOrComputeSummary("agent-1", fakeAgent, {
      transcriptPath,
      stateDir: agentsSummaryDir,
      now: () => new Date("2026-04-13T10:00:00.000Z"),
    });

    expect(result.schemaVersion).toBe(CURRENT_SUMMARY_SCHEMA_VERSION);
    expect(result.lastTestResult).toBe("pass"); // recomputed fresh
  });

  it("recovers from a corrupt (non-JSON) summary file", async () => {
    const transcriptPath = await writeTranscriptFixture(
      tmpDir,
      "agent-1",
      makeToolResultLine("Tests: 3 passed"),
    );
    await fs.writeFile(
      path.join(agentsSummaryDir, "agent-1.summary.json"),
      "this is not JSON { } [",
    );

    const result = await getOrComputeSummary("agent-1", fakeAgent, {
      transcriptPath,
      stateDir: agentsSummaryDir,
      now: () => new Date("2026-04-13T10:00:00.000Z"),
    });

    expect(result.lastTestResult).toBe("pass");
    expect(result.schemaVersion).toBe(CURRENT_SUMMARY_SCHEMA_VERSION);

    // Garbage file should have been replaced with a valid one
    const after = await fs.readFile(
      path.join(agentsSummaryDir, "agent-1.summary.json"),
      "utf-8",
    );
    expect(() => JSON.parse(after)).not.toThrow();
  });
});

describe("getOrComputeSummary — scoring", () => {
  it("scores ≥ 50 when agent status is waiting (daemon blocked)", async () => {
    const transcriptPath = await writeTranscriptFixture(
      tmpDir,
      "agent-1",
      makeTranscriptLine("waiting for approval"),
    );

    const waitingAgent: AgentState = { ...fakeAgent, status: "waiting" };
    const summary = await getOrComputeSummary("agent-1", waitingAgent, {
      transcriptPath,
      stateDir: agentsSummaryDir,
      now: () => new Date(),
    });

    expect(summary.needsAttentionScore).toBeGreaterThanOrEqual(50);
    expect(summary.likelyStuckReason).toContain("waiting");
  });

  it("scores higher when loopDetected and errorPattern both present", async () => {
    // Create transcript with repeated ENOENT errors in tail
    const loopLines = Array(5).fill(
      makeTranscriptLine("ENOENT: no such file src/foo.ts"),
    ).join("\n");
    const transcriptPath = await writeTranscriptFixture(tmpDir, "agent-1", loopLines);

    const summary = await getOrComputeSummary("agent-1", fakeAgent, {
      transcriptPath,
      stateDir: agentsSummaryDir,
      now: () => new Date(fakeAgent.updatedAt),
    });

    // Loop (15) + error (15) = at least 30
    expect(summary.needsAttentionScore).toBeGreaterThanOrEqual(30);
    expect(summary.likelyStuckReason).not.toBeNull();
  });

  it("scores idle+pass as low", async () => {
    const transcriptPath = await writeTranscriptFixture(
      tmpDir,
      "agent-1",
      [
        makeToolResultLine("Tests: 3 passed, 3 total"),
        makeTranscriptLine("Done."),
      ].join("\n"),
    );

    const completedAgent: AgentState = { ...fakeAgent, status: "completed" };
    const summary = await getOrComputeSummary("agent-1", completedAgent, {
      transcriptPath,
      stateDir: agentsSummaryDir,
      now: () => new Date(fakeAgent.updatedAt),
    });

    expect(summary.needsAttentionScore).toBeLessThanOrEqual(20);
  });

  it("adds no-output penalty when running agent is idle > 10 minutes", async () => {
    const transcriptPath = await writeTranscriptFixture(
      tmpDir,
      "agent-1",
      makeTranscriptLine("doing stuff"),
    );

    const runningStale: AgentState = {
      ...fakeAgent,
      status: "running",
      updatedAt: "2026-04-13T09:00:00.000Z",
    };

    const summary = await getOrComputeSummary("agent-1", runningStale, {
      transcriptPath,
      stateDir: agentsSummaryDir,
      now: () => new Date("2026-04-13T09:30:00.000Z"), // 30 minutes later
    });

    expect(summary.needsAttentionScore).toBeGreaterThanOrEqual(20);
    expect(summary.likelyStuckReason).toMatch(/no output for \d+m/);
  });

  it("does not report 'stuck on errorPattern' for a failed agent", async () => {
    const transcriptPath = await writeTranscriptFixture(
      tmpDir,
      "agent-1",
      makeTranscriptLine("Error: ENOENT: no such file"),
    );

    const failedAgent: AgentState = { ...fakeAgent, status: "failed" };
    const summary = await getOrComputeSummary("agent-1", failedAgent, {
      transcriptPath,
      stateDir: agentsSummaryDir,
      now: () => new Date(),
    });

    expect(summary.likelyStuckReason).toBeNull();
    // Score includes errorPattern (+15) and failed (+40) = 55
    expect(summary.needsAttentionScore).toBeGreaterThanOrEqual(40);
  });

  it("still reports 'stuck on errorPattern' for a running agent", async () => {
    const transcriptPath = await writeTranscriptFixture(
      tmpDir,
      "agent-1",
      makeTranscriptLine("Error: ENOENT: no such file"),
    );

    const runningAgent: AgentState = { ...fakeAgent, status: "running" };
    const summary = await getOrComputeSummary("agent-1", runningAgent, {
      transcriptPath,
      stateDir: agentsSummaryDir,
      now: () => new Date(fakeAgent.updatedAt),
    });

    expect(summary.likelyStuckReason).toBe("stuck on ENOENT");
  });

  it("clamps score to 0–100", async () => {
    const worstLines = Array(5).fill(makeTranscriptLine("ENOENT")).join("\n");
    const transcriptPath = await writeTranscriptFixture(tmpDir, "agent-1", worstLines);

    const worstAgent: AgentState = {
      ...fakeAgent,
      status: "waiting",
      updatedAt: "2026-04-13T09:00:00.000Z",
    };

    const summary = await getOrComputeSummary("agent-1", worstAgent, {
      transcriptPath,
      stateDir: agentsSummaryDir,
      now: () => new Date("2026-04-13T10:00:00.000Z"),
    });

    expect(summary.needsAttentionScore).toBeLessThanOrEqual(100);
    expect(summary.needsAttentionScore).toBeGreaterThan(50);
  });
});

describe("invalidateSummary", () => {
  it("deletes the summary file for an agent", async () => {
    const transcriptPath = await writeTranscriptFixture(
      tmpDir,
      "agent-1",
      makeToolResultLine("Tests: 3 passed"),
    );
    await getOrComputeSummary("agent-1", fakeAgent, {
      transcriptPath,
      stateDir: agentsSummaryDir,
      now: () => new Date(),
    });

    const sumFile = path.join(agentsSummaryDir, "agent-1.summary.json");
    await expect(fs.access(sumFile)).resolves.toBeUndefined();

    await invalidateSummary("agent-1", agentsSummaryDir);

    await expect(fs.access(sumFile)).rejects.toThrow();
  });

  it("is a no-op when no summary file exists", async () => {
    await expect(invalidateSummary("nonexistent", agentsSummaryDir)).resolves.toBeUndefined();
  });
});
