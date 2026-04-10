import * as fs from "node:fs/promises";
import * as path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { StageInfo } from "./providers/types.js";

const execFileAsync = promisify(execFile);

// --- Types ---

interface DetectPrimitive {
  marker?: string;
  notMarker?: string;
  branchPattern?: string;
  commitPattern?: string;
  custom?: { command: string[]; timeout?: number };
}

interface DetectRule {
  all?: DetectPrimitive[];
  any?: DetectPrimitive[];
  marker?: string;
  notMarker?: string;
  branchPattern?: string;
  commitPattern?: string;
  custom?: { command: string[]; timeout?: number };
}

interface PipelineStage {
  name: string;
  detect: DetectRule;
}

export interface PipelineDefinition {
  name: string;
  stages: PipelineStage[];
}

// --- Load ---

export async function loadPipeline(projectRoot: string): Promise<PipelineDefinition | null> {
  const pipelinePath = path.join(projectRoot, ".orra", "pipeline.json");
  try {
    const data = await fs.readFile(pipelinePath, "utf-8");
    return JSON.parse(data) as PipelineDefinition;
  } catch {
    return null;
  }
}

// --- Detection ---

async function checkPrimitive(
  primitive: DetectPrimitive,
  worktree: { path: string; branch: string },
): Promise<boolean> {
  if (primitive.marker) {
    try {
      await fs.access(path.join(worktree.path, primitive.marker));
      return true;
    } catch {
      return false;
    }
  }

  if (primitive.notMarker) {
    try {
      await fs.access(path.join(worktree.path, primitive.notMarker));
      return false;
    } catch {
      return true;
    }
  }

  if (primitive.branchPattern) {
    return new RegExp(primitive.branchPattern).test(worktree.branch);
  }

  if (primitive.commitPattern) {
    try {
      const { stdout } = await execFileAsync("git", ["-C", worktree.path, "log", "-1", "--format=%s"]);
      return new RegExp(primitive.commitPattern).test(stdout.trim());
    } catch {
      return false;
    }
  }

  if (primitive.custom) {
    try {
      const [program, ...args] = primitive.custom.command;
      const { stdout } = await execFileAsync(program, args, {
        cwd: worktree.path,
        timeout: primitive.custom.timeout ?? 5000,
      });
      const result = JSON.parse(stdout);
      return result.matched === true;
    } catch {
      return false;
    }
  }

  return false;
}

async function checkRule(
  rule: DetectRule,
  worktree: { path: string; branch: string },
): Promise<boolean> {
  if (rule.all) {
    const results = await Promise.all(rule.all.map((p) => checkPrimitive(p, worktree)));
    return results.every(Boolean);
  }

  if (rule.any) {
    const results = await Promise.all(rule.any.map((p) => checkPrimitive(p, worktree)));
    return results.some(Boolean);
  }

  return checkPrimitive(rule as DetectPrimitive, worktree);
}

export async function detectStage(
  worktree: { path: string; branch: string },
  pipeline: PipelineDefinition,
): Promise<StageInfo | null> {
  for (const stage of pipeline.stages) {
    const matched = await checkRule(stage.detect, worktree);
    if (matched) {
      return { name: stage.name };
    }
  }
  return null;
}
