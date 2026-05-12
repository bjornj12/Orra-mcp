import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execSync } from "node:child_process";
import { classify, readGitState, scanMarkers } from "../../src/core/awareness.js";
import type { GitState, AgentState, PrState, AgentSummary } from "../../src/types.js";

// ─── classify ────────────────────────────────────────────────────────────────

const baseGit: GitState = {
  ahead: 3,
  behind: 0,
  uncommitted: 0,
  lastCommit: new Date().toISOString(),
  diffStat: "5 files changed",
};

const recentGit: GitState = {
  ...baseGit,
  lastCommit: new Date().toISOString(),
};

const oldGit: GitState = {
  ...baseGit,
  // 5 days ago
  lastCommit: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
};

const baseAgent: AgentState = {
  id: "agent-abc",
  sessionId: "192c325c-9d2f-4b11-bb54-ea933ddcb36b",
  shortId: "192c325c",
  task: "do something",
  branch: "orra/agent-abc",
  worktree: "worktrees/agent-abc",
  status: "running",
  agentPersona: null,
  model: null,
  detail: null,
  tempo: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const approvedPr: PrState = {
  number: 42,
  state: "open",
  reviews: "approved",
  ci: "success",
  mergeable: true,
};

const opts = { staleDays: 3, driftThreshold: 20 };

describe("classify", () => {
  it("ready_to_land: approved PR + CI green + low drift", () => {
    const result = classify(baseGit, null, approvedPr, opts);
    expect(result.status).toBe("ready_to_land");
    expect(result.flags).not.toContain("high_drift");
  });

  it("needs_attention: CI failing", () => {
    const pr: PrState = { ...approvedPr, ci: "failure" };
    const result = classify(baseGit, null, pr, opts);
    expect(result.status).toBe("needs_attention");
  });

  it("needs_attention: changes_requested review", () => {
    const pr: PrState = { ...approvedPr, reviews: "changes_requested" };
    const result = classify(baseGit, null, pr, opts);
    expect(result.status).toBe("needs_attention");
  });

  it("in_progress: running agent", () => {
    const result = classify(baseGit, baseAgent, null, opts);
    expect(result.status).toBe("in_progress");
  });

  it("idle: no agent, recent activity", () => {
    const result = classify(recentGit, null, null, opts);
    expect(result.status).toBe("idle");
  });

  it("stale: no agent, old activity (5 days with staleDays=3)", () => {
    const result = classify(oldGit, null, null, opts);
    expect(result.status).toBe("stale");
  });

  it("high_drift flag: behind > threshold", () => {
    const highDriftGit: GitState = { ...baseGit, behind: 25 };
    const result = classify(highDriftGit, null, null, opts);
    expect(result.flags).toContain("high_drift");
  });

  it("no high_drift flag when behind <= threshold", () => {
    const lowDriftGit: GitState = { ...baseGit, behind: 10 };
    const result = classify(lowDriftGit, null, null, opts);
    expect(result.flags).not.toContain("high_drift");
  });

  it("ready_to_land requires behind <= 5", () => {
    const behindGit: GitState = { ...baseGit, behind: 6 };
    const result = classify(behindGit, null, approvedPr, opts);
    // Not ready_to_land because behind > 5
    expect(result.status).not.toBe("ready_to_land");
  });
});

describe("classify with provider flags", () => {
  it("should classify as needs_attention when flags include blocked", () => {
    const git: GitState = { ahead: 3, behind: 0, uncommitted: 0, lastCommit: new Date().toISOString(), diffStat: "" };
    const result = classify(git, null, null, { staleDays: 3, driftThreshold: 20 }, null, ["blocked"]);
    expect(result.status).toBe("needs_attention");
    expect(result.flags).toContain("blocked");
  });

  it("should classify as ready_to_land when flags include ready", () => {
    const git: GitState = { ahead: 3, behind: 0, uncommitted: 0, lastCommit: new Date().toISOString(), diffStat: "" };
    const result = classify(git, null, null, { staleDays: 3, driftThreshold: 20 }, null, ["ready"]);
    expect(result.status).toBe("ready_to_land");
    expect(result.flags).toContain("ready");
  });

  it("should pass through provider flags to result", () => {
    const git: GitState = { ahead: 3, behind: 0, uncommitted: 0, lastCommit: new Date().toISOString(), diffStat: "" };
    const result = classify(git, null, null, { staleDays: 3, driftThreshold: 20 }, null, ["custom_flag"]);
    expect(result.flags).toContain("custom_flag");
  });
});

describe("classify with stage scoring", () => {
  it("should classify as needs_attention when stage score is below 85", () => {
    const git: GitState = { ahead: 3, behind: 0, uncommitted: 0, lastCommit: new Date().toISOString(), diffStat: "" };
    const stage = { name: "review", metadata: { score: 62 } };
    const result = classify(git, null, null, { staleDays: 3, driftThreshold: 20 }, stage);
    expect(result.status).toBe("needs_attention");
    expect(result.flags).toContain("low_score");
  });

  it("should not trigger low_score when stage has no score", () => {
    const git: GitState = { ahead: 3, behind: 0, uncommitted: 0, lastCommit: new Date().toISOString(), diffStat: "" };
    const stage = { name: "review" };
    const result = classify(git, null, null, { staleDays: 3, driftThreshold: 20 }, stage);
    expect(result.status).toBe("idle");
  });

  it("should not trigger low_score when score is 85 or above", () => {
    const git: GitState = { ahead: 3, behind: 0, uncommitted: 0, lastCommit: new Date().toISOString(), diffStat: "" };
    const stage = { name: "review", metadata: { score: 90 } };
    const result = classify(git, null, null, { staleDays: 3, driftThreshold: 20 }, stage);
    expect(result.status).toBe("idle");
  });
});

// ─── readGitState ─────────────────────────────────────────────────────────────

describe("readGitState", () => {
  let repoDir: string;
  let worktreeDir: string;

  beforeEach(() => {
    repoDir = fs.mkdtempSync(path.join(os.tmpdir(), "orra-awareness-test-"));
    execSync("git init", { cwd: repoDir });
    execSync('git config user.email "test@test.com"', { cwd: repoDir });
    execSync('git config user.name "Test"', { cwd: repoDir });
    execSync("git commit --allow-empty -m 'init'", { cwd: repoDir });

    // Create a worktree branch with 1 commit
    worktreeDir = path.join(repoDir, "worktrees", "test-agent");
    execSync(`git worktree add -b orra/test-agent ${worktreeDir}`, { cwd: repoDir });
    // Make a commit in the worktree
    fs.writeFileSync(path.join(worktreeDir, "feature.txt"), "hello");
    execSync("git add feature.txt && git commit -m 'add feature'", { cwd: worktreeDir });
  });

  afterEach(() => {
    try {
      execSync("git worktree prune", { cwd: repoDir });
    } catch {}
    fs.rmSync(repoDir, { recursive: true, force: true });
  });

  it("reads git state for a worktree with 1 commit ahead", async () => {
    const state = await readGitState(worktreeDir, repoDir);
    expect(state.ahead).toBe(1);
    expect(state.behind).toBe(0);
    expect(state.lastCommit).toBeTruthy();
    expect(typeof state.lastCommit).toBe("string");
  });

  it("counts uncommitted changes", async () => {
    // Add an uncommitted file
    fs.writeFileSync(path.join(worktreeDir, "uncommitted.txt"), "pending");
    execSync("git add uncommitted.txt", { cwd: worktreeDir });

    const state = await readGitState(worktreeDir, repoDir);
    expect(state.uncommitted).toBeGreaterThanOrEqual(1);
  });
});

// ─── scanMarkers ──────────────────────────────────────────────────────────────

describe("scanMarkers", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "orra-markers-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("finds matching files", async () => {
    fs.writeFileSync(path.join(tmpDir, "spec.md"), "# spec");
    fs.writeFileSync(path.join(tmpDir, "PLAN.md"), "# plan");

    const markers = ["spec.md", "PRD.md", "PLAN.md", "CHANGELOG.md"];
    const found = await scanMarkers(tmpDir, markers);

    expect(found).toContain("spec.md");
    expect(found).toContain("PLAN.md");
    expect(found).not.toContain("PRD.md");
    expect(found).not.toContain("CHANGELOG.md");
  });

  it("returns empty array when no markers found", async () => {
    const markers = ["spec.md", "PRD.md", "PLAN.md", "CHANGELOG.md"];
    const found = await scanMarkers(tmpDir, markers);
    expect(found).toEqual([]);
  });

  it("handles empty markers list", async () => {
    const found = await scanMarkers(tmpDir, []);
    expect(found).toEqual([]);
  });
});

