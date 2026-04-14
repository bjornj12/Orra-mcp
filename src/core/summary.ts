import * as fs from "node:fs/promises";
import * as path from "node:path";
import { parseLog, type LogSignals } from "./log-parser.js";
import type { AgentState, AgentSummary } from "../types.js";

export const CURRENT_SUMMARY_SCHEMA_VERSION = 1 as const;
export const MAX_TAIL_BYTES = 64 * 1024;

export interface SummaryComputeDeps {
  stateDir: string;
  now: () => Date;
}

function logPath(stateDir: string, agentId: string): string {
  return path.join(stateDir, `${agentId}.log`);
}

function summaryPath(stateDir: string, agentId: string): string {
  return path.join(stateDir, `${agentId}.summary.json`);
}

export async function readLogTail(file: string): Promise<{ text: string; mtime: Date } | null> {
  let stat;
  try {
    stat = await fs.stat(file);
  } catch {
    return null;
  }
  const size = stat.size;
  const start = Math.max(0, size - MAX_TAIL_BYTES);
  const handle = await fs.open(file, "r");
  try {
    const length = size - start;
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, start);
    return { text: buffer.toString("utf-8"), mtime: stat.mtime };
  } finally {
    await handle.close();
  }
}

function buildOneLine(agent: AgentState, signals: LogSignals): string {
  if (agent.pendingQuestion) {
    return `awaiting permission: ${agent.pendingQuestion.tool}`;
  }
  if (signals.lastTestResult === "fail") return "last test run failed";
  if (signals.lastTestResult === "pass") return "last test run passed";
  if (signals.lastFileEdited) return `editing ${signals.lastFileEdited}`;
  if (signals.tailLines.length > 0) return signals.tailLines[signals.tailLines.length - 1].slice(0, 120);
  return `agent status: ${agent.status}`;
}

function scoreSummary(
  agent: AgentState,
  signals: LogSignals,
  now: Date,
): number {
  let score = 0;
  if (agent.pendingQuestion) score += 50;
  if (agent.status === "waiting") score += 40;
  if (agent.status === "failed") score += 40;
  if (agent.status === "interrupted") score += 30;
  if (signals.lastTestResult === "fail") score += 20;
  if (signals.loopDetected) score += 15;
  if (signals.errorPattern) score += 15;

  // "no activity for > 10 minutes while running": approximate via agent.updatedAt
  if (agent.status === "running") {
    const updated = new Date(agent.updatedAt).getTime();
    const idleMs = now.getTime() - updated;
    if (idleMs > 10 * 60 * 1000) score += 20;
  }

  return Math.max(0, Math.min(100, score));
}

function deriveStuckReason(
  agent: AgentState,
  signals: LogSignals,
  now: Date,
): string | null {
  if (agent.pendingQuestion) return `awaiting permission: ${agent.pendingQuestion.tool}`;
  if (signals.loopDetected) return "loop: same line repeats in tail";
  // "Stuck on X" only makes sense for an agent that's still trying. A failed,
  // interrupted, or completed agent isn't stuck — it's done. The error pattern
  // still contributes to needsAttentionScore via scoreSummary; we just don't
  // label the agent as currently blocked by it.
  if (signals.errorPattern && agent.status === "running") {
    return `stuck on ${signals.errorPattern}`;
  }
  if (agent.status === "running") {
    const updated = new Date(agent.updatedAt).getTime();
    const idleMs = now.getTime() - updated;
    if (idleMs > 10 * 60 * 1000) {
      const mins = Math.floor(idleMs / 60000);
      return `no output for ${mins}m`;
    }
  }
  return null;
}

async function tryReadCachedSummary(
  stateDir: string,
  agentId: string,
): Promise<AgentSummary | null> {
  try {
    const raw = await fs.readFile(summaryPath(stateDir, agentId), "utf-8");
    const parsed = JSON.parse(raw) as AgentSummary;
    if (parsed.schemaVersion !== CURRENT_SUMMARY_SCHEMA_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function currentLogMtime(stateDir: string, agentId: string): Promise<string | null> {
  try {
    const s = await fs.stat(logPath(stateDir, agentId));
    return s.mtime.toISOString();
  } catch {
    return null;
  }
}

async function writeSummaryAtomic(file: string, summary: AgentSummary): Promise<void> {
  // Suffix with pid so concurrent writes from different processes can't stomp each other's tmp file.
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(summary, null, 2));
  await fs.rename(tmp, file);
}

async function computeFresh(
  agentId: string,
  agent: AgentState,
  deps: SummaryComputeDeps,
): Promise<AgentSummary> {
  const logFile = logPath(deps.stateDir, agentId);
  const tail = await readLogTail(logFile);

  const signals: LogSignals = tail
    ? parseLog(tail.text)
    : {
        lastFileEdited: null,
        lastTestResult: "unknown",
        errorPattern: null,
        loopDetected: false,
        tailLines: [],
      };

  const now = deps.now();
  const summary: AgentSummary = {
    agentId,
    summarizedAt: now.toISOString(),
    logMtime: tail ? tail.mtime.toISOString() : "",
    schemaVersion: CURRENT_SUMMARY_SCHEMA_VERSION,
    oneLine: buildOneLine(agent, signals),
    needsAttentionScore: scoreSummary(agent, signals, now),
    likelyStuckReason: deriveStuckReason(agent, signals, now),
    lastTestResult: signals.lastTestResult,
    lastFileEdited: signals.lastFileEdited,
    lastActivityAt: tail ? tail.mtime.toISOString() : null,
    tailLines: signals.tailLines,
  };

  try {
    await writeSummaryAtomic(summaryPath(deps.stateDir, agentId), summary);
  } catch {
    // Disk full / permissions — return the in-memory summary anyway.
  }

  return summary;
}

export async function getOrComputeSummary(
  agentId: string,
  agent: AgentState,
  deps: SummaryComputeDeps,
): Promise<AgentSummary> {
  const [cached, mtime] = await Promise.all([
    tryReadCachedSummary(deps.stateDir, agentId),
    currentLogMtime(deps.stateDir, agentId),
  ]);

  if (cached && mtime && cached.logMtime === mtime) {
    return cached;
  }

  return computeFresh(agentId, agent, deps);
}

// Public API for future kill-with-cleanup flows. v2 deliberately persists agent
// state files across sessions, so today there's no in-tree caller — this exists
// so external code (or a future opt-in cleanup mode) can drop the cache for a
// removed agent without reaching into summary.ts internals.
export async function invalidateSummary(agentId: string, stateDir: string): Promise<void> {
  try {
    await fs.unlink(summaryPath(stateDir, agentId));
  } catch {
    // missing file is fine
  }
}
