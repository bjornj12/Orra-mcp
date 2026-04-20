#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { writeCurrentSession } from "../core/session-id.js";

const REMINDER = `<system-reminder>
Orra session active. Your first action MUST be calling orra_resume() to load
prior state from .orra/session-state.json. Do not call any other orra_* tool
first — they will refuse with resume_required until orra_resume has run.
</system-reminder>`;

export type HookResult = { wrote: boolean; additionalContext: string };

export async function runSessionStartHook(opts: {
  projectRoot: string;
  sessionIdInput?: string;
  now?: string;
}): Promise<HookResult> {
  const session_id = opts.sessionIdInput && opts.sessionIdInput.length > 0 ? opts.sessionIdInput : randomUUID();
  const started_at = opts.now ?? new Date().toISOString();
  await writeCurrentSession(opts.projectRoot, { session_id, started_at });
  return { wrote: true, additionalContext: REMINDER };
}

async function mainCli() {
  let body = "";
  for await (const chunk of process.stdin) body += chunk;
  let parsed: { session_id?: string; cwd?: string } = {};
  try { parsed = body.trim().length > 0 ? JSON.parse(body) : {}; } catch { /* tolerate */ }
  const projectRoot = parsed.cwd ?? process.cwd();
  const { additionalContext } = await runSessionStartHook({
    projectRoot,
    sessionIdInput: parsed.session_id,
  });
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: "SessionStart", additionalContext },
  }));
}

if (process.argv[1] && process.argv[1].endsWith("session-start-hook.js")) {
  mainCli().catch((err) => {
    console.error("orra session-start hook:", err);
    process.exit(0); // never block the session
  });
}
