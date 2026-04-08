#!/usr/bin/env node
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));

function main() {
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
  if (!fs.existsSync(orchestratorDest)) {
    fs.copyFileSync(orchestratorSrc, orchestratorDest);
    console.log("Created .claude/agents/orchestrator.md");
  } else {
    console.log(".claude/agents/orchestrator.md already exists — skipping");
  }

  // 3. Add .orra/ to .gitignore
  const gitignorePath = path.join(projectRoot, ".gitignore");
  let gitignore = "";
  try { gitignore = fs.readFileSync(gitignorePath, "utf-8"); } catch {}
  if (!gitignore.includes(".orra/")) {
    fs.appendFileSync(gitignorePath, "\n# Orra MCP state\n.orra/\n");
    console.log("Added .orra/ to .gitignore");
  }

  console.log("\nSetup complete! Launch the orchestrator:");
  console.log("  claude --agent orchestrator");
}

main();
