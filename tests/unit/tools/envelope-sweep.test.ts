import { describe, it, expect } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { orraScanSchema, handleOrraScan } from "../../../src/tools/orra-scan.js";
import { orraRegisterSchema, handleOrraRegister } from "../../../src/tools/orra-register.js";
import { orraUnblockSchema, handleOrraUnblock } from "../../../src/tools/orra-unblock.js";
import { orraKillSchema, handleOrraKill } from "../../../src/tools/orra-kill.js";
import { orraRebaseSchema, handleOrraRebase } from "../../../src/tools/orra-rebase.js";
import { orraSetupSchema, handleOrraSetup } from "../../../src/tools/orra-setup.js";
import { orraDirectiveSchema, handleOrraDirective } from "../../../src/tools/orra-directive.js";
import { orraSpawnSchema, handleOrraSpawn } from "../../../src/tools/orra-spawn.js";
import { AgentManager } from "../../../src/core/agent-manager.js";

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

  it("orra_register returns compact envelope", async () => {
    await withTmp(async (tmp) => {
      const res = await handleOrraRegister(
        tmp,
        orraRegisterSchema.parse({ worktree: "not-a-real-worktree" }),
      );
      assertCompactEnvelope(res.content[0].text);
    });
  });

  it("orra_unblock returns compact envelope", async () => {
    await withTmp(async (tmp) => {
      await fs.mkdir(path.join(tmp, ".orra", "agents"), { recursive: true });
      const res = await handleOrraUnblock(
        tmp,
        orraUnblockSchema.parse({ worktree: "feat-foo", allow: true }),
      );
      assertCompactEnvelope(res.content[0].text);
    });
  });

  it("orra_kill returns compact envelope", async () => {
    await withTmp(async (tmp) => {
      const manager = new AgentManager(tmp);
      const res = await handleOrraKill(
        manager,
        orraKillSchema.parse({ worktree: "feat-foo" }),
      );
      assertCompactEnvelope(res.content[0].text);
    });
  });

  it("orra_rebase returns compact envelope", async () => {
    await withTmp(async (tmp) => {
      const manager = new AgentManager(tmp);
      const res = await handleOrraRebase(
        manager,
        tmp,
        orraRebaseSchema.parse({ worktree: "feat-foo" }),
      );
      assertCompactEnvelope(res.content[0].text);
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
      const manager = new AgentManager(tmp);
      const res = await handleOrraSpawn(
        manager,
        orraSpawnSchema.parse({
          task: "noop",
          reason: "envelope sweep smoke test",
          worktree: "no-such-worktree",
        }),
      );
      assertCompactEnvelope(res.content[0].text);
    });
  });
});
