import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { handleOrraSetup, orraSetupSchema } from "../../../src/tools/orra-setup.js";

let tmp: string;

beforeEach(async () => { tmp = await fs.mkdtemp(path.join(os.tmpdir(), "orra-setup-")); });
afterEach(async () => { await fs.rm(tmp, { recursive: true, force: true }); });

describe("orra_setup installs SessionStart hook", () => {
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
