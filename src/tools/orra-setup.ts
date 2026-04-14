import { z } from "zod";
import * as fsp from "node:fs/promises";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));

export const orraSetupSchema = z.object({});

export async function handleOrraSetup(projectRoot: string) {
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
  results.push(fs.existsSync(orchestratorDest) ? "Updated .claude/agents/orchestrator.md" : "Created .claude/agents/orchestrator.md");

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

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        setup: true,
        actions: results,
        next: "Start a new session with: claude --agent orchestrator",
      }, null, 2),
    }],
  };
}
