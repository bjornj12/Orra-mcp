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

export function createServer(projectRoot: string): { server: McpServer; manager: AgentManager } {
  const server = new McpServer({ name: "orra-mcp", version: "0.3.0" });
  const manager = new AgentManager(projectRoot);

  server.tool("orra_scan", "Scan all worktrees — returns status summary (ready_to_land, needs_attention, in_progress, idle, stale) with git state, file markers, PRs, and agent status.", orraScanSchema.shape, async () => handleOrraScan(projectRoot));
  server.tool("orra_inspect", "Deep dive on one worktree — full git state, commit log, markers, PR reviews, agent output, conflict prediction.", orraInspectSchema.shape, async (args) => handleOrraInspect(projectRoot, orraInspectSchema.parse(args)));
  server.tool("orra_register", "Register an existing worktree with Orra — installs hooks for agent state tracking and creates initial state file. Use this for worktrees you created manually or via another tool (e.g., Superset).", orraRegisterSchema.shape, async (args) => handleOrraRegister(projectRoot, orraRegisterSchema.parse(args)));
  server.tool("orra_kill", "Stop tracked agent (SIGTERM by PID) and optionally remove the worktree + clean branch. Optionally close PR.", orraKillSchema.shape, async (args) => handleOrraKill(manager, orraKillSchema.parse(args)));
  server.tool("orra_unblock", "Answer a pending permission prompt for an agent.", orraUnblockSchema.shape, async (args) => handleOrraUnblock(projectRoot, orraUnblockSchema.parse(args)));
  server.tool("orra_rebase", "Rebase a worktree branch on latest main.", orraRebaseSchema.shape, async (args) => handleOrraRebase(manager, projectRoot, orraRebaseSchema.parse(args)));
  server.tool("orra_setup", "Initialize Orra in this project — creates .orra/config.json, installs orchestrator agent persona to .claude/agents/, adds .orra/ to .gitignore.", orraSetupSchema.shape, async () => handleOrraSetup(projectRoot));
  server.tool("orra_directive", "Add, list, or remove orchestrator directives. Directives extend what the orchestrator does on session start (e.g., check Linear tasks, monitor deploys). Stored in .orra/directives/.", orraDirectiveSchema.shape, async (args) => handleOrraDirective(projectRoot, orraDirectiveSchema.parse(args)));
  server.tool("orra_spawn", "Spawn a headless `claude --print` agent in a worktree (existing or new) with locked-down tool permissions. Use for routine maintenance work the user shouldn't have to touch (rebases, lint fixes, snapshot updates). Returns the spawned agent's id, pid, worktree path, and log path. Subject to .orra/config.json's headlessSpawnConcurrency limit (default 3).", orraSpawnSchema.shape, async (args) => handleOrraSpawn(manager, orraSpawnSchema.parse(args)));

  return { server, manager };
}
