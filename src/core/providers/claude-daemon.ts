/**
 * claude-daemon.ts
 *
 * Built-in `claude-daemon` StateProvider. Reads the Claude Code daemon's
 * on-disk state interface (jobs/<short>/state.json + daemon/roster.json) and
 * emits ProviderWorktree entries into the scanAll pipeline.
 *
 * Join key: state.json.worktreePath ?? state.json.cwd  (spec §3.1 + §7)
 *
 * Confirmed against claude 2.1.139 — see
 * docs/superpowers/specs/2026-05-12-orra-on-agents-view-design.md §3.1/§7
 * and the plan Task 3.
 */

import * as path from "node:path";
import {
  configDir as defaultConfigDir,
  readJobs,
  readRoster,
  type JobState,
  type RosterWorker,
} from "../daemon-state.js";
import type { ProviderConfig, ProviderResult, ProviderWorktree, StateProvider } from "./types.js";

// ---------------------------------------------------------------------------
// State mapping
// ---------------------------------------------------------------------------

type AgentStatusString = "running" | "waiting" | "completed" | "failed" | "killed" | "idle" | "interrupted";

function mapDaemonState(state: string | undefined): AgentStatusString {
  switch (state) {
    case "running":
      return "running";
    case "done":
      return "completed";
    case "blocked":
      return "waiting";
    default:
      // Treat unrecognized states as running (spec §7: "unknown state → running")
      return "running";
  }
}

// ---------------------------------------------------------------------------
// respawnFlags parsing
// ---------------------------------------------------------------------------

/** Extract a single named flag value from a respawnFlags array, e.g. "--model" → "claude-haiku-4-5" */
function extractFlag(flags: string[] | undefined, flagName: string): string | null {
  if (!flags) return null;
  const idx = flags.indexOf(flagName);
  if (idx === -1 || idx + 1 >= flags.length) return null;
  const val = flags[idx + 1];
  // Flag values must not start with "--" (that would be another flag)
  if (val.startsWith("--")) return null;
  return val;
}

// ---------------------------------------------------------------------------
// Extras construction (kept under 1KB)
// ---------------------------------------------------------------------------

const MAX_DETAIL_LEN = 200;
const MAX_INTENT_LEN = 200;

function truncate(s: string | undefined, max: number): string | undefined {
  if (!s) return undefined;
  return s.length <= max ? s : s.slice(0, max) + "…";
}

function buildExtras(job: JobState): Record<string, unknown> {
  return {
    daemonShort: job.daemonShort,
    sessionId: job.sessionId,
    daemonDetail: truncate(job.detail, MAX_DETAIL_LEN),
    tempo: job.tempo,
    intent: truncate(job.intent, MAX_INTENT_LEN),
    linkScanPath: job.linkScanPath,
    worktreeBranch: job.worktreeBranch,
  };
}

// ---------------------------------------------------------------------------
// Job → ProviderWorktree
// ---------------------------------------------------------------------------

function jobToProviderWorktree(job: JobState): ProviderWorktree {
  const idAndPath = job.worktreePath ?? job.cwd ?? "";
  const branch = job.worktreeBranch ?? "";
  const now = new Date().toISOString();

  const model = extractFlag(job.respawnFlags, "--model");
  const agentPersona = extractFlag(job.respawnFlags, "--agent");
  const status = mapDaemonState(job.state);

  // sessionId is not in ProviderWorktreeSchema's agent partial (it predates
  // the daemon pivot) — we include it here via cast so callers can read it
  // without reaching into extras. Don't add sessionId to extras too (redundant).
  const agent = {
    id: job.daemonShort ?? "",
    sessionId: job.sessionId,
    status,
    agentPersona: agentPersona,
    model: model,
    task: job.intent ?? job.name ?? "",
    branch,
    worktree: idAndPath,
    createdAt: job.createdAt ?? now,
    updatedAt: job.updatedAt ?? now,
  } as ProviderWorktree["agent"];

  const flags: string[] = job.state === "blocked" ? ["blocked"] : [];

  const extras = buildExtras(job);

  return {
    id: idAndPath,
    path: idAndPath,
    branch,
    agent,
    flags,
    extras,
  };
}

