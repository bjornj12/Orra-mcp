import { describe, it, expect } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { loadConfig } from "../../src/core/config.js";

const DEFAULTS = {
  markers: ["spec.md", "PRD.md", "PLAN.md", "CHANGELOG.md"],
  staleDays: 3,
  worktreeDir: "worktrees",
  driftThreshold: 20,
  defaultModel: null,
  defaultAgent: null,
};

async function makeTmpDir(): Promise<string> {
  return await fs.mkdtemp(path.join(os.tmpdir(), "orra-config-test-"));
}

describe("loadConfig", () => {
  it("returns defaults when no config file exists", async () => {
    const tmpDir = await makeTmpDir();
    const config = await loadConfig(tmpDir);
    expect(config).toEqual(DEFAULTS);
  });

  it("reads config from .orra/config.json with partial overrides, applying defaults for unset fields", async () => {
    const tmpDir = await makeTmpDir();
    const orraDir = path.join(tmpDir, ".orra");
    await fs.mkdir(orraDir);
    await fs.writeFile(
      path.join(orraDir, "config.json"),
      JSON.stringify({ staleDays: 7, defaultModel: "claude-opus-4-5" })
    );

    const config = await loadConfig(tmpDir);
    expect(config).toEqual({
      ...DEFAULTS,
      staleDays: 7,
      defaultModel: "claude-opus-4-5",
    });
  });

  it("handles invalid JSON gracefully by returning defaults", async () => {
    const tmpDir = await makeTmpDir();
    const orraDir = path.join(tmpDir, ".orra");
    await fs.mkdir(orraDir);
    await fs.writeFile(path.join(orraDir, "config.json"), "not valid json {{{");

    const config = await loadConfig(tmpDir);
    expect(config).toEqual(DEFAULTS);
  });
});
