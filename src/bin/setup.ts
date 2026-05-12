#!/usr/bin/env node
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const projectRoot = process.cwd();

  // 1. Create .orra/config.json with defaults
  const orraDir = path.join(projectRoot, ".orra");
  fs.mkdirSync(path.join(orraDir, "agents"), { recursive: true });

  const configPath = path.join(orraDir, "config.json");
  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, JSON.stringify({
      markers: ["spec.md", "PRD.md", "PLAN.md", "CHANGELOG.md"],
      staleDays: 3,
      worktreeDir: "worktrees",
      driftThreshold: 20,
      defaultModel: null,
      defaultAgent: null,
    }, null, 2));
    console.log("Created .orra/config.json");
  } else {
    console.log(".orra/config.json already exists — skipping");
  }

  // 2. Copy orchestrator.md to .claude/agents/
  const agentsDir = path.join(projectRoot, ".claude", "agents");
  fs.mkdirSync(agentsDir, { recursive: true });

  const orchestratorSrc = path.join(currentDir, "..", "templates", "orchestrator.md");
  const orchestratorDest = path.join(agentsDir, "orchestrator.md");
  fs.copyFileSync(orchestratorSrc, orchestratorDest);
  console.log("Updated .claude/agents/orchestrator.md");

  // 3. Add .orra/ to .gitignore
  const gitignorePath = path.join(projectRoot, ".gitignore");
  let gitignore = "";
  try { gitignore = fs.readFileSync(gitignorePath, "utf-8"); } catch {}
  if (!gitignore.includes(".orra/")) {
    fs.appendFileSync(gitignorePath, "\n# Orra MCP state\n.orra/\n");
    console.log("Added .orra/ to .gitignore");
  }

  // 4. Scaffold .orra/memory/ skeleton
  const memoryDir = path.join(orraDir, "memory");
  fs.mkdirSync(path.join(memoryDir, "daily"), { recursive: true });
  fs.mkdirSync(path.join(memoryDir, "worktrees"), { recursive: true });
  fs.mkdirSync(path.join(memoryDir, "retros"), { recursive: true });

  const memoryTemplates = ["index.md", "commitments.md"];
  for (const file of memoryTemplates) {
    const dest = path.join(memoryDir, file);
    if (!fs.existsSync(dest)) {
      const src = path.join(currentDir, "..", "templates", "memory", file);
      fs.copyFileSync(src, dest);
      console.log(`Created .orra/memory/${file}`);
    } else {
      console.log(`.orra/memory/${file} already exists — skipping`);
    }
  }

  // 5. Ensure the Orra MCP server entry exists in .mcp.json (merge, don't clobber)
  const mcpPath = path.join(projectRoot, ".mcp.json");
  let mcpConfig: Record<string, unknown> = {};
  if (fs.existsSync(mcpPath)) {
    try { mcpConfig = JSON.parse(fs.readFileSync(mcpPath, "utf8")); } catch { /* start fresh */ }
  }
  const ORRA_KEY = "orra";
  if (!mcpConfig[ORRA_KEY] && !mcpConfig["orra-mcp"]) {
    mcpConfig[ORRA_KEY] = { command: "npx", args: ["-y", "orra-mcp"] };
    fs.writeFileSync(mcpPath, JSON.stringify(mcpConfig, null, 2));
    console.log("Added orra MCP server entry to .mcp.json");
  } else {
    console.log(".mcp.json already has orra entry — skipping");
  }

  // 6. Write sample WorktreeCreate hook to .claude/hooks/worktree-create.sh
  const hooksDir = path.join(projectRoot, ".claude", "hooks");
  fs.mkdirSync(hooksDir, { recursive: true });

  const hookSrc = path.join(currentDir, "..", "templates", "hooks", "worktree-create.sh");
  const hookDest = path.join(hooksDir, "worktree-create.sh");
  fs.copyFileSync(hookSrc, hookDest);
  fs.chmodSync(hookDest, 0o755);
  console.log("Wrote .claude/hooks/worktree-create.sh");

  // 7. Install SessionStart + WorktreeCreate hooks in .claude/settings.json
  const settingsPath = path.join(projectRoot, ".claude", "settings.json");
  let existing: Record<string, any> = {};
  if (fs.existsSync(settingsPath)) {
    try { existing = JSON.parse(fs.readFileSync(settingsPath, "utf-8")); } catch { /* start fresh */ }
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
    console.log("Installed SessionStart hook in .claude/settings.json");
  } else {
    console.log("SessionStart hook already installed — skipping");
  }

  // WorktreeCreate hook — only if not already present
  const worktreeHookInstalled = Array.isArray(existing.hooks.WorktreeCreate) &&
    existing.hooks.WorktreeCreate.length > 0;
  if (!worktreeHookInstalled) {
    existing.hooks.WorktreeCreate = [
      {
        hooks: [{ type: "command", command: `bash "${hookDest}"` }],
      },
    ];
    console.log("Installed WorktreeCreate hook in .claude/settings.json");
  } else {
    console.log("WorktreeCreate hook already present — skipping (merge manually if needed)");
  }

  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(existing, null, 2));

  console.log("\nSetup complete! Run the orchestrator:");
  console.log("  orra");
  console.log("  # or: claude --bg --agent orchestrator --name orra");
}

main().catch((err) => {
  console.error("orra setup failed:", err);
  process.exit(1);
});
