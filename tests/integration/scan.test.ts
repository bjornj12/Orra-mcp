import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execSync } from "node:child_process";
import { scanAll } from "../../src/core/awareness.js";

describe("Scan Pipeline (integration)", () => {
  let tmpDir: string;
  let fakeConfigDir: string;
  let prevConfigDir: string | undefined;

  beforeEach(() => {
    // Use realpathSync to resolve macOS /var → /private/var symlink so git worktree
    // path comparison in scanAll works correctly.
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "orra-scan-integ-")));
    execSync("git init", { cwd: tmpDir });
    execSync('git config user.email "test@test.com"', { cwd: tmpDir });
    execSync('git config user.name "Test User"', { cwd: tmpDir });
    execSync("git commit --allow-empty -m 'init'", { cwd: tmpDir });
    fs.mkdirSync(path.join(tmpDir, ".orra", "agents"), { recursive: true });

    // Isolate the daemon provider: each test gets its own empty CLAUDE_CONFIG_DIR
    fakeConfigDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "orra-scan-cfg-")));
    prevConfigDir = process.env.CLAUDE_CONFIG_DIR;
    process.env.CLAUDE_CONFIG_DIR = fakeConfigDir;
  });

  afterEach(() => {
    if (prevConfigDir === undefined) {
      delete process.env.CLAUDE_CONFIG_DIR;
    } else {
      process.env.CLAUDE_CONFIG_DIR = prevConfigDir;
    }
    try { execSync("git worktree prune", { cwd: tmpDir }); } catch {}
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.rmSync(fakeConfigDir, { recursive: true, force: true });
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

  // Test 5: Blocked agent (daemon state) → needs_attention
  it("should detect blocked daemon agent as needs_attention", async () => {
    const wtPath = path.join(tmpDir, "worktrees", "blocked-agent");
    execSync(`git worktree add ${wtPath} -b feat/blocked-agent`, { cwd: tmpDir });
    fs.writeFileSync(path.join(wtPath, "file.ts"), "x");
    execSync("git add file.ts && git commit -m 'wip'", { cwd: wtPath });

    // Write a daemon job state with state=blocked pointing at this worktree
    const jobDir = path.join(fakeConfigDir, "jobs", "testshort");
    fs.mkdirSync(jobDir, { recursive: true });
    fs.writeFileSync(path.join(jobDir, "state.json"), JSON.stringify({
      state: "blocked",
      detail: "waiting for user input",
      tempo: "idle",
      inFlight: { tasks: 0, queued: 0, kinds: [] },
      output: { result: null },
      children: null,
      intent: "blocked task",
      name: "blocked-agent",
      sessionId: "testshort-session",
      daemonShort: "testshort",
      worktreePath: wtPath,
      cwd: wtPath,
      backend: "daemon",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));

    const result = await scanAll(tmpDir);
    expect(result.worktrees[0].status).toBe("needs_attention");
    expect(result.summary.needs_attention).toBe(1);
  });
});
