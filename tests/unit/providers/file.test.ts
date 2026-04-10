import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { createFileProvider } from "../../../src/core/providers/file.js";

describe("FileProvider", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "orra-file-provider-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should read and parse valid state file", async () => {
    const statePath = path.join(tmpDir, "state.json");
    fs.writeFileSync(statePath, JSON.stringify({
      orraProtocolVersion: "1.0",
      worktrees: [{ id: "feat-a", path: "/tmp/feat-a", branch: "feat/a" }],
    }));

    const provider = createFileProvider({ type: "file", path: statePath }, tmpDir);
    const result = await provider.fetch();
    expect(result.worktrees).toHaveLength(1);
    expect(result.worktrees[0].id).toBe("feat-a");
  });

  it("should resolve relative paths from project root", async () => {
    const orraDir = path.join(tmpDir, ".orra");
    fs.mkdirSync(orraDir, { recursive: true });
    fs.writeFileSync(path.join(orraDir, "state.json"), JSON.stringify({
      orraProtocolVersion: "1.0",
      worktrees: [],
    }));

    const provider = createFileProvider({ type: "file", path: ".orra/state.json" }, tmpDir);
    const result = await provider.fetch();
    expect(result.worktrees).toHaveLength(0);
  });

  it("should throw on missing file", async () => {
    const provider = createFileProvider({ type: "file", path: "/tmp/nonexistent-orra.json" }, tmpDir);
    await expect(provider.fetch()).rejects.toThrow();
  });

  it("should throw on invalid JSON", async () => {
    const statePath = path.join(tmpDir, "bad.json");
    fs.writeFileSync(statePath, "not json");
    const provider = createFileProvider({ type: "file", path: statePath }, tmpDir);
    await expect(provider.fetch()).rejects.toThrow();
  });
});
