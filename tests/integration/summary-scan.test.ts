import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as fssync from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execSync } from "node:child_process";
import { scanAll } from "../../src/core/awareness.js";

let repoDir: string;
let fakeConfigDir: string;
let prevConfigDir: string | undefined;
let worktreeDirForTest: string;

async function initRepoWithWorktree(): Promise<{ repoDir: string; worktreeDir: string; worktreeId: string }> {
  const dir = fssync.realpathSync(await fs.mkdtemp(path.join(os.tmpdir(), "orra-scan-")));
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
  worktreeDirForTest = setup.worktreeDir;

  // Set up a fake CLAUDE_CONFIG_DIR with a running daemon job for this worktree.
  // The job's cwd points to the worktree so the daemon provider joins correctly.
  fakeConfigDir = fssync.realpathSync(
    fssync.mkdtempSync(path.join(os.tmpdir(), "orra-sum-cfg-")),
  );
  prevConfigDir = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = fakeConfigDir;

  // Create a transcript JSONL in a projects directory under fakeConfigDir
  const projectsDir = path.join(fakeConfigDir, "projects", "test-project");
  await fs.mkdir(projectsDir, { recursive: true });
  const transcriptPath = path.join(projectsDir, `${setup.worktreeId}-session.jsonl`);

  // Write transcript with test signals
  const transcriptContent = [
    JSON.stringify({
      type: "assistant",
      message: {
        role: "assistant",
        content: [{ type: "tool_use", id: "t1", name: "Edit", input: { file_path: "src/foo.ts" } }],
      },
      timestamp: "2026-05-12T10:00:00.000Z",
    }),
    JSON.stringify({
      type: "user",
      message: {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: "t1", content: "Tests: 1 failed, 2 total" }],
      },
      timestamp: "2026-05-12T10:00:01.000Z",
    }),
  ].join("\n");
  await fs.writeFile(transcriptPath, transcriptContent);

  const jobDir = path.join(fakeConfigDir, "jobs", setup.worktreeId);
  await fs.mkdir(jobDir, { recursive: true });
  await fs.writeFile(path.join(jobDir, "state.json"), JSON.stringify({
    state: "running",
    detail: "testing summary integration",
    tempo: "active",
    inFlight: { tasks: 0, queued: 0, kinds: [] },
    output: { result: null },
    children: null,
    intent: "testing summary integration",
    name: "test-agent",
    sessionId: `${setup.worktreeId}-session`,
    daemonShort: setup.worktreeId,
    worktreePath: setup.worktreeDir,
    cwd: setup.worktreeDir,
    linkScanPath: transcriptPath,
    backend: "daemon",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }));
});

afterEach(async () => {
  if (prevConfigDir === undefined) {
    delete process.env.CLAUDE_CONFIG_DIR;
  } else {
    process.env.CLAUDE_CONFIG_DIR = prevConfigDir;
  }
  await fs.rm(repoDir, { recursive: true, force: true });
  await fs.rm(fakeConfigDir, { recursive: true, force: true });
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
