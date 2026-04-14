import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { handleOrraSetup } from "../../src/tools/orra-setup.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "orra-setup-memory-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

describe("handleOrraSetup — memory scaffold", () => {
  it("creates the memory directory skeleton", async () => {
    await handleOrraSetup(tmpDir);

    const memoryDir = path.join(tmpDir, ".orra", "memory");
    expect(await exists(memoryDir)).toBe(true);
    expect(await exists(path.join(memoryDir, "daily"))).toBe(true);
    expect(await exists(path.join(memoryDir, "worktrees"))).toBe(true);
    expect(await exists(path.join(memoryDir, "retros"))).toBe(true);
    expect(await exists(path.join(memoryDir, "index.md"))).toBe(true);
    expect(await exists(path.join(memoryDir, "commitments.md"))).toBe(true);
  });

  it("does not overwrite existing memory files", async () => {
    const memoryDir = path.join(tmpDir, ".orra", "memory");
    await fs.mkdir(memoryDir, { recursive: true });
    await fs.writeFile(path.join(memoryDir, "index.md"), "USER EDIT");

    await handleOrraSetup(tmpDir);

    const content = await fs.readFile(path.join(memoryDir, "index.md"), "utf-8");
    expect(content).toBe("USER EDIT");
  });

  it("index.md from template contains the managed-file note", async () => {
    await handleOrraSetup(tmpDir);
    const content = await fs.readFile(path.join(tmpDir, ".orra", "memory", "index.md"), "utf-8");
    expect(content).toContain("This file is managed by Orra directives");
  });

  it("writes headlessSpawnConcurrency: 3 to the new config", async () => {
    await handleOrraSetup(tmpDir);
    const configPath = path.join(tmpDir, ".orra", "config.json");
    const raw = await fs.readFile(configPath, "utf-8");
    const config = JSON.parse(raw);
    expect(config.headlessSpawnConcurrency).toBe(3);
  });
});
