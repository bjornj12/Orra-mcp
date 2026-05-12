import { z } from "zod";
import { stopSession, removeSession } from "../core/claude-cli.js";
import { readJobs, configDir } from "../core/daemon-state.js";
import { readSpawnLedger } from "../core/state.js";
import { isSafeBranchName } from "../core/validation.js";
import { ok, fail, toMcpContent } from "../core/envelope.js";
import { checkAgentsViewAvailable } from "../core/agents-view-preflight.js";

export const orraKillSchema = z.object({
  agent: z.string().min(1).describe("Short id (8 hex chars), slug, or session name of the agent to stop."),
  cleanup: z.boolean().optional().describe("When true, run `claude rm` (removes job + worktree); when false or omitted, run `claude stop` (keeps transcript)."),
});
// Note: the agent field is intentionally z.string().min(1) (not SafeWorktreeIdSchema) because
// it accepts both 8-hex daemon short ids (e.g. "abcd1234") and slugs from the spawn ledger.
// The handler resolves these to a known short id before any filesystem use.

/**
 * Resolve an agent identifier to its daemon short id.
 *
 * Accepts:
 *  - An 8-hex-char short id that exists in the spawn ledger or daemon jobs
 *  - A slug/name that matches a spawn-ledger entry's `slug` field
 *  - A name that matches a live daemon job's `name` field
 */
async function resolveShortId(
  projectRoot: string,
  agent: string,
): Promise<string | null> {
  // Check spawn ledger by shortId or slug
  const ledger = await readSpawnLedger(projectRoot);
  const byShortId = ledger.find((e) => e.shortId === agent);
  if (byShortId) return byShortId.shortId;

  const bySlug = ledger.find((e) => e.slug === agent);
  if (bySlug) return bySlug.shortId;

  // Check live daemon jobs by name or daemonShort
  const jobs = await readJobs(configDir());
  const byJobName = jobs.find((j) => j.name === agent);
  if (byJobName?.daemonShort) return byJobName.daemonShort;

  const byDaemonShort = jobs.find((j) => j.daemonShort === agent);
  if (byDaemonShort?.daemonShort) return byDaemonShort.daemonShort;

  return null;
}

export async function handleOrraKill(
  projectRoot: string,
  args: z.infer<typeof orraKillSchema>,
) {
  const pf = await checkAgentsViewAvailable();
  if (!pf.ok) {
    return toMcpContent(fail(pf.reason, { code: "agents_view_unavailable" }));
  }

  try {
    const shortId = await resolveShortId(projectRoot, args.agent);
    if (!shortId) {
      return toMcpContent(fail(`agent not found: ${args.agent}`, { code: "agent_not_found" }));
    }

    const cleanup = args.cleanup ?? false;

    // Resolve PR branch hint BEFORE destructive cleanup: removeSession deletes
    // the daemon job state, so worktreeBranch becomes unavailable afterwards.
    let branch: string | null = null;
    if (cleanup) {
      const jobs = await readJobs(configDir());
      const job = jobs.find((j) => j.daemonShort === shortId);
      branch = job?.worktreeBranch ?? null;
    }

    if (cleanup) {
      await removeSession(shortId);
    } else {
      await stopSession(shortId);
    }

    // PR cleanup: if we found a branch name, try to close the PR.
    // This is best-effort — we don't fail the kill if gh is unavailable.
    const ledger = await readSpawnLedger(projectRoot);
    const entry = ledger.find((e) => e.shortId === shortId);
    if (cleanup && entry) {
      if (branch && isSafeBranchName(branch)) {
        try {
          const { execFile } = await import("node:child_process");
          const { promisify } = await import("node:util");
          const execFileAsync = promisify(execFile);
          await execFileAsync("gh", ["pr", "close", "--delete-branch", "--", branch], { timeout: 10_000 });
        } catch {
          // gh not available or no PR — ignore
        }
      }
    }

    return toMcpContent(ok({ killed: true, shortId, cleaned: cleanup }));
  } catch (err) {
    return toMcpContent(fail(err instanceof Error ? err.message : String(err)));
  }
}
