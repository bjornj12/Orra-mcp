import { z } from "zod";
import * as fsp from "node:fs/promises";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { ok, toMcpContent } from "../core/envelope.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));

export const orraSetupSchema = z.object({});

export async function handleOrraSetup(projectRoot: string, _args?: z.infer<typeof orraSetupSchema>) {
  const results: string[] = [];

  // 1. Create .orra/config.json with defaults
  const orraDir = path.join(projectRoot, ".orra");
  await fsp.mkdir(path.join(orraDir, "agents"), { recursive: true });

  const configPath = path.join(orraDir, "config.json");
  if (!fs.existsSync(configPath)) {
    await fsp.writeFile(configPath, JSON.stringify({
      markers: ["spec.md", "PRD.md", "PLAN.md", "CHANGELOG.md"],
      staleDays: 3,
      worktreeDir: "worktrees",
      driftThreshold: 20,
      defaultModel: null,
      defaultAgent: null,
    }, null, 2));
    results.push("Created .orra/config.json");
  } else {
    results.push(".orra/config.json already exists — skipped");
  }

  // 2. Copy orchestrator.md to .claude/agents/
  const agentsDir = path.join(projectRoot, ".claude", "agents");
  await fsp.mkdir(agentsDir, { recursive: true });

  const orchestratorSrc = path.join(currentDir, "..", "templates", "orchestrator.md");
  const orchestratorDest = path.join(agentsDir, "orchestrator.md");
  await fsp.copyFile(orchestratorSrc, orchestratorDest);
  results.push("Updated .claude/agents/orchestrator.md");

  // 3. Add .orra/ to .gitignore
  const gitignorePath = path.join(projectRoot, ".gitignore");
  let gitignore = "";
  try { gitignore = await fsp.readFile(gitignorePath, "utf-8"); } catch {}
  if (!gitignore.includes(".orra/")) {
    await fsp.appendFile(gitignorePath, "\n# Orra MCP state\n.orra/\n");
    results.push("Added .orra/ to .gitignore");
  }

  // 4. Scaffold .orra/memory/ skeleton
  const memoryDir = path.join(orraDir, "memory");
  await fsp.mkdir(path.join(memoryDir, "daily"), { recursive: true });
  await fsp.mkdir(path.join(memoryDir, "worktrees"), { recursive: true });
  await fsp.mkdir(path.join(memoryDir, "retros"), { recursive: true });

  const memoryTemplates = ["index.md", "commitments.md"];
  for (const file of memoryTemplates) {
    const dest = path.join(memoryDir, file);
    if (!fs.existsSync(dest)) {
      const src = path.join(currentDir, "..", "templates", "memory", file);
      await fsp.copyFile(src, dest);
      results.push(`Created .orra/memory/${file}`);
    } else {
      results.push(`.orra/memory/${file} already exists — skipped`);
    }
  }

  // 5. Ensure the Orra MCP server entry exists in .mcp.json (merge, don't clobber)
  const asObject = (v: unknown): Record<string, unknown> =>
    v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

  const mcpPath = path.join(projectRoot, ".mcp.json");
  let mcpConfig: Record<string, unknown> = {};
  if (fs.existsSync(mcpPath)) {
    try { mcpConfig = asObject(JSON.parse(await fsp.readFile(mcpPath, "utf8"))); } catch { /* start fresh */ }
  }
  const ORRA_KEY = "orra";
  if (!mcpConfig[ORRA_KEY] && !mcpConfig["orra-mcp"]) {
    mcpConfig[ORRA_KEY] = { command: "npx", args: ["-y", "orra-mcp"] };
    await fsp.writeFile(mcpPath, JSON.stringify(mcpConfig, null, 2));
    results.push("Added orra MCP server entry to .mcp.json");
  } else {
    results.push(".mcp.json already has orra entry — skipped");
  }

  // 6. Write sample WorktreeCreate hook to .claude/hooks/worktree-create.sh
  const hooksDir = path.join(projectRoot, ".claude", "hooks");
  await fsp.mkdir(hooksDir, { recursive: true });

  const hookSrc = path.join(currentDir, "..", "templates", "hooks", "worktree-create.sh");
  const hookDest = path.join(hooksDir, "worktree-create.sh");
  await fsp.copyFile(hookSrc, hookDest);
  await fsp.chmod(hookDest, 0o755);
  results.push("Wrote .claude/hooks/worktree-create.sh");

  // 7. Install SessionStart hook + WorktreeCreate hook in .claude/settings.json (merge, don't overwrite)
  const settingsPath = path.join(projectRoot, ".claude", "settings.json");
  let existing: Record<string, any> = {};
  if (fs.existsSync(settingsPath)) {
    try { existing = asObject(JSON.parse(await fsp.readFile(settingsPath, "utf8"))); } catch { /* start fresh */ }
  }
  existing.hooks = existing.hooks ?? {};

  // SessionStart hook
  existing.hooks.SessionStart = existing.hooks.SessionStart ?? [];
  const SESSION_HOOK_CMD = "npx orra-session-start-hook";
  const sessionHookInstalled = (existing.hooks.SessionStart as any[]).some((entry: any) =>
    Array.isArray(entry?.hooks) &&
    entry.hooks.some((h: any) => typeof h.command === "string" && h.command.includes("orra-session-start-hook")),
  );
  if (!sessionHookInstalled) {
    existing.hooks.SessionStart.push({
      matcher: "",
      hooks: [{ type: "command", command: SESSION_HOOK_CMD }],
    });
    results.push("Installed SessionStart hook in .claude/settings.json");
  } else {
    results.push("SessionStart hook already installed — skipped");
  }

  // WorktreeCreate hook — only if not already present (don't clobber user's hook)
  const worktreeHookInstalled = Array.isArray(existing.hooks.WorktreeCreate) &&
    existing.hooks.WorktreeCreate.length > 0;
  if (!worktreeHookInstalled) {
    existing.hooks.WorktreeCreate = [
      {
        hooks: [{ type: "command", command: `bash "${hookDest}"` }],
      },
    ];
    results.push("Installed WorktreeCreate hook in .claude/settings.json");
  } else {
    results.push("WorktreeCreate hook already present — skipped (merge manually if needed)");
  }

  await fsp.mkdir(path.dirname(settingsPath), { recursive: true });
  await fsp.writeFile(settingsPath, JSON.stringify(existing, null, 2));

  return toMcpContent(ok({
    setup: true,
    actions: results,
    next: "Run `orra` to start the orchestrator as a persistent background agent",
  }));
}
