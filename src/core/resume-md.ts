import type { SessionState, TickLogEntry } from "../types.js";

export function renderResumeMd(state: SessionState, recentTicks: TickLogEntry[]): string {
  const lines: string[] = [];
  lines.push(`# Orra Session Resume — ${state.last_checkpoint_at ?? state.last_resume_at}`);
  lines.push("");
  lines.push("## What I'm doing");
  lines.push(
    `Operating as Orra orchestrator. Session started ${state.session_started_at}. ${state.tick_count} ticks so far.`,
  );
  lines.push("");

  lines.push("## Open threads (resume these)");
  if (state.open_threads.length === 0) {
    lines.push("No open threads.");
  } else {
    for (const t of state.open_threads) {
      lines.push(`- **${t.topic}** — ${t.status} since ${t.since}. (thread id: ${t.id})`);
    }
  }
  lines.push("");

  const surfaced = Object.entries(state.last_surfaced);
  if (surfaced.length > 0) {
    lines.push("## Recently surfaced (don't repeat)");
    for (const [directive, rec] of surfaced) {
      lines.push(`- ${directive}: ${rec.suggestion_id} at ${rec.at}`);
    }
    lines.push("");
  }

  if (recentTicks.length > 0) {
    lines.push("## Recent tick digests");
    for (const t of recentTicks.slice(-5)) {
      lines.push(`- [${t.ts}] ${t.directive_id}: ${t.digest}`);
    }
    lines.push("");
  }

  lines.push("## State files");
  lines.push("- `.orra/session-state.json` — full durable state");
  lines.push("- `.orra/cache/*.json` — latest directive results");
  lines.push("");
  lines.push("## Next steps");
  lines.push("- Resume heartbeat ticks on schedule.");
  lines.push("- Address open threads before issuing new directives.");

  return lines.join("\n") + "\n";
}

export function resumeMdPath(projectRoot: string): string {
  return `${projectRoot}/.orra/resume.md`;
}
