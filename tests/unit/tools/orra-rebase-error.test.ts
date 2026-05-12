/**
 * orra_rebase — error envelope tests (Task 13).
 *
 * Tests both clean rebase and conflict detection using a real temp git repo.
 * No mocking of git — the behavior is deterministic.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { execSync } from "node:child_process";
import { handleOrraRebase } from "../../../src/tools/orra-rebase.js";

/** Create a minimal git repo with an initial commit. */
function initRepo(dir: string) {
  execSync("git init -b main", { cwd: dir, stdio: "pipe" });
  execSync("git config user.email 'test@test.com'", { cwd: dir, stdio: "pipe" });
  execSync("git config user.name 'Test'", { cwd: dir, stdio: "pipe" });
  fs.writeFileSync(path.join(dir, "README.md"), "# init\n");
  execSync("git add README.md && git commit -m 'init'", { cwd: dir, stdio: "pipe" });
}

describe("orra_rebase error envelope", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "orra-rebase-test-"));
    initRepo(tmpDir);
  });

  afterEach(async () => {
    try {
      // Prune any lingering worktrees before rm
      execSync("git worktree prune", { cwd: tmpDir, stdio: "pipe" });
    } catch {}
    await fsp.rm(tmpDir, { recursive: true, force: true });
  });

  it("returns ok when rebase succeeds (no conflict)", async () => {
    // Create a worktree off the initial commit
    const wtPath = path.join(tmpDir, ".claude", "worktrees", "feat-a");
    execSync(`git worktree add "${wtPath}" -b feat-a`, { cwd: tmpDir, stdio: "pipe" });

    // Advance main with a new commit (different file — no conflict)
    fs.writeFileSync(path.join(tmpDir, "main-only.txt"), "from main\n");
    execSync("git add main-only.txt && git commit -m 'main advance'", {
      cwd: tmpDir, stdio: "pipe",
    });

    // Add a commit on the worktree branch (different file)
    fs.writeFileSync(path.join(wtPath, "branch-only.txt"), "from branch\n");
    execSync("git add branch-only.txt && git commit -m 'branch commit'", {
      cwd: wtPath, stdio: "pipe",
    });

    const res = await handleOrraRebase(tmpDir, { worktree: "feat-a" });
    const payload = JSON.parse((res as any).content[0].text);
    expect(payload.ok).toBe(true);
    expect(payload.data.rebased).toBe(true);
    expect(payload.data.worktree).toBe("feat-a");
  });

  it("returns {ok:false, error} with isError:true and code rebase_conflict when rebase has conflicts", async () => {
    // Create a worktree off the initial commit
    const wtPath = path.join(tmpDir, ".claude", "worktrees", "feat-b");
    execSync(`git worktree add "${wtPath}" -b feat-b`, { cwd: tmpDir, stdio: "pipe" });

    // Advance main by modifying shared.txt
    fs.writeFileSync(path.join(tmpDir, "shared.txt"), "main version\n");
    execSync("git add shared.txt && git commit -m 'main modifies shared'", {
      cwd: tmpDir, stdio: "pipe",
    });

    // Make the worktree branch also modify shared.txt (conflict)
    fs.writeFileSync(path.join(wtPath, "shared.txt"), "branch version\n");
    execSync("git add shared.txt && git commit -m 'branch modifies shared'", {
      cwd: wtPath, stdio: "pipe",
    });

    const res = await handleOrraRebase(tmpDir, { worktree: "feat-b" });
    const payload = JSON.parse((res as any).content[0].text);
    expect(payload.ok).toBe(false);
    expect(payload.code).toBe("rebase_conflict");
    expect(Array.isArray(payload.conflictFiles)).toBe(true);
    expect(payload.conflictFiles.length).toBeGreaterThan(0);
    expect(payload.conflictFiles).toContain("shared.txt");
    expect((res as any).isError).toBe(true);
  });

  it("returns fail when worktree id is not found", async () => {
    const res = await handleOrraRebase(tmpDir, { worktree: "does-not-exist" });
    const payload = JSON.parse((res as any).content[0].text);
    expect(payload.ok).toBe(false);
    expect((res as any).isError).toBe(true);
  });
});
