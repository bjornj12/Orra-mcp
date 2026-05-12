#!/usr/bin/env node
/**
 * orra-launch.ts
 *
 * The `orra` npm bin. Ensures the Orra orchestrator is running as a persistent
 * named background agent (`claude --bg --agent orchestrator --name orra`).
 *
 * - No running orra session  → spawn one and print an attach hint.
 * - Running orra + TTY       → attach directly (interactive).
 * - Running orra + no TTY    → print attach hint.
 *
 * Pass `--check` (or `--dry-run`) to print the decided action as JSON and exit
 * without spawning or attaching. Used by the publish-verify script.
 */

import { spawnSync } from "node:child_process";
import { readJobs, configDir } from "../core/daemon-state.js";
import { buildBgArgs } from "../core/claude-cli.js";
import type { JobState } from "../core/daemon-state.js";

// ---------------------------------------------------------------------------
// Bootstrap prompt (minimal — persona file carries the detail)
// ---------------------------------------------------------------------------

export const ORRA_BOOTSTRAP_PROMPT =
  "You are Orra, the standing orchestrator. Read your persona (the orchestrator " +
  "agent definition) and your directives in .orra/directives/, then start your " +
  "heartbeat loop. On each tick: scan worktrees and bg agents via orra_scan, triage " +
  "anything blocked or needing attention, fill idle worktrees per your directives, " +
  "and report concisely. Keep going across turns.";

// ---------------------------------------------------------------------------
// decideLaunchAction — pure, testable
// ---------------------------------------------------------------------------

export type LaunchAction =
  | { action: "spawn"; bgArgs: string[] }
  | { action: "attach"; shortId: string }
  | { action: "print-attach-hint"; shortId: string };

export function decideLaunchAction(args: {
  jobs: Array<Pick<JobState, "name" | "daemonShort">>;
  hasTty: boolean;
}): LaunchAction {
  const orraJob = args.jobs.find((j) => j.name === "orra");

  if (!orraJob || !orraJob.daemonShort) {
    // No running orra session — spawn one.
    const bgArgs = buildBgArgs({
      name: "orra",
      agent: "orchestrator",
      task: ORRA_BOOTSTRAP_PROMPT,
    });
    return { action: "spawn", bgArgs };
  }

  const shortId = orraJob.daemonShort;

  if (args.hasTty) {
    return { action: "attach", shortId };
  }

  return { action: "print-attach-hint", shortId };
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const isDryRun =
    process.argv.includes("--check") || process.argv.includes("--dry-run");

  const jobs = await readJobs(configDir());
  const hasTty = process.stdout.isTTY === true;

  const action = decideLaunchAction({ jobs, hasTty });

  if (isDryRun) {
    // Print decided action as JSON and exit cleanly (used by verify script).
    process.stdout.write(JSON.stringify(action, null, 2) + "\n");
    return;
  }

  switch (action.action) {
    case "spawn": {
      // Spawn the orchestrator as a persistent bg agent.
      const result = spawnSync("claude", action.bgArgs, { stdio: "inherit" });
      if (result.error) {
        console.error("orra: failed to spawn orchestrator:", result.error.message);
        process.exit(1);
      }
      console.log(
        "\nOrra is running in the background. Attach with:\n  claude attach orra",
      );
      break;
    }
    case "attach": {
      // Attach interactively.
      const result = spawnSync("claude", ["attach", action.shortId], {
        stdio: "inherit",
      });
      if (result.error) {
        console.error("orra: failed to attach:", result.error.message);
        process.exit(1);
      }
      break;
    }
    case "print-attach-hint": {
      console.log(
        "Orra is already running. Attach with:  claude attach " + action.shortId,
      );
      break;
    }
  }
}

// Only run when this file is the entry point (not when imported by tests).
if (
  import.meta.url ===
  `file://${process.argv[1]}`
) {
  main().catch((err) => {
    console.error("orra:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
