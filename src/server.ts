import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AgentManager } from "./core/agent-manager.js";
import { orraScanSchema, handleOrraScan } from "./tools/orra-scan.js";
import { orraInspectSchema, handleOrraInspect } from "./tools/orra-inspect.js";
import { orraKillSchema, handleOrraKill } from "./tools/orra-kill.js";
import { orraUnblockSchema, handleOrraUnblock } from "./tools/orra-unblock.js";
import { orraRebaseSchema, handleOrraRebase } from "./tools/orra-rebase.js";
import { orraRegisterSchema, handleOrraRegister } from "./tools/orra-register.js";
import { orraSetupSchema, handleOrraSetup } from "./tools/orra-setup.js";
import { orraDirectiveSchema, handleOrraDirective } from "./tools/orra-directive.js";
import { orraSpawnSchema, handleOrraSpawn } from "./tools/orra-spawn.js";
import { orraResumeSchema, handleOrraResume } from "./tools/orra-resume.js";
import { orraCheckpointSchema, handleOrraCheckpoint } from "./tools/orra-checkpoint.js";
import { orraCacheWriteSchema, handleOrraCacheWrite } from "./tools/orra-cache-write.js";
import { orraTickSchema, handleOrraTick } from "./tools/orra-tick.js";
import { checkResumeGate } from "./core/resume-gate.js";
import { toMcpContent, fail } from "./core/envelope.js";

export async function gateOrPass<R extends { content: unknown[]; isError?: boolean }>(
  projectRoot: string,
  handler: () => Promise<R>,
): Promise<R> {
  const gate = await checkResumeGate(projectRoot);
  if (!gate.ok) {
    return toMcpContent(fail("resume_required", { hint: gate.hint })) as unknown as R;
  }
  return handler();
}

export function createServer(projectRoot: string): { server: McpServer; manager: AgentManager } {
  const server = new McpServer({ name: "orra-mcp", version: "0.4.0" });
  const manager = new AgentManager(projectRoot);

  // Exempt from gate: orra_resume (the handshake itself) and orra_setup (bootstrap).
  server.tool("orra_resume", "Load prior session state. MUST be called as the FIRST action of every orchestrator session before any other orra_* tool.", orraResumeSchema.shape, async (args) => handleOrraResume(projectRoot, orraResumeSchema.parse(args)));
  server.tool("orra_setup", "Initialize Orra in this project — creates .orra/config.json, installs orchestrator agent persona to .claude/agents/, adds .orra/ to .gitignore, installs SessionStart hook.", orraSetupSchema.shape, async () => handleOrraSetup(projectRoot));

  const gate = <R extends { content: unknown[]; isError?: boolean }>(fn: () => Promise<R>): Promise<R> =>
    gateOrPass(projectRoot, fn);

  server.tool("orra_scan", "Scan all worktrees — accepts filter/fields for focused output.", orraScanSchema.shape, async (args) => gate(() => handleOrraScan(projectRoot, orraScanSchema.parse(args))));
  server.tool("orra_inspect", "Inspect worktree/session/cache. target:'worktree'|'session'|'cache', id, filter, fields, limit.", orraInspectSchema.shape, async (args) => gate(() => handleOrraInspect(projectRoot, orraInspectSchema.parse(args))));
  server.tool("orra_register", "Register an existing worktree with Orra.", orraRegisterSchema.shape, async (args) => gate(() => handleOrraRegister(projectRoot, orraRegisterSchema.parse(args))));
  server.tool("orra_kill", "Stop tracked agent and optionally remove the worktree + close PR.", orraKillSchema.shape, async (args) => gate(() => handleOrraKill(manager, orraKillSchema.parse(args))));
  server.tool("orra_unblock", "Answer a pending permission prompt for an agent.", orraUnblockSchema.shape, async (args) => gate(() => handleOrraUnblock(projectRoot, orraUnblockSchema.parse(args))));
  server.tool("orra_rebase", "Rebase a worktree branch on latest main.", orraRebaseSchema.shape, async (args) => gate(() => handleOrraRebase(manager, projectRoot, orraRebaseSchema.parse(args))));
  server.tool("orra_directive", "Add, list, or remove orchestrator directives.", orraDirectiveSchema.shape, async (args) => gate(() => handleOrraDirective(projectRoot, orraDirectiveSchema.parse(args))));
  server.tool("orra_spawn", "Spawn a headless `claude --print` agent. Subject to headlessSpawnConcurrency limit.", orraSpawnSchema.shape, async (args) => gate(() => handleOrraSpawn(manager, orraSpawnSchema.parse(args))));
  server.tool("orra_tick", "Dispatch a directive tick. Returns a subagent_spec for lean directives or the body for inline directives.", orraTickSchema.shape, async (args) => gate(() => handleOrraTick(projectRoot, orraTickSchema.parse(args))));
  server.tool("orra_checkpoint", "Write session-state.json + resume.md. Call before prompting user to /compact, and periodically every ~10 ticks.", orraCheckpointSchema.shape, async (args) => gate(() => handleOrraCheckpoint(projectRoot, orraCheckpointSchema.parse(args))));
  server.tool("orra_cache_write", "Subagent-facing: persist lean-tick output + update session-state seen/last_surfaced. Called by lean-directive subagents, not the orchestrator.", orraCacheWriteSchema.shape, async (args) => gate(() => handleOrraCacheWrite(projectRoot, orraCacheWriteSchema.parse(args))));

  return { server, manager };
}
