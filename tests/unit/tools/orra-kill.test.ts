import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

vi.mock("../../../src/core/claude-cli.js", () => ({
  stopSession: vi.fn(async () => undefined),
  removeSession: vi.fn(async () => undefined),
}));

vi.mock("../../../src/core/daemon-state.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/core/daemon-state.js")>();
  return {
    ...actual,
    readJobs: vi.fn(async () => []),
    configDir: vi.fn(() => "/tmp/fake-claude-config"),
  };
});

import { handleOrraKill } from "../../../src/tools/orra-kill.js";
import * as cli from "../../../src/core/claude-cli.js";
import { recordSpawn } from "../../../src/core/state.js";

describe("orra_kill", () => {
  let root: string;

  beforeEach(async () => {
    root = await fsp.mkdtemp(path.join(os.tmpdir(), "orra-kill-"));
    vi.clearAllMocks();

    // Seed a spawn ledger entry so the handler can resolve by slug or shortId
    await recordSpawn(root, {
      shortId: "abcd1234",
      sessionId: "abcd1234-full-session-id",
      slug: "fix-the-tests",
      task: "Fix the failing tests",
      reason: "CI is red",
      spawnedBy: "orchestrator",
    });
  });

  afterEach(async () => {
    await fsp.rm(root, { recursive: true, force: true });
  });

  it("stop (cleanup:false) calls stopSession and returns ok with cleaned:false", async () => {
    const res = await handleOrraKill(root, { agent: "abcd1234", cleanup: false });
    const payload = JSON.parse((res as any).content[0].text);
    expect(payload.ok).toBe(true);
    expect(payload.data.killed).toBe(true);
    expect(payload.data.cleaned).toBe(false);
    expect(payload.data.shortId).toBe("abcd1234");
    expect(cli.stopSession).toHaveBeenCalledWith("abcd1234");
    expect(cli.removeSession).not.toHaveBeenCalled();
  });

  it("cleanup:true calls removeSession and returns cleaned:true", async () => {
    const res = await handleOrraKill(root, { agent: "abcd1234", cleanup: true });
    const payload = JSON.parse((res as any).content[0].text);
    expect(payload.ok).toBe(true);
    expect(payload.data.killed).toBe(true);
    expect(payload.data.cleaned).toBe(true);
    expect(cli.removeSession).toHaveBeenCalledWith("abcd1234");
    expect(cli.stopSession).not.toHaveBeenCalled();
  });

  it("resolves agent by slug name", async () => {
    const res = await handleOrraKill(root, { agent: "fix-the-tests" });
    const payload = JSON.parse((res as any).content[0].text);
    expect(payload.ok).toBe(true);
    expect(payload.data.shortId).toBe("abcd1234");
    expect(cli.stopSession).toHaveBeenCalledWith("abcd1234");
  });

  it("returns fail with agent_not_found for unknown id", async () => {
    const res = await handleOrraKill(root, { agent: "deadbeef" });
    const payload = JSON.parse((res as any).content[0].text);
    expect(payload.ok).toBe(false);
    expect(payload.code).toBe("agent_not_found");
    expect((res as any).isError).toBe(true);
  });

  it("defaults to stop (no cleanup) when cleanup is omitted", async () => {
    const res = await handleOrraKill(root, { agent: "abcd1234" });
    const payload = JSON.parse((res as any).content[0].text);
    expect(payload.ok).toBe(true);
    expect(payload.data.cleaned).toBe(false);
    expect(cli.stopSession).toHaveBeenCalledWith("abcd1234");
  });
});
