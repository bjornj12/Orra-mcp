import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  type GitState,
  type AgentStateV2,
  AgentStateV2Schema,
  type PrState,
  type WorktreeStatus,
  type WorktreeScanEntry,
  type ScanResult,
} from "../types.js";
import { loadConfig } from "./config.js";

const execFileAsync = promisify(execFile);

// ─── classify ────────────────────────────────────────────────────────────────

export function classify(
  git: GitState,
  agent: AgentStateV2 | null,
  pr: PrState | null,
  opts: { staleDays: number; driftThreshold: number }
): { status: WorktreeStatus; flags: string[] } {
  const flags: string[] = [];

  if (git.behind > opts.driftThreshold) {
    flags.push("high_drift");
  }

  // 1. Pending question
  if (agent?.pendingQuestion != null) {
    return { status: "needs_attention", flags };
  }

  // 2. PR: changes_requested or CI failure
  if (pr != null) {
    if (pr.reviews === "changes_requested") {
      return { status: "needs_attention", flags };
    }
    if (pr.ci === "failure") {
      return { status: "needs_attention", flags };
    }
  }

  // 3. PR: approved + CI passing + mergeable + behind ≤ 5
  if (pr != null) {
    if (
      pr.reviews === "approved" &&
      pr.ci === "success" &&
      pr.mergeable &&
      git.behind <= 5
    ) {
      return { status: "ready_to_land", flags };
    }
  }

  // 4. Agent running or idle
  if (agent != null && (agent.status === "running" || agent.status === "idle")) {
    return { status: "in_progress", flags };
  }

  // 5. No agent + last commit older than staleDays
  if (agent == null) {
    const lastCommitDate = new Date(git.lastCommit);
    const now = new Date();
    const diffMs = now.getTime() - lastCommitDate.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    if (diffDays > opts.staleDays) {
      return { status: "stale", flags };
    }
  }

  return { status: "idle", flags };
}

// ─── getMainBranch ────────────────────────────────────────────────────────────

async function getMainBranch(repoPath: string): Promise<string> {
  try {
    await execFileAsync("git", ["-C", repoPath, "rev-parse", "--verify", "main"], {});
    return "main";
  } catch {
    return "master";
  }
}

// ─── readGitState ─────────────────────────────────────────────────────────────

export async function readGitState(
  worktreePath: string,
  mainRepoPath: string
): Promise<GitState> {
  const mainBranch = await getMainBranch(mainRepoPath);

  const [branchResult, aheadResult, behindResult, statusResult, logResult, diffStatResult] =
    await Promise.allSettled([
      execFileAsync("git", ["-C", worktreePath, "rev-parse", "--abbrev-ref", "HEAD"]),
      execFileAsync("git", ["-C", worktreePath, "rev-list", "--count", `${mainBranch}..HEAD`]),
      execFileAsync("git", ["-C", worktreePath, "rev-list", "--count", `HEAD..${mainBranch}`]),
      execFileAsync("git", ["-C", worktreePath, "status", "--porcelain"]),
      execFileAsync("git", ["-C", worktreePath, "log", "-1", "--format=%cI"]),
      execFileAsync("git", ["-C", worktreePath, "diff", "--stat", `${mainBranch}...HEAD`]),
    ]);

  const ahead =
    aheadResult.status === "fulfilled"
      ? parseInt(aheadResult.value.stdout.trim(), 10) || 0
      : 0;

  const behind =
    behindResult.status === "fulfilled"
      ? parseInt(behindResult.value.stdout.trim(), 10) || 0
      : 0;

  const uncommitted =
    statusResult.status === "fulfilled"
      ? statusResult.value.stdout
          .split("\n")
          .filter((l) => l.trim().length > 0).length
      : 0;

  const lastCommit =
    logResult.status === "fulfilled"
      ? logResult.value.stdout.trim()
      : new Date().toISOString();

  let diffStat = "";
  if (diffStatResult.status === "fulfilled") {
    const lines = diffStatResult.value.stdout
      .split("\n")
      .filter((l) => l.trim().length > 0);
    diffStat = lines.length > 0 ? lines[lines.length - 1] : "";
  }

  return { ahead, behind, uncommitted, lastCommit, diffStat };
}

// ─── scanMarkers ──────────────────────────────────────────────────────────────

export async function scanMarkers(
  worktreePath: string,
  markers: string[]
): Promise<string[]> {
  const found: string[] = [];
  await Promise.all(
    markers.map(async (marker) => {
      try {
        await fs.access(path.join(worktreePath, marker));
        found.push(marker);
      } catch {
        // not found
      }
    })
  );
  return found;
}