// ─── classify — summary-driven escalation ────────────────────────────────────

describe("classify — summary-driven escalation", () => {
  const agent: AgentState = {
    id: "a",
    sessionId: "uuid-a",
    shortId: "short-a",
    task: "t",
    branch: "b",
    worktree: "/w",
    status: "running",
    agentPersona: null,
    model: null,
    detail: null,
    tempo: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const passingSummary: AgentSummary = {
    agentId: "a", summarizedAt: new Date().toISOString(),
    logMtime: new Date().toISOString(), schemaVersion: 1,
    oneLine: "running tests", needsAttentionScore: 10,
    likelyStuckReason: null, lastTestResult: "pass",
    lastFileEdited: null, lastActivityAt: null, tailLines: [],
  };

  const stuckSummary: AgentSummary = {
    ...passingSummary,
    needsAttentionScore: 75,
    likelyStuckReason: "loop: same line × 5 in tail",
    lastTestResult: "fail",
  };

  it("in_progress when summary is healthy", () => {
    const { status } = classify(recentGit, agent, null,
      { staleDays: 3, driftThreshold: 20 }, null, [], passingSummary);
    expect(status).toBe("in_progress");
  });

  it("needs_attention when summary score ≥ 60", () => {
    const { status } = classify(recentGit, agent, null,
      { staleDays: 3, driftThreshold: 20 }, null, [], stuckSummary);
    expect(status).toBe("needs_attention");
  });

  it("needs_attention when likelyStuckReason is set even if score is low", () => {
    const { status } = classify(recentGit, agent, null,
      { staleDays: 3, driftThreshold: 20 }, null, [],
      { ...passingSummary, needsAttentionScore: 20, likelyStuckReason: "no output for 12m" });
    expect(status).toBe("needs_attention");
  });
});
