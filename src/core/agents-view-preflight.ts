/**
 * agents-view-preflight.ts
 *
 * Checks whether the Claude Code Agents View is available before daemon-dependent
 * tools run. Used by orra_spawn and orra_kill (hard fail) and orra_scan (soft warning).
 *
 * The result is memoized for the process lifetime to avoid repeated shell-outs to
 * `claude --version`. Callers that pass explicit `version`/`env` opts bypass the memo
 * (for tests).
 */

import { claudeVersion } from "./claude-cli.js";

/** Minimum Claude Code version required for Agents View support. */
const MIN_VERSION = "2.1.0";

// ---------------------------------------------------------------------------
// isAgentsViewDisabled
// ---------------------------------------------------------------------------

/**
 * Returns true when CLAUDE_CODE_DISABLE_AGENT_VIEW is set to a truthy value
 * (anything except "0", "false", or empty string).
 */
export function isAgentsViewDisabled(env: Record<string, string | undefined> = process.env): boolean {
  const val = env.CLAUDE_CODE_DISABLE_AGENT_VIEW;
  if (!val) return false;
  if (val === "0") return false;
  if (val.toLowerCase() === "false") return false;
  return true;
}

// ---------------------------------------------------------------------------
// versionAtLeast
// ---------------------------------------------------------------------------

/**
 * Compares two semver-ish version strings on major.minor only.
 * Returns false if version is null/undefined or not parseable.
 */
export function versionAtLeast(
  version: string | null | undefined,
  min: string,
): boolean {
  if (!version) return false;

  const parseParts = (v: string): [number, number] | null => {
    const match = v.match(/^(\d+)\.(\d+)/);
    if (!match) return null;
    return [parseInt(match[1], 10), parseInt(match[2], 10)];
  };

  const vParts = parseParts(version);
  const mParts = parseParts(min);
  if (!vParts || !mParts) return false;

  const [vMaj, vMin] = vParts;
  const [mMaj, mMin] = mParts;

  if (vMaj !== mMaj) return vMaj > mMaj;
  return vMin >= mMin;
}

// ---------------------------------------------------------------------------
// checkAgentsViewAvailable (with memo)
// ---------------------------------------------------------------------------

export type PreflightResult = { ok: true } | { ok: false; reason: string };

/** Module-level memo: only populated from the real claude --version path. */
let _cached: Promise<PreflightResult> | null = null;

/**
 * Checks whether the Agents View is available.
 *
 * When opts.version and opts.env are both provided, the check runs without memo
 * (for tests). Otherwise the result is memoized for the process lifetime.
 */
export async function checkAgentsViewAvailable(opts?: {
  version?: string | null;
  env?: Record<string, string | undefined>;
}): Promise<PreflightResult> {
  // If explicit opts provided, bypass memo (test mode).
  const hasBypass = opts && ("version" in opts || "env" in opts);
  if (hasBypass) {
    return _runCheck(opts?.version, opts?.env ?? process.env);
  }

  // Real path: memoize.
  if (!_cached) {
    _cached = _runCheck(undefined, process.env);
  }
  return _cached;
}

async function _runCheck(
  versionOverride: string | null | undefined,
  env: Record<string, string | undefined>,
): Promise<PreflightResult> {
  // 1. Env check (fastest — no shell-out needed).
  if (isAgentsViewDisabled(env)) {
    return {
      ok: false,
      reason:
        "Orra requires Claude Code's Agents View, but CLAUDE_CODE_DISABLE_AGENT_VIEW is set.",
    };
  }

  // 2. Version check.
  const version =
    versionOverride !== undefined ? versionOverride : await claudeVersion();

  if (!versionAtLeast(version, MIN_VERSION)) {
    return {
      ok: false,
      reason: `Orra requires Claude Code >= 2.1.x with the Agents View; found ${
        version ?? "no claude on PATH"
      }.`,
    };
  }

  return { ok: true };
}
