import { describe, it, expect } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { orraScanSchema, handleOrraScan } from "../../../src/tools/orra-scan.js";
import { orraSetupSchema, handleOrraSetup } from "../../../src/tools/orra-setup.js";
import { orraDirectiveSchema, handleOrraDirective } from "../../../src/tools/orra-directive.js";

// orra_register and orra_unblock have been deleted (Task 8).
// orra_spawn, orra_kill, orra_rebase envelope tests are skipped here
// because those handlers still depend on AgentManager which is being
// rewritten in Task 7/11/12. They will be re-enabled as part of those tasks.

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

  // orra_spawn: skipped — handler still uses AgentManager, to be rewired in Task 11
  it.skip("orra_spawn returns compact envelope — skipped: rewired in Task 11", () => {});

  // orra_kill: skipped — handler still uses AgentManager, to be rewired in Task 12
  it.skip("orra_kill returns compact envelope — skipped: rewired in Task 12", () => {});

  // orra_rebase: skipped — handler still uses AgentManager/WorktreeManager, to be rewired in Task 13
  it.skip("orra_rebase returns compact envelope — skipped: rewired in Task 13", () => {});
});
