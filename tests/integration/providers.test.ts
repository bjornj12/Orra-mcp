import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execSync } from "node:child_process";
import { scanAll } from "../../src/core/awareness.js";

describe("Provider Integration", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "orra-prov-integ-"));
    tmpDir = fs.realpathSync(tmpDir);
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

  it("should work with no providers configured (backward compat)", async () => {
    const wtPath = path.join(tmpDir, "worktrees", "test-wt");
    execSync(`git worktree add ${wtPath} -b feat/test`, { cwd: tmpDir });
    fs.writeFileSync(path.join(wtPath, "file.ts"), "x");
    execSync("git add file.ts && git commit -m 'add'", { cwd: wtPath });

    const result = await scanAll(tmpDir);
    expect(result.worktrees).toHaveLength(1);
    expect(result.providerStatus).toBeDefined();
    expect(result.providerStatus!.used).toHaveLength(0);
  });

  it("should merge file provider data with native scan", async () => {
    const wtPath = path.join(tmpDir, "worktrees", "feat-a");
    execSync(`git worktree add ${wtPath} -b feat/a`, { cwd: tmpDir });
    fs.writeFileSync(path.join(wtPath, "file.ts"), "x");
    execSync("git add file.ts && git commit -m 'add'", { cwd: wtPath });

    fs.writeFileSync(path.join(tmpDir, ".orra", "state.json"), JSON.stringify({
      orraProtocolVersion: "1.0",
      worktrees: [{
        id: "feat-a",
        path: wtPath,
        branch: "feat/a",
        stage: { name: "review", metadata: { score: 92 } },
      }],
    }));

    fs.writeFileSync(path.join(tmpDir, ".orra", "config.json"), JSON.stringify({
      providers: [{ type: "file", path: ".orra/state.json" }],
      providerCache: { ttl: 0 },
    }));

    const result = await scanAll(tmpDir);
    expect(result.worktrees).toHaveLength(1);
    expect(result.worktrees[0].stage?.name).toBe("review");
    expect(result.worktrees[0].git.ahead).toBe(1); // from native scan
    expect(result.providerStatus!.used).toContain("file:.orra/state.json");
  });

  it("should apply pipeline detection when no provider sets stage", async () => {
    const wtPath = path.join(tmpDir, "worktrees", "with-spec");
    execSync(`git worktree add ${wtPath} -b feat/with-spec`, { cwd: tmpDir });
    fs.writeFileSync(path.join(wtPath, "spec.md"), "# Spec");
    fs.writeFileSync(path.join(wtPath, "file.ts"), "x");
    execSync("git add . && git commit -m 'add'", { cwd: wtPath });

    fs.writeFileSync(path.join(tmpDir, ".orra", "pipeline.json"), JSON.stringify({
      name: "Test",
      stages: [{ name: "spec-phase", detect: { marker: "spec.md" } }],
    }));

    const result = await scanAll(tmpDir);
    expect(result.worktrees[0].stage?.name).toBe("spec-phase");
  });

  it("should classify as needs_attention when provider flag is blocked", async () => {
    const wtPath = path.join(tmpDir, "worktrees", "blocked-wt");
    execSync(`git worktree add ${wtPath} -b feat/blocked`, { cwd: tmpDir });
    fs.writeFileSync(path.join(wtPath, "file.ts"), "x");
    execSync("git add file.ts && git commit -m 'add'", { cwd: wtPath });

    fs.writeFileSync(path.join(tmpDir, ".orra", "state.json"), JSON.stringify({
      orraProtocolVersion: "1.0",
      worktrees: [{
        id: "blocked-wt",
        path: wtPath,
        branch: "feat/blocked",
        flags: ["blocked"],
      }],
    }));

    fs.writeFileSync(path.join(tmpDir, ".orra", "config.json"), JSON.stringify({
      providers: [{ type: "file", path: ".orra/state.json" }],
      providerCache: { ttl: 0 },
    }));

    const result = await scanAll(tmpDir);
    expect(result.worktrees[0].status).toBe("needs_attention");
    expect(result.worktrees[0].flags).toContain("blocked");
  });
});