// ─── readAgentState ───────────────────────────────────────────────────────────

function pidIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function readAgentState(
  projectRoot: string,
  agentId: string
): Promise<AgentStateV2 | null> {
  const filePath = path.join(projectRoot, ".orra", "agents", `${agentId}.json`);
  try {
    const data = await fs.readFile(filePath, "utf-8");
    const agent = AgentStateV2Schema.parse(JSON.parse(data));
    if (agent.status === "running" && !pidIsAlive(agent.pid)) {
      return { ...agent, status: "interrupted" };
    }
    return agent;
  } catch {
    return null;
  }
}

// ─── enrichWithGitHub ─────────────────────────────────────────────────────────

export async function enrichWithGitHub(
  worktrees: Array<{ branch: string }>
): Promise<Map<string, PrState>> {
  const result = new Map<string, PrState>();
  try {
    await Promise.all(
      worktrees.map(async ({ branch }) => {
        try {
          const { stdout } = await execFileAsync("gh", [
            "pr",
            "list",
            "--head",
            branch,
            "--json",
            "number,state,reviews,statusCheckRollup,mergeable",
            "--limit",
            "1",
          ]);
          const parsed = JSON.parse(stdout);
          if (!Array.isArray(parsed) || parsed.length === 0) return;
          const pr = parsed[0];

          // Derive reviews status
          let reviews = "none";
          if (Array.isArray(pr.reviews) && pr.reviews.length > 0) {
            const states = pr.reviews.map((r: { state: string }) => r.state.toLowerCase());
            if (states.includes("changes_requested")) {
              reviews = "changes_requested";
            } else if (states.every((s: string) => s === "approved")) {
              reviews = "approved";
            }
          }

          // Derive CI status
          let ci = "none";
          if (Array.isArray(pr.statusCheckRollup) && pr.statusCheckRollup.length > 0) {
            const conclusions = pr.statusCheckRollup.map(
              (c: { conclusion?: string; status?: string }) =>
                (c.conclusion ?? c.status ?? "").toLowerCase()
            );
            if (conclusions.some((c: string) => c === "failure" || c === "failed")) {
              ci = "failure";
            } else if (conclusions.every((c: string) => c === "success")) {
              ci = "success";
            } else {
              ci = "pending";
            }
          }

          const mergeable =
            typeof pr.mergeable === "string"
              ? pr.mergeable === "MERGEABLE"
              : Boolean(pr.mergeable);

          result.set(branch, {
            number: pr.number,
            state: pr.state,
            reviews,
            ci,
            mergeable,
          });
        } catch {
          // gh not available or not authenticated — skip this worktree
        }
      })
    );
  } catch {
    // complete failure — return empty map
  }
  return result;
}

// ─── parseWorktreeList ────────────────────────────────────────────────────────

interface WorktreeInfo {
  path: string;
  branch: string;
}

function parseWorktreeList(stdout: string): WorktreeInfo[] {
  const worktrees: WorktreeInfo[] = [];
  const blocks = stdout.split("\n\n");
  for (const block of blocks) {
    const lines = block.trim().split("\n");
    const pathLine = lines.find((l) => l.startsWith("worktree "));
    const branchLine = lines.find((l) => l.startsWith("branch "));
    if (pathLine && branchLine) {
      const wtPath = pathLine.replace("worktree ", "").trim();
      const branch = branchLine.replace("branch refs/heads/", "").trim();
      worktrees.push({ path: wtPath, branch });
    }
  }
  return worktrees;
}

// ─── worktreeId from path ─────────────────────────────────────────────────────

function worktreeIdFromPath(worktreePath: string, projectRoot: string): string {
  return path.basename(worktreePath);
}

// ─── scanAll ──────────────────────────────────────────────────────────────────

