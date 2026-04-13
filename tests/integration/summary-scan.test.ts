import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { execSync } from "node:child_process";
import { scanAll } from "../../src/core/awareness.js";
import type { AgentState } from "../../src/types.js";

let repoDir: string;

async function initRepoWithWorktree(): Promise<{ repoDir: string; worktreeDir: string; worktreeId: string }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "orra-scan-"));
  execSync("git init -q", { cwd: dir });
  execSync("git config user.email test@example.com", { cwd: dir });
  execSync("git config user.name test", { cwd: dir });
  execSync("git commit --allow-empty -q -m init", { cwd: dir });
  execSync("git branch -M main", { cwd: dir });

  const worktreeId = "feature-x";
  const wtPath = path.join(dir, "worktrees", worktreeId);
  await fs.mkdir(path.join(dir, "worktrees"), { recursive: true });
  execSync(`git worktree add -q -b ${worktreeId} ${wtPath}`, { cwd: dir });

  return { repoDir: dir, worktreeDir: wtPath, worktreeId };
}

beforeEach(async () => {
  const setup = await initRepoWithWorktree();
  repoDir = setup.repoDir;

  const agentsDir = path.join(repoDir, ".orra", "agents");
  await fs.mkdir(agentsDir, { recursive: true });

  const agent: AgentState = {
    id: setup.worktreeId,
    task: "testing summary integration",
    branch: setup.worktreeId,
    worktree: setup.worktreeDir,
    pid: 99999,
    status: "idle",
    agentPersona: null,
    model: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    exitCode: null,
    pendingQuestion: null,
  };
  await fs.writeFile(path.join(agentsDir, `${setup.worktreeId}.json`), JSON.stringify(agent));
  await fs.writeFile(
    path.join(agentsDir, `${setup.worktreeId}.log`),
    "starting work\nmodified: src/foo.ts\nTests: 1 failed",
  );
});

afterEach(async () => {
  await fs.rm(repoDir, { recursive: true, force: true });
});

describe("scanAll — summary attachment", () => {
  it("populates entry.summary for tracked agents", async () => {
    const result = await scanAll(repoDir);
    const entry = result.worktrees.find((w) => w.agent != null);
    expect(entry).toBeDefined();
    expect(entry!.summary).toBeDefined();
    expect(entry!.summary!.lastTestResult).toBe("fail");
    expect(entry!.summary!.lastFileEdited).toBe("src/foo.ts");
  });

  it("omits entry.summary for worktrees without agents", async () => {
    const result = await scanAll(repoDir);
    // There may be additional worktrees with no agent — they should have no summary
    const noAgent = result.worktrees.find((w) => w.agent == null);
    if (noAgent) {
      expect(noAgent.summary).toBeUndefined();
    }
  });
});
