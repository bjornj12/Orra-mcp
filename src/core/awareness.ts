import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  type GitState,
  type AgentState,
  AgentStateSchema,
  type PrState,
  type WorktreeStatus,
  type WorktreeScanEntry,
  type ScanResult,
} from "../types.js";
import { loadConfig } from "./config.js";
import { buildProviders, fetchAndMergeProviders } from "./providers/index.js";
import type { ProviderWorktree, StageInfo } from "./providers/types.js";
import { loadPipeline, detectStage } from "./pipeline.js";
import { getOrComputeSummary } from "./summary.js";

const execFileAsync = promisify(execFile);

// ─── classify ────────────────────────────────────────────────────────────────

export function classify(
  git: GitState,
  agent: AgentState | null,
  pr: PrState | null,
  opts: { staleDays: number; driftThreshold: number },
  stage?: StageInfo | null,
  providerFlags?: string[],
): { status: WorktreeStatus; flags: string[] } {
  const flags: string[] = [...(providerFlags ?? [])];

  if (git.behind > opts.driftThreshold) {
    flags.push("high_drift");
  }

  // Rule 0a: Provider flags take precedence
  if (flags.includes("blocked")) return { status: "needs_attention", flags };
  if (flags.includes("ready")) return { status: "ready_to_land", flags };

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

  // 4. Stage scoring
  if (stage?.metadata && typeof stage.metadata.score === "number" && (stage.metadata.score as number) < 85) {
    flags.push("low_score");
    return { status: "needs_attention", flags };
  }

  // 5. Agent running or idle
  if (agent != null && (agent.status === "running" || agent.status === "idle")) {
    return { status: "in_progress", flags };
  }

  // 6. No agent + last commit older than staleDays
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
): Promise<AgentState | null> {
  const filePath = path.join(projectRoot, ".orra", "agents", `${agentId}.json`);
  try {
    const data = await fs.readFile(filePath, "utf-8");
    const agent = AgentStateSchema.parse(JSON.parse(data));
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
          // Use gh pr view (not pr list) to get reviewDecision — the computed aggregate
          // that accounts for superseded reviews (e.g., CHANGES_REQUESTED → APPROVED)
          const { stdout } = await execFileAsync("gh", [
            "pr",
            "list",
            "--head",
            branch,
            "--json",
            "number,state,reviewDecision,statusCheckRollup,mergeable",
            "--limit",
            "1",
          ]);
          const parsed = JSON.parse(stdout);
          if (!Array.isArray(parsed) || parsed.length === 0) return;
          const pr = parsed[0];

          // reviewDecision is GitHub's computed aggregate: APPROVED, CHANGES_REQUESTED, REVIEW_REQUIRED, or ""
          let reviews = "none";
          const decision = (pr.reviewDecision ?? "").toLowerCase();
          if (decision === "approved") {
            reviews = "approved";
          } else if (decision === "changes_requested") {
            reviews = "changes_requested";
          } else if (decision === "review_required") {
            reviews = "pending";
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
  const config = await loadConfig(projectRoot);

  // Step 1: Fetch providers
  const providers = buildProviders(config.providers, projectRoot);
  const { merged: providerData, status: providerStatus } = await fetchAndMergeProviders(
    providers, config.providerCache,
  );

  // Step 2: Discover native worktrees
  const { stdout } = await execFileAsync("git", [
    "worktree",
    "list",
    "--porcelain",
  ], { cwd: projectRoot });
  const allWorktrees = parseWorktreeList(stdout);
  const nativeWorktrees = allWorktrees.filter((wt) => wt.path !== projectRoot);

  // Step 3: Build unified worktree list (provider data + native discovery)
  const worktreeIds = new Set<string>();
  const worktreesToProcess: Array<{
    id: string; path: string; branch: string; providerData?: ProviderWorktree;
  }> = [];

  for (const [id, pWt] of providerData) {
    worktreeIds.add(id);
    worktreesToProcess.push({ id, path: pWt.path, branch: pWt.branch, providerData: pWt });
  }

  for (const nwt of nativeWorktrees) {
    const id = worktreeIdFromPath(nwt.path, projectRoot);
    if (!worktreeIds.has(id)) {
      worktreeIds.add(id);
      worktreesToProcess.push({ id, path: nwt.path, branch: nwt.branch });
    }
  }

  // Step 4: Filter to existing paths
  const existing: typeof worktreesToProcess = [];
  for (const wt of worktreesToProcess) {
    try {
      await fs.access(wt.path);
      existing.push(wt);
    } catch {
      // Path doesn't exist on disk — drop silently
    }
  }

  // Step 5: Fill gaps from native scan for each worktree
  const enriched = await Promise.all(existing.map(async (wt) => {
    const pd = wt.providerData;

    // Git: use provider data if complete, or scan natively
    const git = (pd?.git && pd.git.ahead !== undefined && pd.git.behind !== undefined
      && pd.git.uncommitted !== undefined && pd.git.lastCommit && pd.git.diffStat !== undefined)
      ? pd.git as GitState
      : await readGitState(wt.path, projectRoot).catch((): GitState => ({
          ahead: 0, behind: 0, uncommitted: 0, lastCommit: new Date().toISOString(), diffStat: "",
        }));

    // Markers: use provider data or scan natively
    const markers = pd?.markers ?? await scanMarkers(wt.path, config.markers);

    // Agent: use provider data or read from .orra/agents/
    const agent = pd?.agent
      ? pd.agent as AgentState
      : await readAgentState(projectRoot, wt.id);

    // PR: from provider data (will be filled after GitHub enrichment if null)
    const pr = pd?.pr ?? null;

    // Stage + flags from provider
    const stage = pd?.stage ?? null;
    const providerFlags = pd?.flags ?? [];
    const extras = pd?.extras;

    return { id: wt.id, path: wt.path, branch: wt.branch, git, markers, agent, pr, stage, providerFlags, extras };
  }));

  // Step 6: Enrich with GitHub PR data for worktrees missing PR info
  const needsPrEnrichment = enriched.filter(wt => !wt.pr);
  if (needsPrEnrichment.length > 0) {
    const prMap = await enrichWithGitHub(needsPrEnrichment.map(wt => ({ branch: wt.branch })));
    for (const wt of enriched) {
      if (!wt.pr) {
        wt.pr = prMap.get(wt.branch) ?? null;
      }
    }
  }

  // Step 7: Apply pipeline detection for worktrees without stage
  const pipeline = await loadPipeline(projectRoot);
  if (pipeline) {
    for (const wt of enriched) {
      if (!wt.stage) {
        wt.stage = await detectStage({ path: wt.path, branch: wt.branch }, pipeline);
      }
    }
  }

  // Step 8: Compute per-agent summary, then classify
  const orraAgentsDir = path.join(projectRoot, ".orra", "agents");
  const now = () => new Date();

  const entries: WorktreeScanEntry[] = await Promise.all(enriched.map(async (wt) => {
    const summary = wt.agent
      ? await getOrComputeSummary(wt.agent.id, wt.agent, { stateDir: orraAgentsDir, now })
          .catch(() => undefined)
      : undefined;

    const { status, flags } = classify(
      wt.git, wt.agent, wt.pr,
      { staleDays: config.staleDays, driftThreshold: config.driftThreshold },
      wt.stage, wt.providerFlags,
    );
    return {
      id: wt.id,
      path: wt.path,
      branch: wt.branch,
      status,
      git: wt.git,
      markers: wt.markers,
      pr: wt.pr,
      agent: wt.agent,
      flags,
      stage: wt.stage,
      extras: wt.extras,
      summary,
    };
  }));

  // Step 9: Build summary
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

  return { worktrees: entries, summary, providerStatus };
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
