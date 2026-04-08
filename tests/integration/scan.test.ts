import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execSync } from "node:child_process";
import { scanAll } from "../../src/core/awareness.js";

describe("Scan Pipeline (integration)", () => {
  let tmpDir: string;

  beforeEach(() => {
    // Use realpathSync to resolve macOS /var → /private/var symlink so git worktree
    // path comparison in scanAll works correctly.
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "orra-scan-integ-")));
    execSync("git init", { cwd: tmpDir });
    execSync('git config user.email "test@test.com"', { cwd: tmpDir });
    execSync('git config user.name "Test User"', { cwd: tmpDir });
    execSync("git commit --allow-empty -m 'init'", { cwd: tmpDir });
    fs.mkdirSync(path.join(tmpDir, ".orra", "agents"), { recursive: true });
  });

  afterEach(() => {
    try { execSync("git worktree prune", { cwd: tmpDir }); } catch {}
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // Test 1: Empty scan
  it("should return empty scan when no worktrees exist", async () => {
    const result = await scanAll(tmpDir);
    expect(result.worktrees).toHaveLength(0);
    expect(result.summary.total).toBe(0);
  });

  // Test 2: Scan worktree with commits → idle
  it("should scan a worktree with commits", async () => {
    const wtPath = path.join(tmpDir, "worktrees", "test-feature");
    execSync(`git worktree add ${wtPath} -b feat/test-feature`, { cwd: tmpDir });
    fs.writeFileSync(path.join(wtPath, "feature.ts"), "export const x = 1;");
    execSync("git add feature.ts && git commit -m 'add feature'", { cwd: wtPath });

    const result = await scanAll(tmpDir);
    expect(result.worktrees).toHaveLength(1);
    expect(result.worktrees[0].id).toBe("test-feature");
    expect(result.worktrees[0].branch).toBe("feat/test-feature");
    expect(result.worktrees[0].git.ahead).toBe(1);
    expect(result.worktrees[0].status).toBe("idle");
    expect(result.summary.idle).toBe(1);
  });

  // Test 3: Stale worktree
  it("should detect stale worktrees", async () => {
    const wtPath = path.join(tmpDir, "worktrees", "old-thing");
    execSync(`git worktree add ${wtPath} -b feat/old-thing`, { cwd: tmpDir });
    fs.writeFileSync(path.join(wtPath, "old.ts"), "export const old = true;");
    execSync("git add old.ts && git commit -m 'old commit'", { cwd: wtPath });

    // Backdate the commit
    const oldDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    execSync(`git commit --amend --no-edit --date "${oldDate}"`, {
      cwd: wtPath,
      env: { ...process.env, GIT_COMMITTER_DATE: oldDate },
    });

    fs.writeFileSync(path.join(tmpDir, ".orra", "config.json"), JSON.stringify({ staleDays: 3 }));

    const result = await scanAll(tmpDir);
    expect(result.worktrees[0].status).toBe("stale");
    expect(result.summary.stale).toBe(1);
  });

  // Test 4: File markers
  it("should detect file markers", async () => {
    const wtPath = path.join(tmpDir, "worktrees", "with-spec");
    execSync(`git worktree add ${wtPath} -b feat/with-spec`, { cwd: tmpDir });
    fs.writeFileSync(path.join(wtPath, "spec.md"), "# Spec\nThis is a spec.");
    fs.writeFileSync(path.join(wtPath, "feature.ts"), "export const y = 2;");
    execSync("git add . && git commit -m 'add spec and feature'", { cwd: wtPath });

    const result = await scanAll(tmpDir);
    expect(result.worktrees[0].markers).toContain("spec.md");
  });

  // Test 5: Agent with pending question → needs_attention
  it("should detect agent with pending question as needs_attention", async () => {
    const wtPath = path.join(tmpDir, "worktrees", "blocked-agent");
    execSync(`git worktree add ${wtPath} -b feat/blocked-agent`, { cwd: tmpDir });
    fs.writeFileSync(path.join(wtPath, "file.ts"), "x");
    execSync("git add file.ts && git commit -m 'wip'", { cwd: wtPath });

    fs.writeFileSync(path.join(tmpDir, ".orra", "agents", "blocked-agent.json"), JSON.stringify({
      id: "blocked-agent",
      task: "test task",
      branch: "feat/blocked-agent",
      worktree: "worktrees/blocked-agent",
      pid: process.pid, // alive PID
      status: "waiting",
      agentPersona: null,
      model: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      exitCode: null,
      pendingQuestion: { tool: "Bash", input: { command: "git push" } },
    }));

    const result = await scanAll(tmpDir);
    expect(result.worktrees[0].status).toBe("needs_attention");
    expect(result.summary.needs_attention).toBe(1);
  });
});
