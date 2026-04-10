import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { execSync } from "node:child_process";
import { classify, readGitState, scanMarkers, readAgentState } from "../../src/core/awareness.js";
import type { GitState, AgentState, PrState } from "../../src/types.js";

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
  task: "do something",
  branch: "orra/agent-abc",
  worktree: "worktrees/agent-abc",
  pid: 99999999,
  status: "running",
  agentPersona: null,
  model: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  exitCode: null,
  pendingQuestion: null,
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

  it("needs_attention: agent has pending question", () => {
    const agent: AgentState = {
      ...baseAgent,
      pendingQuestion: { tool: "Bash", input: { command: "rm -rf /" } },
    };
    const result = classify(baseGit, agent, null, opts);
    expect(result.status).toBe("needs_attention");
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

  it("in_progress: idle agent", () => {
    const agent: AgentState = { ...baseAgent, status: "idle" };
    const result = classify(baseGit, agent, null, opts);
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

  it("pending question takes priority over PR approval", () => {
    const agent: AgentState = {
      ...baseAgent,
      pendingQuestion: { tool: "Edit", input: { path: "/etc/passwd" } },
    };
    const result = classify(baseGit, agent, approvedPr, opts);
    expect(result.status).toBe("needs_attention");
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

// ─── readAgentState ───────────────────────────────────────────────────────────

describe("readAgentState", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "orra-agent-test-"));
    fs.mkdirSync(path.join(tmpDir, ".orra", "agents"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns null for missing file", async () => {
    const result = await readAgentState(tmpDir, "nonexistent-agent");
    expect(result).toBeNull();
  });

  it("reads agent state from file", async () => {
    const agentData: AgentState = {
      id: "test-agent",
      task: "build something",
      branch: "orra/test-agent",
      worktree: "worktrees/test-agent",
      pid: process.pid, // use current PID so it's alive
      status: "running",
      agentPersona: null,
      model: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      exitCode: null,
      pendingQuestion: null,
    };
    fs.writeFileSync(
      path.join(tmpDir, ".orra", "agents", "test-agent.json"),
      JSON.stringify(agentData)
    );

    const result = await readAgentState(tmpDir, "test-agent");
    expect(result).not.toBeNull();
    expect(result!.id).toBe("test-agent");
    expect(result!.status).toBe("running"); // PID is alive (current process)
  });

  it("corrects dead PID running agent to interrupted", async () => {
    const agentData: AgentState = {
      id: "dead-agent",
      task: "some task",
      branch: "orra/dead-agent",
      worktree: "worktrees/dead-agent",
      pid: 99999999, // definitely dead
      status: "running",
      agentPersona: null,
      model: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      exitCode: null,
      pendingQuestion: null,
    };
    fs.writeFileSync(
      path.join(tmpDir, ".orra", "agents", "dead-agent.json"),
      JSON.stringify(agentData)
    );

    const result = await readAgentState(tmpDir, "dead-agent");
    expect(result).not.toBeNull();
    expect(result!.status).toBe("interrupted");
  });

  it("does not modify status of completed agent with dead PID", async () => {
    const agentData: AgentState = {
      id: "done-agent",
      task: "task done",
      branch: "orra/done-agent",
      worktree: "worktrees/done-agent",
      pid: 99999999, // dead, but completed
      status: "completed",
      agentPersona: null,
      model: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      exitCode: 0,
      pendingQuestion: null,
    };
    fs.writeFileSync(
      path.join(tmpDir, ".orra", "agents", "done-agent.json"),
      JSON.stringify(agentData)
    );

    const result = await readAgentState(tmpDir, "done-agent");
    expect(result).not.toBeNull();
    expect(result!.status).toBe("completed");
  });

  it("reads agent with pending question", async () => {
    const agentData: AgentState = {
      id: "question-agent",
      task: "dangerous task",
      branch: "orra/question-agent",
      worktree: "worktrees/question-agent",
      pid: process.pid,
      status: "running",
      agentPersona: null,
      model: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      exitCode: null,
      pendingQuestion: {
        tool: "Bash",
        input: { command: "rm -rf /" },
      },
    };
    fs.writeFileSync(
      path.join(tmpDir, ".orra", "agents", "question-agent.json"),
      JSON.stringify(agentData)
    );

    const result = await readAgentState(tmpDir, "question-agent");
    expect(result).not.toBeNull();
    expect(result!.pendingQuestion).not.toBeNull();
    expect(result!.pendingQuestion!.tool).toBe("Bash");
  });
});
