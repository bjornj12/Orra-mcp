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
    await wt.remove("test-a1b2");
    expect(fs.existsSync(result.worktreePath)).toBe(false);
  });

  it("should throw if worktree already exists", async () => {
    await wt.create("test-a1b2");
    await expect(wt.create("test-a1b2")).rejects.toThrow();
  });
});
