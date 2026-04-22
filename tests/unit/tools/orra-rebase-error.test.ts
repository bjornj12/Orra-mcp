import { describe, it, expect, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { orraRebaseSchema, handleOrraRebase } from "../../../src/tools/orra-rebase.js";
import { AgentManager } from "../../../src/core/agent-manager.js";
import { WorktreeManager } from "../../../src/core/worktree.js";

describe("orra_rebase error envelope", () => {
  it("returns {ok:false,error} with isError:true when rebase throws", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "orra-rebase-err-"));
    const spy = vi
      .spyOn(WorktreeManager.prototype, "rebase")
      .mockRejectedValueOnce(new Error("boom"));
    try {
      const manager = new AgentManager(tmp);
      const res = await handleOrraRebase(
        manager,
        tmp,
        orraRebaseSchema.parse({ worktree: "feat-foo" }),
      );
      expect(res.isError).toBe(true);
      const body = JSON.parse(res.content[0].text);
      expect(body.ok).toBe(false);
      expect(body.error).toContain("boom");
    } finally {
      spy.mockRestore();
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});
