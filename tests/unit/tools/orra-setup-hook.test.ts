import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { handleOrraSetup, orraSetupSchema } from "../../../src/tools/orra-setup.js";

let tmp: string;

beforeEach(async () => { tmp = await fs.mkdtemp(path.join(os.tmpdir(), "orra-setup-")); });
afterEach(async () => { await fs.rm(tmp, { recursive: true, force: true }); });

async function exists(p: string): Promise<boolean> {
  try { await fs.access(p); return true; } catch { return false; }
}

describe("orra_setup — orchestrator agent", () => {
  it("writes .claude/agents/orchestrator.md", async () => {
    await handleOrraSetup(tmp, orraSetupSchema.parse({}));
    expect(await exists(path.join(tmp, ".claude", "agents", "orchestrator.md"))).toBe(true);
    const content = await fs.readFile(path.join(tmp, ".claude", "agents", "orchestrator.md"), "utf8");
    expect(content).toContain("orchestrator");
  });
});

describe("orra_setup — .mcp.json", () => {
  it("creates a valid-JSON .mcp.json with the orra server entry", async () => {
    await handleOrraSetup(tmp, orraSetupSchema.parse({}));
    const mcpPath = path.join(tmp, ".mcp.json");
    expect(await exists(mcpPath)).toBe(true);
    const mcp = JSON.parse(await fs.readFile(mcpPath, "utf8"));
    // The orra server entry should exist under 'orra' or 'orra-mcp'
    const orraEntry = mcp["orra"] ?? mcp["orra-mcp"];
    expect(orraEntry).toBeDefined();
    expect(orraEntry.command).toBeDefined();
  });

  it("merges with existing .mcp.json without clobbering other servers", async () => {
    await fs.writeFile(path.join(tmp, ".mcp.json"), JSON.stringify({
      "other-server": { command: "other-cmd", args: [] }
    }));
    await handleOrraSetup(tmp, orraSetupSchema.parse({}));
    const mcp = JSON.parse(await fs.readFile(path.join(tmp, ".mcp.json"), "utf8"));
    expect(mcp["other-server"]).toBeDefined();
    const orraEntry = mcp["orra"] ?? mcp["orra-mcp"];
    expect(orraEntry).toBeDefined();
  });
});

describe("orra_setup — WorktreeCreate hook", () => {
  it("writes .claude/hooks/worktree-create.sh", async () => {
    await handleOrraSetup(tmp, orraSetupSchema.parse({}));
    const hookPath = path.join(tmp, ".claude", "hooks", "worktree-create.sh");
    expect(await exists(hookPath)).toBe(true);
    const content = await fs.readFile(hookPath, "utf8");
    expect(content).toContain("#!/usr/bin/env bash");
  });

  it("makes worktree-create.sh executable", async () => {
    await handleOrraSetup(tmp, orraSetupSchema.parse({}));
    const hookPath = path.join(tmp, ".claude", "hooks", "worktree-create.sh");
    const stat = await fs.stat(hookPath);
    // Check that at least the owner execute bit is set (0o100)
    expect(stat.mode & 0o100).toBeTruthy();
  });

  it("writes settings.json with a hooks.WorktreeCreate entry pointing at the hook script", async () => {
    await handleOrraSetup(tmp, orraSetupSchema.parse({}));
    const settingsPath = path.join(tmp, ".claude", "settings.json");
    expect(await exists(settingsPath)).toBe(true);
    const settings = JSON.parse(await fs.readFile(settingsPath, "utf8"));
    expect(settings.hooks?.WorktreeCreate).toBeDefined();
    const entry = settings.hooks.WorktreeCreate[0];
    expect(entry.hooks[0].command).toContain("worktree-create.sh");
  });

  it("does NOT install a WorktreeCreate entry if one already exists", async () => {
    await fs.mkdir(path.join(tmp, ".claude"), { recursive: true });
    await fs.writeFile(path.join(tmp, ".claude", "settings.json"), JSON.stringify({
      hooks: {
        WorktreeCreate: [
          { hooks: [{ type: "command", command: "my-custom-hook.sh" }] }
        ]
      }
    }));
    await handleOrraSetup(tmp, orraSetupSchema.parse({}));
    const settings = JSON.parse(await fs.readFile(path.join(tmp, ".claude", "settings.json"), "utf8"));
    // Should still have exactly one entry (the user's custom one)
    expect(settings.hooks.WorktreeCreate).toHaveLength(1);
    expect(settings.hooks.WorktreeCreate[0].hooks[0].command).toBe("my-custom-hook.sh");
  });
});

describe("orra_setup — SessionStart hook still installed", () => {
  it("writes .claude/settings.json with SessionStart hook entry", async () => {
    await handleOrraSetup(tmp, orraSetupSchema.parse({}));
    const settings = JSON.parse(await fs.readFile(path.join(tmp, ".claude", "settings.json"), "utf8"));
    expect(settings.hooks?.SessionStart).toBeDefined();
    const entry = settings.hooks.SessionStart[0];
    expect(entry.hooks[0].command).toContain("orra-session-start-hook");
  });

  it("merges with existing settings.json rather than overwriting", async () => {
    await fs.mkdir(path.join(tmp, ".claude"), { recursive: true });
    await fs.writeFile(path.join(tmp, ".claude", "settings.json"), JSON.stringify({
      theme: "dark",
      hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "echo pre" }] }] },
    }));
    await handleOrraSetup(tmp, orraSetupSchema.parse({}));
    const settings = JSON.parse(await fs.readFile(path.join(tmp, ".claude", "settings.json"), "utf8"));
    expect(settings.theme).toBe("dark");
    expect(settings.hooks.PreToolUse).toBeDefined();
    expect(settings.hooks.SessionStart).toBeDefined();
  });
});

describe("orra_setup — old permission hook is NOT installed", () => {
  it("does not write any PermissionRequest hook", async () => {
    await handleOrraSetup(tmp, orraSetupSchema.parse({}));
    const settings = JSON.parse(await fs.readFile(path.join(tmp, ".claude", "settings.json"), "utf8"));
    expect(settings.hooks?.PermissionRequest).toBeUndefined();
  });
});
