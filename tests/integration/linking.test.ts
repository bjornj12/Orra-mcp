import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { StateManager } from "../../src/core/state.js";
import { Linker, expandTemplate } from "../../src/core/linker.js";
import type { AgentState } from "../../src/types.js";

describe("Linking (integration)", () => {
  let tmpDir: string;
  let state: StateManager;
  let linker: Linker;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "orra-link-test-"));
    state = new StateManager(tmpDir);
    await state.init();
    linker = new Linker();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should persist links to disk and reload", async () => {
    const link = linker.createLink("agent-1", { task: "review" }, "success");
    await state.saveLinks(linker.getAllLinks());

    // Create a new linker and reload
    const linker2 = new Linker();
    const loaded = await state.loadLinks();
    linker2.loadLinks(loaded);

    expect(linker2.getAllLinks()).toHaveLength(1);
    expect(linker2.getAllLinks()[0].id).toBe(link.id);
  });

  it("should expand templates with real agent state from disk", async () => {
    const agent: AgentState = {
      id: "auth-a1b2",
      task: "Refactor auth",
      branch: "orra/auth-a1b2",
      worktree: "worktrees/auth-a1b2",
      pid: 123,
      status: "completed",
      createdAt: "2026-04-06T14:30:00.000Z",
      updatedAt: "2026-04-06T14:31:00.000Z",
      exitCode: 0,
      model: null,
      allowedTools: null,
    };
    await state.saveAgent(agent);

    const loaded = await state.loadAgent("auth-a1b2");
    expect(loaded).not.toBeNull();

    const expanded = expandTemplate(
      "Review branch {{from.branch}} after {{from.task}}",
      loaded!
    );
    expect(expanded).toBe("Review branch orra/auth-a1b2 after Refactor auth");
  });

  it("should find matching links after reload", async () => {
    linker.createLink("agent-1", { task: "on success" }, "success");
    linker.createLink("agent-1", { task: "on failure" }, "failure");
    await state.saveLinks(linker.getAllLinks());

    const linker2 = new Linker();
    linker2.loadLinks(await state.loadLinks());

    const matches = linker2.findMatchingLinks("agent-1", 0);
    expect(matches).toHaveLength(1);
    expect(matches[0].to.task).toBe("on success");
  });
});