// ---------------------------------------------------------------------------
// Roster worker → ProviderWorktree (for workers not covered by a job entry)
// ---------------------------------------------------------------------------

function rosterWorkerToProviderWorktree(
  short: string,
  worker: RosterWorker,
): ProviderWorktree {
  // Derive worktree path from --worktree flag in dispatch.launch.args if present
  const launchArgs = worker.dispatch?.launch?.args;
  const worktreeName = extractFlag(launchArgs, "--worktree");
  const cwd = worker.cwd ?? "";

  let idAndPath: string;
  if (worktreeName && cwd) {
    idAndPath = path.join(cwd, ".claude", "worktrees", worktreeName);
  } else {
    idAndPath = cwd;
  }

  // Same sessionId cast as in jobToProviderWorktree — see comment there.
  const agent = {
    id: short,
    sessionId: worker.sessionId,
    status: "running" as const,
    agentPersona: null,
    model: null,
    task: "",
    branch: "",
    worktree: idAndPath,
    createdAt: worker.startedAt ? new Date(worker.startedAt).toISOString() : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as ProviderWorktree["agent"];

  return {
    id: idAndPath,
    path: idAndPath,
    branch: "",
    agent,
    flags: [],
    extras: {
      daemonShort: short,
      sessionId: worker.sessionId,
    },
  };
}

// ---------------------------------------------------------------------------
// Timestamp helpers
// ---------------------------------------------------------------------------

/** Parse an ISO timestamp to a numeric epoch; returns 0 for missing/invalid values. */
function ts(v: string | undefined): number {
  const n = v ? Date.parse(v) : NaN;
  return Number.isFinite(n) ? n : 0;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createClaudeDaemonProvider(opts?: { configDir?: string }): StateProvider {
  // Include the resolved configDir in the provider name so the cache key is
  // unique per daemon location. In production CLAUDE_CONFIG_DIR doesn't change
  // between calls; in tests each test uses a different tmpdir.
  const resolvedDir = opts?.configDir ?? defaultConfigDir();
  return {
    name: `claude-daemon:${resolvedDir}`,

    // claude-daemon is a built-in, not a user-configured provider — it is not
    // in ProviderConfigSchema's discriminated union. We cast a minimal sentinel
    // object so TypeScript is satisfied without widening the shared config type.
    config: { type: "claude-daemon" } as unknown as ProviderConfig,

    async fetch(): Promise<ProviderResult> {
      const dir = resolvedDir;

      // Soft-fail: if the daemon has never been started, return empty.
      let jobs: JobState[];
      try {
        jobs = await readJobs(dir);
      } catch {
        return { protocolVersion: "1.0", worktrees: [] };
      }

      const roster = await readRoster(dir);

      // Build a map from job worktrees (keyed by id = worktreePath ?? cwd)
      const worktreeMap = new Map<string, ProviderWorktree>();
      const coveredShorts = new Set<string>();

      for (const job of jobs) {
        const wt = jobToProviderWorktree(job);
        if (wt.id) {
          // Deduplicate same-path jobs by recency: keep the most recently updated entry.
          const prev = worktreeMap.get(wt.id);
          if (!prev) {
            worktreeMap.set(wt.id, wt);
          } else {
            const prevUpdated = ts(prev.agent?.updatedAt as string | undefined);
            const nextUpdated = ts(wt.agent?.updatedAt as string | undefined);
            if (nextUpdated >= prevUpdated) {
              worktreeMap.set(wt.id, wt);
            }
          }
        }
        if (job.daemonShort) {
          coveredShorts.add(job.daemonShort);
        }
      }

      // Add roster-only workers (live workers whose job dirs aren't present)
      if (roster?.workers) {
        for (const [short, worker] of Object.entries(roster.workers)) {
          if (coveredShorts.has(short)) continue;
          const wt = rosterWorkerToProviderWorktree(short, worker);
          // Only add if this path isn't already covered by a job entry
          if (wt.id && !worktreeMap.has(wt.id)) {
            worktreeMap.set(wt.id, wt);
          }
        }
      }

      return {
        protocolVersion: "1.0",
        worktrees: Array.from(worktreeMap.values()),
      };
    },
  };
}