export async function scanAll(projectRoot: string): Promise<ScanResult> {
  const { stdout } = await execFileAsync("git", [
    "worktree",
    "list",
    "--porcelain",
  ], { cwd: projectRoot });

  const allWorktrees = parseWorktreeList(stdout);
  // Filter out the main repo
  const worktrees = allWorktrees.filter((wt) => wt.path !== projectRoot);

  const config = await loadConfig(projectRoot);

  // For each worktree, gather git state, markers, and agent state in parallel
  const enrichedWorktrees = await Promise.all(
    worktrees.map(async (wt) => {
      const wtId = worktreeIdFromPath(wt.path, projectRoot);

      const [git, markers, agent] = await Promise.all([
        readGitState(wt.path, projectRoot).catch((): GitState => ({
          ahead: 0,
          behind: 0,
          uncommitted: 0,
          lastCommit: new Date().toISOString(),
          diffStat: "",
        })),
        scanMarkers(wt.path, config.markers),
        readAgentState(projectRoot, wtId),
      ]);

      return { wt, wtId, git, markers, agent };
    })
  );

  // Enrich with GitHub PR data
  const prMap = await enrichWithGitHub(worktrees.map((wt) => ({ branch: wt.branch })));

  // Classify and build entries
  const entries: WorktreeScanEntry[] = enrichedWorktrees.map(
    ({ wt, wtId, git, markers, agent }) => {
      const pr = prMap.get(wt.branch) ?? null;
      const { status, flags } = classify(git, agent, pr, {
        staleDays: config.staleDays,
        driftThreshold: config.driftThreshold,
      });

      return {
        id: wtId,
        path: wt.path,
        branch: wt.branch,
        status,
        git,
        markers,
        pr,
        agent,
        flags,
      };
    }
  );

  // Build summary
  const summary = {
    ready_to_land: 0,
    needs_attention: 0,
    in_progress: 0,
    idle: 0,
    stale: 0,
    total: entries.length,
  };
  for (const entry of entries) {
    summary[entry.status]++;
  }

  return { worktrees: entries, summary };
}

// ─── inspectOne ───────────────────────────────────────────────────────────────

export interface InspectResult extends WorktreeScanEntry {
  commitLog: string;
  markerContents: Record<string, string>;
  agentOutputTail: string;
  conflictFiles: string[];
}

export async function inspectOne(
  projectRoot: string,
  worktreeId: string
): Promise<InspectResult | null> {
  const scanResult = await scanAll(projectRoot);
  const entry = scanResult.worktrees.find((wt) => wt.id === worktreeId);
  if (!entry) return null;

  const mainBranch = await getMainBranch(projectRoot);

  // Commit log
  let commitLog = "";
  try {
    const { stdout } = await execFileAsync("git", [
      "-C",
      entry.path,
      "log",
      "--oneline",
      `${mainBranch}..HEAD`,
    ]);
    commitLog = stdout.trim();
  } catch {
    commitLog = "";
  }

  // Marker contents (first 50 lines each)
  const markerContents: Record<string, string> = {};
  for (const marker of entry.markers) {
    try {
      const content = await fs.readFile(path.join(entry.path, marker), "utf-8");
      const lines = content.split("\n").slice(0, 50).join("\n");
      markerContents[marker] = lines;
    } catch {
      markerContents[marker] = "";
    }
  }

  // Agent output tail (last 50 lines)
  let agentOutputTail = "";
  if (entry.agent) {
    try {
      const logPath = path.join(
        projectRoot,
        ".orra",
        "agents",
        `${entry.agent.id}.log`
      );
      const content = await fs.readFile(logPath, "utf-8");
      const lines = content.split("\n").filter((l) => l.length > 0);
      agentOutputTail = lines.slice(-50).join("\n");
    } catch {
      agentOutputTail = "";
    }
  }

  // Conflict files (modified in both branch and main since merge-base)
  const conflictFiles: string[] = [];
  try {
    const { stdout: mergeBaseOut } = await execFileAsync("git", [
      "-C",
      entry.path,
      "merge-base",
      mainBranch,
      "HEAD",
    ]);
    const mergeBase = mergeBaseOut.trim();

    const [{ stdout: branchFiles }, { stdout: mainFiles }] = await Promise.all([
      execFileAsync("git", ["-C", entry.path, "diff", "--name-only", mergeBase, "HEAD"]),
      execFileAsync("git", [
        "-C",
        projectRoot,
        "diff",
        "--name-only",
        mergeBase,
        mainBranch,
      ]),
    ]);

    const branchSet = new Set(
      branchFiles.split("\n").filter((f) => f.trim().length > 0)
    );
    const mainSet = new Set(
      mainFiles.split("\n").filter((f) => f.trim().length > 0)
    );
    for (const file of branchSet) {
      if (mainSet.has(file)) {
        conflictFiles.push(file);
      }
    }
  } catch {
    // ignore errors
  }

  return {
    ...entry,
    commitLog,
    markerContents,
    agentOutputTail,
    conflictFiles,
  };
}
