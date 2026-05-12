import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { orraScanSchema, handleOrraScan } from "../../../src/tools/orra-scan.js";
import { orraSetupSchema, handleOrraSetup } from "../../../src/tools/orra-setup.js";
import { orraDirectiveSchema, handleOrraDirective } from "../../../src/tools/orra-directive.js";

// Mock claude-cli so spawn/kill don't try to exec real processes
vi.mock("../../../src/core/claude-cli.js", () => ({
  bgSpawn: vi.fn(async () => ({ shortId: "deadbeef", raw: "backgrounded · deadbeef" })),
  stopSession: vi.fn(async () => undefined),
  removeSession: vi.fn(async () => undefined),
  buildBgArgs: vi.fn(() => []),
  claudeVersion: vi.fn(async () => "2.1.139"),
}));

vi.mock("../../../src/core/daemon-state.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/core/daemon-state.js")>();
  return {
    ...actual,
    readJobState: vi.fn(async () => null),
    readJobs: vi.fn(async () => []),
    configDir: vi.fn(() => "/tmp/fake-claude-config"),
  };
});

import { handleOrraSpawn } from "../../../src/tools/orra-spawn.js";
import { handleOrraKill } from "../../../src/tools/orra-kill.js";
import { handleOrraRebase } from "../../../src/tools/orra-rebase.js";
import { recordSpawn } from "../../../src/core/state.js";

// orra_register and orra_unblock have been deleted (Task 8).

async function withTmp<T>(fn: (tmp: string) => Promise<T>): Promise<T> {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "orra-env-"));
  try {
    return await fn(tmp);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
}

function assertCompactEnvelope(text: string) {
  // Compact output: no "\n  " two-space indentation from JSON.stringify(_, null, 2)
  expect(text).not.toContain("\n  ");
  const body = JSON.parse(text);
  expect(typeof body.ok).toBe("boolean");
  return body;
}

describe("envelope sweep", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("orra_scan returns compact JSON with ok/data envelope", async () => {
    await withTmp(async (tmp) => {
      const res = await handleOrraScan(tmp, orraScanSchema.parse({}));
      const text = res.content[0].text;
      expect(text).not.toContain("\n  ");
      const body = JSON.parse(text);
      expect(body).toHaveProperty("ok");
      if (body.ok) expect(body).toHaveProperty("data");
      else expect(body).toHaveProperty("error");
    });
  });

  it("orra_setup returns compact envelope", async () => {
    await withTmp(async (tmp) => {
      const res = await handleOrraSetup(tmp);
      assertCompactEnvelope(res.content[0].text);
    });
  });

  it("orra_directive list returns compact envelope", async () => {
    await withTmp(async (tmp) => {
      const res = await handleOrraDirective(
        tmp,
        orraDirectiveSchema.parse({ action: "list" }),
      );
      assertCompactEnvelope(res.content[0].text);
    });
  });

  it("orra_spawn returns compact envelope", async () => {
    await withTmp(async (tmp) => {
      const res = await handleOrraSpawn(tmp, { task: "do work", reason: "test" });
      const body = assertCompactEnvelope(res.content[0].text);
      expect(body.ok).toBe(true);
    });
  });

  it("orra_kill returns fail envelope when agent not found", async () => {
    await withTmp(async (tmp) => {
      const res = await handleOrraKill(tmp, { agent: "not-a-real-agent" });
      const body = assertCompactEnvelope(res.content[0].text);
      expect(body.ok).toBe(false);
    });
  });

  it("orra_kill returns ok envelope when agent found via ledger", async () => {
    await withTmp(async (tmp) => {
      // Seed a spawn ledger entry
      await recordSpawn(tmp, {
        shortId: "deadbeef",
        sessionId: "deadbeef-session",
        slug: "do-work",
        task: "do work",
        reason: "test",
        spawnedBy: "orchestrator",
      });
      const res = await handleOrraKill(tmp, { agent: "deadbeef" });
      const body = assertCompactEnvelope(res.content[0].text);
      expect(body.ok).toBe(true);
    });
  });

  it("orra_rebase returns compact envelope (worktree not found → fail)", async () => {
    await withTmp(async (tmp) => {
      // Initialize a minimal git repo so the git worktree list command works
      const { execSync } = await import("node:child_process");
      execSync("git init", { cwd: tmp, stdio: "pipe" });
      const res = await handleOrraRebase(tmp, { worktree: "nonexistent-wt" });
      const body = assertCompactEnvelope(res.content[0].text);
      expect(body.ok).toBe(false);
    });
  });
});
