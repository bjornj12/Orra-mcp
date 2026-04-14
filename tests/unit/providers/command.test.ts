import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { createCommandProvider } from "../../../src/core/providers/command.js";

describe("CommandProvider", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "orra-cmd-provider-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should use array syntax with echo (no shell eval)", async () => {
    const provider = createCommandProvider({
      type: "command",
      command: ["echo", '{"protocolVersion":"1.0","worktrees":[]}'],
      timeout: 5000,
    }, tmpDir);

    const result = await provider.fetch();
    expect(result.worktrees).toHaveLength(0);
  });

  it("should execute script and parse stdout as JSON", async () => {
    const scriptPath = path.join(tmpDir, "provider.sh");
    fs.writeFileSync(scriptPath, '#!/bin/bash\necho \'{"protocolVersion":"1.0","worktrees":[{"id":"test","path":"/tmp/test","branch":"main"}]}\'', { mode: 0o755 });

    const provider = createCommandProvider({
      type: "command",
      command: [scriptPath],
      timeout: 5000,
    }, tmpDir);

    const result = await provider.fetch();
    expect(result.worktrees).toHaveLength(1);
    expect(result.worktrees[0].id).toBe("test");
  });

  it("should throw on non-zero exit", async () => {
    const provider = createCommandProvider({
      type: "command",
      command: ["false"],
      timeout: 5000,
    }, tmpDir);

    await expect(provider.fetch()).rejects.toThrow();
  });

  it("should use cwd from config", async () => {
    const subDir = path.join(tmpDir, "sub");
    fs.mkdirSync(subDir);

    const provider = createCommandProvider({
      type: "command",
      command: ["sh", "-c", 'echo \'{"protocolVersion":"1.0","worktrees":[{"id":"\'$(basename $(pwd))\'","path":"\'$(pwd)\'","branch":"main"}]}\''],
      cwd: subDir,
      timeout: 5000,
    }, tmpDir);

    const result = await provider.fetch();
    expect(result.worktrees[0].id).toBe("sub");
  });
});
