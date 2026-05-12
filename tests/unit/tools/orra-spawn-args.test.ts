import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

vi.mock("../../../src/core/claude-cli.js", () => ({
  bgSpawn: vi.fn(async () => ({ shortId: "abcd1234", raw: "backgrounded · abcd1234" })),
  buildBgArgs: vi.fn(),
}));

vi.mock("../../../src/core/daemon-state.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/core/daemon-state.js")>();
  return {
    ...actual,
    readJobState: vi.fn(async () => null),
    configDir: vi.fn(() => "/tmp/fake-claude-config"),
  };
});

import { handleOrraSpawn } from "../../../src/tools/orra-spawn.js";
import * as cli from "../../../src/core/claude-cli.js";

describe("orra_spawn", () => {
  let root: string;

  beforeEach(async () => {
    root = await fsp.mkdtemp(path.join(os.tmpdir(), "orra-spawn-"));
    vi.clearAllMocks();
    vi.mocked(cli.bgSpawn).mockResolvedValue({ shortId: "abcd1234", raw: "backgrounded · abcd1234" });
  });

  afterEach(async () => {
    await fsp.rm(root, { recursive: true, force: true });
  });

  it("spawns via claude --bg and records provenance", async () => {
    const res = await handleOrraSpawn(root, { task: "fix the flaky test", reason: "CI red on main" });
    const payload = JSON.parse((res as any).content[0].text);
    expect(payload.ok).toBe(true);
    expect(payload.data.spawned).toBe(true);
    expect(payload.data.shortId).toBe("abcd1234");
    expect(cli.bgSpawn).toHaveBeenCalledWith(expect.objectContaining({ task: "fix the flaky test" }));

    // Check spawn ledger entry written
    const ledger = JSON.parse(await fsp.readFile(path.join(root, ".orra", "spawns", "abcd1234.json"), "utf-8"));
    expect(ledger.reason).toBe("CI red on main");
    expect(ledger.shortId).toBe("abcd1234");
    expect(ledger.task).toBe("fix the flaky test");
  });

  it("writes memory note to .orra/memory/worktrees/<slug>.md", async () => {
    await handleOrraSpawn(root, { task: "fix the flaky test", reason: "CI red on main" });
    const slug = "fix-the-flaky-test";
    const memoryFile = path.join(root, ".orra", "memory", "worktrees", `${slug}.md`);
    const content = await fsp.readFile(memoryFile, "utf-8");
    expect(content).toContain("CI red on main");
  });

  it("includes reason and name in the ok response", async () => {
    const res = await handleOrraSpawn(root, { task: "fix the flaky test", reason: "CI red on main" });
    const payload = JSON.parse((res as any).content[0].text);
    expect(payload.data.reason).toBe("CI red on main");
    expect(payload.data.name).toBe("fix-the-flaky-test");
  });

  it("returns fail envelope when bgSpawn throws", async () => {
    vi.mocked(cli.bgSpawn).mockRejectedValue(new Error("claude not found"));
    const res = await handleOrraSpawn(root, { task: "do work", reason: "test" });
    const payload = JSON.parse((res as any).content[0].text);
    expect(payload.ok).toBe(false);
    expect(payload.code).toBe("spawn_failed");
    expect((res as any).isError).toBe(true);
  });

  it("passes model and agent to bgSpawn when provided", async () => {
    await handleOrraSpawn(root, {
      task: "do something",
      reason: "testing",
      model: "claude-haiku-4-5",
      agent: "orchestrator",
    });
    expect(cli.bgSpawn).toHaveBeenCalledWith(
      expect.objectContaining({ model: "claude-haiku-4-5", agent: "orchestrator" })
    );
  });

  it("passes allowedTools and disallowedTools to bgSpawn when provided", async () => {
    await handleOrraSpawn(root, {
      task: "do something",
      reason: "testing",
      allowedTools: ["Read", "Bash"],
      disallowedTools: ["Write"],
    });
    expect(cli.bgSpawn).toHaveBeenCalledWith(
      expect.objectContaining({ allowedTools: ["Read", "Bash"], disallowedTools: ["Write"] })
    );
  });
});
