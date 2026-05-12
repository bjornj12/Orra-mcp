/**
 * daemon-state.ts
 *
 * Pure functions that locate and read the Claude Code daemon's on-disk state
 * interface under $CLAUDE_CONFIG_DIR (or ~/.claude if unset).
 *
 * Confirmed against claude 2.1.139 (probed 2026-05-12). See the design spec
 * docs/superpowers/specs/2026-05-12-orra-on-agents-view-design.md §3.1 + §7.
 *
 * All readers return null / [] on missing or malformed files — never throw.
 * Unknown keys survive via .passthrough() for forward-compatibility.
 */

import * as fsp from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { z } from "zod";

// ---------------------------------------------------------------------------
// configDir
// ---------------------------------------------------------------------------

/** Returns $CLAUDE_CONFIG_DIR, falling back to ~/.claude. */
export function configDir(): string {
  return process.env.CLAUDE_CONFIG_DIR ?? path.join(os.homedir(), ".claude");
}

// ---------------------------------------------------------------------------
// Roster schemas  (daemon/roster.json)
// ---------------------------------------------------------------------------

export const RosterWorkerSchema = z
  .object({
    pid: z.number().optional(),
    procStart: z.string().optional(),
    sessionId: z.string().optional(),
    rendezvousSock: z.string().optional(),
    ptySock: z.string().optional(),
    cliVersion: z.string().optional(),
    startedAt: z.number().optional(),
    attempt: z.number().optional(),
    cwd: z.string().optional(),
    dispatch: z
      .object({
        launch: z
          .object({
            args: z.array(z.string()).optional(),
          })
          .passthrough()
          .optional(),
        isolation: z.string().optional(),
        respawnFlags: z.array(z.string()).optional(),
        seed: z.unknown().optional(),
      })
      .passthrough()
      .optional(),
    decModes: z.array(z.number()).optional(),
  })
  .passthrough();
export type RosterWorker = z.infer<typeof RosterWorkerSchema>;

export const RosterSchema = z
  .object({
    proto: z.number(),
    supervisorPid: z.number().optional(),
    updatedAt: z.number().optional(),
    workers: z.record(z.string(), RosterWorkerSchema).default({}),
  })
  .passthrough();
export type Roster = z.infer<typeof RosterSchema>;

// ---------------------------------------------------------------------------
// JobState schema  (jobs/<short>/state.json)
// ---------------------------------------------------------------------------

export const InFlightSchema = z
  .object({
    tasks: z.number().optional(),
    queued: z.number().optional(),
    kinds: z.array(z.string()).optional(),
  })
  .passthrough();

export const JobStateSchema = z
  .object({
    state: z.string().optional(),
    detail: z.string().optional(),
    tempo: z.string().optional(),
    inFlight: InFlightSchema.optional(),
    output: z.record(z.string(), z.unknown()).optional(),
    children: z.unknown().optional(),
    linkScanPath: z.string().optional(),
    template: z.string().optional(),
    respawnFlags: z.array(z.string()).optional(),
    intent: z.string().optional(),
    name: z.string().optional(),
    nameSource: z.string().optional(),
    sessionId: z.string().optional(),
    resumeSessionId: z.string().optional(),
    daemonShort: z.string().optional(),
    cliVersion: z.string().optional(),
    cwd: z.string().optional(),
    worktreePath: z.string().optional(),
    worktreeBranch: z.string().optional(),
    backend: z.string().optional(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
    firstTerminalAt: z.string().optional(),
  })
  .passthrough();
export type JobState = z.infer<typeof JobStateSchema>;

// ---------------------------------------------------------------------------
// TimelineEntry schema  (jobs/<short>/timeline.jsonl — one object per line)
// ---------------------------------------------------------------------------

export const TimelineEntrySchema = z
  .object({
    at: z.string().optional(),
    state: z.string().optional(),
    detail: z.string().optional(),
    text: z.string().optional(),
  })
  .passthrough();
export type TimelineEntry = z.infer<typeof TimelineEntrySchema>;

// ---------------------------------------------------------------------------
// Readers
// ---------------------------------------------------------------------------

/**
 * Reads daemon/roster.json from the given config dir.
 * Returns null if the file is missing, unreadable, or has proto !== 1.
 */
export async function readRoster(dir: string = configDir()): Promise<Roster | null> {
  const rosterPath = path.join(dir, "daemon", "roster.json");
  try {
    const raw = await fsp.readFile(rosterPath, "utf-8");
    const json = JSON.parse(raw);
    const parsed = RosterSchema.safeParse(json);
    if (!parsed.success) {
      return null;
    }
    if (parsed.data.proto !== 1) {
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

/**
 * Lists all jobs by reading jobs/<short>/state.json for each subdirectory
 * under jobs/. Skips pins.json and any dir whose state.json is missing or
 * malformed. Returns [] when the jobs dir doesn't exist.
 */
export async function readJobs(dir: string = configDir()): Promise<JobState[]> {
  const jobsDir = path.join(dir, "jobs");
  let entries: string[];
  try {
    entries = await fsp.readdir(jobsDir);
  } catch {
    return [];
  }

  const results: JobState[] = [];
  for (const entry of entries) {
    // Skip pins.json and any plain files at the top of jobs/
    if (entry === "pins.json") continue;

    const entryPath = path.join(jobsDir, entry);
    let stat: Awaited<ReturnType<typeof fsp.stat>>;
    try {
      stat = await fsp.stat(entryPath);
    } catch {
      continue;
    }
    if (!stat.isDirectory()) continue;

    const job = await readJobState(dir, entry);
    if (job !== null) {
      results.push(job);
    }
  }
  return results;
}

/**
 * Reads jobs/<short>/state.json for a single job by its short id.
 * Returns null if missing or malformed.
 */
export async function readJobState(dir: string, short: string): Promise<JobState | null> {
  const stateFile = path.join(dir, "jobs", short, "state.json");
  try {
    const raw = await fsp.readFile(stateFile, "utf-8");
    const json = JSON.parse(raw);
    const parsed = JobStateSchema.safeParse(json);
    if (!parsed.success) {
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

/**
 * Reads jobs/<short>/timeline.jsonl, returning an array of TimelineEntry
 * objects. Skips blank lines and lines that fail to parse as JSON.
 * Returns [] when the file is missing or the job dir doesn't exist.
 */
export async function readJobTimeline(
  dir: string,
  short: string
): Promise<TimelineEntry[]> {
  const timelineFile = path.join(dir, "jobs", short, "timeline.jsonl");
  try {
    const raw = await fsp.readFile(timelineFile, "utf-8");
    const entries: TimelineEntry[] = [];
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const json = JSON.parse(trimmed);
        const parsed = TimelineEntrySchema.safeParse(json);
        if (parsed.success) {
          entries.push(parsed.data);
        }
      } catch {
        // skip malformed lines
      }
    }
    return entries;
  } catch {
    return [];
  }
}
