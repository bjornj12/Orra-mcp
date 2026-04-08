import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execSync } from "node:child_process";
import { WorktreeManager, slugify } from "../../src/core/worktree.js";

describe("slugify", () => {
  it("should convert task to slug", () => {
    expect(slugify("Refactor the auth middleware")).toBe("refactor-the-auth-middleware");
  });

  it("should strip special characters", () => {
    expect(slugify("Fix bug #123: can't login!")).toBe("fix-bug-123-cant-login");
  });

  it("should collapse multiple hyphens", () => {
    expect(slugify("a   b---c")).toBe("a-b-c");
  });

  it("should trim hyphens from edges", () => {
    expect(slugify("  hello world  ")).toBe("hello-world");
  });

  it("should truncate to 40 chars", () => {
    const long = "a".repeat(60);
    expect(slugify(long).length).toBeLessThanOrEqual(40);
  });
});

describe("WorktreeManager", () => {
  let tmpDir: string;
  let wt: WorktreeManager;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "orra-wt-test-"));
    execSync("git init", { cwd: tmpDir });
    execSync("git commit --allow-empty -m 'init'", { cwd: tmpDir });
    wt = new WorktreeManager(tmpDir);
  });

  afterEach(() => {
    try {
      execSync("git worktree prune", { cwd: tmpDir });
    } catch {}
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should create a worktree and return metadata", async () => {
    const result = await wt.create("test-a1b2");
    expect(result.branch).toBe("orra/test-a1b2");
    expect(result.worktreePath).toContain("worktrees/test-a1b2");
    expect(fs.existsSync(result.worktreePath)).toBe(true);
  });

  it("should create worktree with custom branch", async () => {
    const result = await wt.create("test-a1b2", "my-custom-branch");
    expect(result.branch).toBe("my-custom-branch");
  });

  it("should remove a worktree", async () => {
    const result = await wt.create("test-a1b2");
    const removeResult = await wt.remove("test-a1b2");
    expect(fs.existsSync(result.worktreePath)).toBe(false);
    expect(removeResult.branchDeleted).toBe(false);
  });

  it("should remove worktree and delete merged branch", async () => {
    const result = await wt.create("test-a1b2");
    // Merge the branch so it can be safely deleted
    execSync(`git merge ${result.branch} --no-edit`, { cwd: tmpDir });
    const removeResult = await wt.remove("test-a1b2", result.branch);
    expect(removeResult.branchDeleted).toBe(true);
  });

  it("should warn when branch is not merged on cleanup", async () => {
    const result = await wt.create("test-c3d4");
    // Make a commit on the worktree branch so it diverges
    fs.writeFileSync(path.join(result.worktreePath, "test.txt"), "test");
    execSync("git add test.txt && git commit -m 'diverge'", { cwd: result.worktreePath });
    const removeResult = await wt.remove("test-c3d4", result.branch);
    expect(removeResult.branchDeleted).toBe(false);
    expect(removeResult.warning).toContain("not fully merged");
  });

  it("should throw if worktree already exists", async () => {
    await wt.create("test-a1b2");
    await expect(wt.create("test-a1b2")).rejects.toThrow();
  });

  describe("rebase", () => {
    it("should successfully rebase branch onto main when no conflicts", async () => {
      // Create worktree from initial commit
      const result = await wt.create("test-rebase-ok");

      // Make a new commit on main
      fs.writeFileSync(path.join(tmpDir, "main-file.txt"), "main content");
      execSync("git add main-file.txt && git commit -m 'main commit'", { cwd: tmpDir });

      // Make a commit on the worktree branch (different file)
      fs.writeFileSync(path.join(result.worktreePath, "branch-file.txt"), "branch content");
      execSync("git add branch-file.txt && git commit -m 'branch commit'", { cwd: result.worktreePath });

      const rebaseResult = await wt.rebase("test-rebase-ok");

      expect(rebaseResult.success).toBe(true);
      expect(rebaseResult.conflicts).toEqual([]);

      // Both commits should be in the branch history
      const log = execSync("git log --oneline", { cwd: result.worktreePath }).toString();
      expect(log).toContain("main commit");
      expect(log).toContain("branch commit");
    });

    it("should detect conflicts and return conflicting files", async () => {
      // Create worktree from initial commit
      const result = await wt.create("test-rebase-conflict");

      // Make a commit on main that modifies a file
      fs.writeFileSync(path.join(tmpDir, "shared.txt"), "main version");
      execSync("git add shared.txt && git commit -m 'main modifies shared'", { cwd: tmpDir });

      // Rewind the worktree branch to before that commit, then make its own change
      // The worktree was created from the initial empty commit, so we add the same file with different content
      fs.writeFileSync(path.join(result.worktreePath, "shared.txt"), "branch version");
      execSync("git add shared.txt && git commit -m 'branch modifies shared'", { cwd: result.worktreePath });

      const rebaseResult = await wt.rebase("test-rebase-conflict");

      expect(rebaseResult.success).toBe(false);
      expect(rebaseResult.conflicts).toContain("shared.txt");
    });
  });
});
