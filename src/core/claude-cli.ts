/**
 * claude-cli.ts
 *
 * Typed wrappers over the `claude` CLI for spawning and managing background
 * agents via the Agents View (`claude --bg`, `claude stop`, `claude rm`,
 * `claude daemon status`).
 *
 * Confirmed against claude 2.1.139 (probed 2026-05-12). See the design spec
 * docs/superpowers/specs/2026-05-12-orra-on-agents-view-design.md §7.
 *
 * Pure builders (arg construction, stdout parsing) are exported and unit-tested
 * separately from the side-effecting wrappers (execFile calls).
 */

import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(execFileCb);

// ---------------------------------------------------------------------------
// Pure builders (unit-tested)
// ---------------------------------------------------------------------------

/** Options for building a `claude --bg` argv. */
export interface BgSpawnOpts {
  name: string;
  task: string;
  model?: string;
  agent?: string;
  allowedTools?: string[];
  disallowedTools?: string[];
  worktree?: boolean;
}

/**
 * Builds the argv array for `claude --bg <flags> -- <task>`.
 *
 * Arg order:
 *   ["--bg", "--name", name,
 *    ...model?, ...agent?,
 *    ...allowedTools?, ...disallowedTools?,
 *    ...worktree?,
 *    "--", task]
 */
export function buildBgArgs(opts: BgSpawnOpts): string[] {
  const args: string[] = ["--bg", "--name", opts.name];

  if (opts.model) {
    args.push("--model", opts.model);
  }
  if (opts.agent) {
    args.push("--agent", opts.agent);
  }
  if (opts.allowedTools && opts.allowedTools.length > 0) {
    args.push("--allowed-tools", opts.allowedTools.join(","));
  }
  if (opts.disallowedTools && opts.disallowedTools.length > 0) {
    args.push("--disallowed-tools", opts.disallowedTools.join(","));
  }
  if (opts.worktree) {
    args.push("--worktree", opts.name);
  }

  args.push("--", opts.task);
  return args;
}

/**
 * Parses the short session id (8 hex chars) from `claude --bg` stdout.
 *
 * Expected format (from claude 2.1.139):
 *   "Starting background service…\nbackgrounded · f50662d9\n  claude agents ..."
 *
 * Returns null when the pattern is not found.
 */
export function parseBackgroundedId(stdout: string): string | null {
  const match = stdout.match(/backgrounded · ([0-9a-f]{8})/);
  return match ? match[1] : null;
}

/** Options for building a `claude --bg --resume` argv. */
export interface BgResumeOpts {
  model?: string;
}

/**
 * Builds the argv array for `claude --bg --resume <id> -- <prompt>`.
 *
 * Arg order:
 *   ["--bg", "--resume", id, ...model?, "--", prompt]
 */
export function buildResumeArgs(id: string, prompt: string, opts?: BgResumeOpts): string[] {
  const args: string[] = ["--bg", "--resume", id];

  if (opts?.model) {
    args.push("--model", opts.model);
  }

  args.push("--", prompt);
  return args;
}

// ---------------------------------------------------------------------------
// Side-effecting wrappers
// ---------------------------------------------------------------------------

/** Result of a successful `claude --bg` spawn. */
export interface BgResult {
  shortId: string;
  raw: string;
}

/** Full options for bgSpawn (extends BgSpawnOpts with cwd). */
export interface BgSpawnCallOpts extends BgSpawnOpts {
  cwd?: string;
}

/**
 * Spawns a background agent via `claude --bg`.
 *
 * @throws Error (with stdout + stderr) if the short id cannot be parsed from output.
 */
