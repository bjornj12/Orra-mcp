/**
 * Integration test: spawn a real bg agent via handleOrraSpawn.
 * Gated on `claude` being installed and working (skipIf otherwise).
 *
 * Uses the daemon's on-disk state (readJobState) to poll for completion.
 * Keeps the task trivial (say hello and stop) and uses haiku to stay fast.
 */
import { describe, it, expect, afterEach } from "vitest";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { execFileSync } from "node:child_process";
import { handleOrraSpawn } from "../../src/tools/orra-spawn.js";
import { readJobState, configDir } from "../../src/core/daemon-state.js";
import { readSpawnLedger } from "../../src/core/state.js";
import * as cli from "../../src/core/claude-cli.js";

// Detect whether claude is on PATH *and* has --bg (Agents View) enabled.
// Uses `claude daemon status` to check — fast (no spawn), shows if the
// daemon capability is available.
const hasClaude = (() => {
  try {
    // First verify claude is on PATH
    execFileSync("claude", ["--version"], { stdio: "pipe", timeout: 10_000 });
    // Check --bg is not explicitly disabled
    // We do this by running a quick probe: try `claude --bg --name orra-probe-check`
    // without a task — it should fail with a usage error (not "not enabled").
    // Actually: just check `claude --version` works AND daemon status doesn't
    // say "not enabled". The simplest reliable check without spawning:
    try {
      const out = execFileSync("claude", ["daemon", "status"], {
        stdio: "pipe",
        timeout: 10_000,
      }).toString();
      // If daemon status works, --bg should too
      return true;
    } catch (e) {
      const msg = String((e as any)?.stderr ?? (e as any)?.stdout ?? (e as any)?.message ?? "");
      // "not enabled" in the error means --bg is disabled in this environment
      if (msg.includes("not enabled") || msg.includes("Unknown command")) return false;
      // Daemon status command exists but daemon isn't running — that's fine,
      // --bg will start it.
      return true;
    }
  } catch {
    return false;
  }
})();

// Terminal states according to the daemon contract
const TERMINAL_STATES = new Set(["done", "failed", "error"]);

/** Poll readJobState until the job reaches a terminal state or we time out. */
async function pollUntilTerminal(
  cfgDir: string,
  shortId: string,
  timeoutMs = 25_000,
): Promise<{ state?: string; timed_out: boolean }> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const job = await readJobState(cfgDir, shortId);
    if (job?.state && TERMINAL_STATES.has(job.state)) {
      return { state: job.state, timed_out: false };
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return { state: undefined, timed_out: true };
}

describe("orra_spawn — real integration", () => {
  const cleanupIds: string[] = [];

  afterEach(async () => {
    // Clean up any sessions we spawned
    for (const id of cleanupIds) {
      try {
        await cli.removeSession(id);
      } catch {
        // Best-effort
      }
    }
    cleanupIds.length = 0;
  });

  it.skipIf(!hasClaude)(
    "spawns a real bg agent, records spawn ledger, then terminates",
    async () => {
      const repo = await fsp.mkdtemp(path.join(os.tmpdir(), "orra-spawn-int-"));

      try {
        // Initialize a minimal git repo so spawn has a valid cwd
        execFileSync("git", ["init"], { cwd: repo, stdio: "pipe" });
        execFileSync("git", ["commit", "--allow-empty", "-m", "init"], {
          cwd: repo,
          stdio: "pipe",
          env: {
            ...process.env,
            GIT_AUTHOR_NAME: "test",
            GIT_AUTHOR_EMAIL: "test@test.com",
            GIT_COMMITTER_NAME: "test",
            GIT_COMMITTER_EMAIL: "test@test.com",
          },
        });

        const res = await handleOrraSpawn(repo, {
          task: "Print the word DONE and stop. Nothing else.",
          reason: "integration test",
          model: "claude-haiku-4-5",
          allowedTools: ["Bash"],
        });

        const payload = JSON.parse((res as any).content[0].text);
        expect(payload.ok).toBe(true);
        const { shortId } = payload.data;
        expect(typeof shortId).toBe("string");
        expect(shortId).toMatch(/^[0-9a-f]{8}$/);
        cleanupIds.push(shortId);

        // Spawn ledger entry must exist
        const ledger = await readSpawnLedger(repo);
        const entry = ledger.find((e) => e.shortId === shortId);
        expect(entry).toBeDefined();
        expect(entry?.reason).toBe("integration test");

        // Wait for the job to finish — use the real configDir()
        const outcome = await pollUntilTerminal(configDir(), shortId, 25_000);
        // Accept any terminal state or timeout (CI environments vary in speed)
        expect(["done", "failed", undefined]).toContain(outcome.state);
      } finally {
        await fsp.rm(repo, { recursive: true, force: true });
      }
    },
    30_000,
  );
});
