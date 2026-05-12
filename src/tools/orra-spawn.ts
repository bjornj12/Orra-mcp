import { z } from "zod";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import * as cli from "../core/claude-cli.js";
import { readJobState, configDir } from "../core/daemon-state.js";
import { recordSpawn } from "../core/state.js";
import { loadConfig } from "../core/config.js";
import { slugify } from "../core/slug.js";
import { ok, fail, toMcpContent } from "../core/envelope.js";
import { checkAgentsViewAvailable } from "../core/agents-view-preflight.js";

export const orraSpawnSchema = z.object({
  task: z.string().trim().min(1).describe("The task prompt for the spawned bg agent."),
  reason: z.string().trim().min(1).describe("Why this agent is being spawned (logged for accountability)."),
  model: z.string().trim().optional().transform((v) => v === "" ? undefined : v).describe("Optional: override the default model."),
  agent: z.string().trim().optional().transform((v) => v === "" ? undefined : v).describe("Optional: agent persona to use."),
  allowedTools: z.array(z.string()).optional().describe("Optional: auto-approved tools (added on top of session defaults)."),
  disallowedTools: z.array(z.string()).optional().describe("Optional: tools to explicitly block."),
  worktree: z.boolean().optional().describe("Optional: when true, claude --bg creates a native worktree for this session."),
  cwd: z.string().trim().optional().transform((v) => v === "" ? undefined : v).describe("Optional: working directory for the spawned agent."),
});

export async function handleOrraSpawn(
  projectRoot: string,
  input: z.infer<typeof orraSpawnSchema>,
) {
  try {
    // Preflight inside try so a thrown exception is caught by the MCP error envelope.
    const pf = await checkAgentsViewAvailable();
    if (!pf.ok) {
      return toMcpContent(fail(pf.reason, { code: "agents_view_unavailable" }));
    }

    const config = await loadConfig(projectRoot);
    const slug = slugify(input.task);

    const result = await cli.bgSpawn({
      name: slug,
      task: input.task,
      model: input.model ?? config.defaultModel ?? undefined,
      agent: input.agent ?? config.defaultAgent ?? undefined,
      allowedTools: input.allowedTools,
      disallowedTools: input.disallowedTools,
      worktree: input.worktree,
      cwd: input.cwd,
    });

    // Post-spawn bookkeeping: ledger + memory note.
    // These are best-effort — the agent IS running regardless of whether this succeeds.
    // Failures return a warning rather than spawn_failed (which would imply retrying
    // would be safe, but would cause a double-spawn).
    let sessionId = result.shortId;
    const warnings: string[] = [];
    try {
      // Try to read the daemon's job state to get the full sessionId
      const jobState = await readJobState(configDir(), result.shortId);
      sessionId = jobState?.sessionId ?? result.shortId;

      // Record provenance in the spawn ledger
      await recordSpawn(projectRoot, {
        shortId: result.shortId,
        sessionId,
        slug,
        task: input.task,
        reason: input.reason,
        spawnedBy: process.env.ORRA_AGENT_ID ?? "orchestrator",
      });

      // Append a memory note to .orra/memory/worktrees/<slug>.md
      const memoryDir = path.join(projectRoot, ".orra", "memory", "worktrees");
      await fsp.mkdir(memoryDir, { recursive: true });
      const memoryFile = path.join(memoryDir, `${slug}.md`);
      const line = `- spawned ${new Date().toISOString()}: ${input.reason} (session ${result.shortId})\n`;
      await fsp.appendFile(memoryFile, line);
    } catch (err) {
      warnings.push(err instanceof Error ? err.message : String(err));
    }

    return toMcpContent(ok({
      spawned: true,
      shortId: result.shortId,
      sessionId,
      name: slug,
      reason: input.reason,
      ...(warnings.length > 0 ? { warnings } : {}),
    }));
  } catch (err) {
    return toMcpContent(fail(err instanceof Error ? err.message : String(err), {
      code: "spawn_failed",
    }));
  }
}