export async function bgSpawn(opts: BgSpawnCallOpts): Promise<BgResult> {
  const args = buildBgArgs(opts);
  let stdout = "";
  let stderr = "";
  try {
    const result = await execFile("claude", args, {
      cwd: opts.cwd,
      env: { ...process.env },
      timeout: 60_000,
      maxBuffer: 1 << 20,
    });
    stdout = result.stdout;
    stderr = result.stderr;
  } catch (err: unknown) {
    // execFile throws on non-zero exit; capture what we can
    const e = err as { stdout?: string; stderr?: string; message?: string };
    stdout = e.stdout ?? "";
    stderr = e.stderr ?? "";
    throw new Error(
      `claude --bg failed: ${e.message ?? "unknown error"}\nstdout: ${stdout}\nstderr: ${stderr}`
    );
  }

  const shortId = parseBackgroundedId(stdout);
  if (!shortId) {
    throw new Error(
      `claude --bg ran but no short id found in output.\nstdout: ${stdout}\nstderr: ${stderr}`
    );
  }
  return { shortId, raw: stdout };
}

/** Options for bgResume. */
export interface BgResumeCallOpts extends BgResumeOpts {
  cwd?: string;
}

/**
 * Resumes an existing conversation as a new background job via
 * `claude --bg --resume <id> -- <prompt>`.
 *
 * @throws Error (with stdout + stderr) if the short id cannot be parsed from output.
 */
export async function bgResume(
  id: string,
  prompt: string,
  opts?: BgResumeCallOpts
): Promise<BgResult> {
  const args = buildResumeArgs(id, prompt, opts);
  let stdout = "";
  let stderr = "";
  try {
    const result = await execFile("claude", args, {
      cwd: opts?.cwd,
      env: { ...process.env },
      timeout: 60_000,
      maxBuffer: 1 << 20,
    });
    stdout = result.stdout;
    stderr = result.stderr;
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    stdout = e.stdout ?? "";
    stderr = e.stderr ?? "";
    throw new Error(
      `claude --bg --resume failed: ${e.message ?? "unknown error"}\nstdout: ${stdout}\nstderr: ${stderr}`
    );
  }

  const shortId = parseBackgroundedId(stdout);
  if (!shortId) {
    throw new Error(
      `claude --bg --resume ran but no short id found in output.\nstdout: ${stdout}\nstderr: ${stderr}`
    );
  }
  return { shortId, raw: stdout };
}

/**
 * Stops a background session (`claude stop <id>`), keeping its conversation.
 * Tolerates non-zero exit if the session is already gone.
 */
export async function stopSession(id: string): Promise<void> {
  try {
    await execFile("claude", ["stop", id], {
      env: { ...process.env },
      timeout: 15_000,
    });
  } catch {
    // Session already gone or daemon not running — treat as success.
  }
}

/**
 * Removes a background session and its worktree (`claude rm <id>`).
 * Tolerates non-zero exit if the session is already gone.
 */
export async function removeSession(id: string): Promise<void> {
  try {
    await execFile("claude", ["rm", id], {
      env: { ...process.env },
      timeout: 15_000,
    });
  } catch {
    // Session already gone — treat as success.
  }
}

/** Result of a daemon status check. */
export interface DaemonStatusResult {
  running: boolean;
  raw: string;
}

/**
 * Checks whether the Claude daemon is running (`claude daemon status`).
 *
 * Returns `running: false` on any error (e.g. claude not installed, daemon
 * not started). The exact output "not running" (at the start of stdout, after
 * trimming) indicates the daemon is down.
 */
export async function daemonStatus(): Promise<DaemonStatusResult> {
  try {
    const { stdout } = await execFile("claude", ["daemon", "status"], {
      env: { ...process.env },
      timeout: 15_000,
    });
    const running = !stdout.trimStart().startsWith("not running");
    return { running, raw: stdout };
  } catch (err: unknown) {
    // claude not installed or daemon command failed
    const e = err as { stdout?: string };
    const raw = e.stdout ?? "";
    return { running: false, raw };
  }
}

/**
 * Returns the installed Claude Code version string (e.g. "2.1.139"), parsed
 * from `claude --version` output ("2.1.139 (Claude Code)").
 *
 * Returns null on any error (claude not on PATH, parse failure, etc.).
 */
export async function claudeVersion(): Promise<string | null> {
  try {
    const { stdout } = await execFile("claude", ["--version"], {
      env: { ...process.env },
      timeout: 10_000,
    });
    const match = stdout.match(/^\s*([\d.]+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}
