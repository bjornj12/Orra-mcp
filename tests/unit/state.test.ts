import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { StateManager } from "../../src/core/state.js";

describe("StateManager", () => {
  let tmpDir: string;
  let state: StateManager;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "orra-test-"));
    state = new StateManager(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("init", () => {
    it("should create .orra directory structure", async () => {
      await state.init();
      expect(fs.existsSync(path.join(tmpDir, ".orra"))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, ".orra", "agents"))).toBe(true);
    });

    it("should create default config.json if missing", async () => {
      await state.init();
      const config = JSON.parse(
        fs.readFileSync(path.join(tmpDir, ".orra", "config.json"), "utf-8")
      );
      expect(config).toEqual({
        defaultModel: null,
        defaultAllowedTools: null,
        spawnCommand: null,
      });
    });

    it("should create empty links.json if missing", async () => {
      await state.init();
      const links = JSON.parse(
        fs.readFileSync(path.join(tmpDir, ".orra", "links.json"), "utf-8")
      );
      expect(links).toEqual([]);
    });

    it("should not overwrite existing config", async () => {
      const orraDir = path.join(tmpDir, ".orra");
      fs.mkdirSync(orraDir, { recursive: true });
      fs.writeFileSync(
        path.join(orraDir, "config.json"),
        JSON.stringify({ defaultModel: "opus", defaultAllowedTools: null })
      );
      await state.init();
      const config = JSON.parse(
        fs.readFileSync(path.join(orraDir, "config.json"), "utf-8")
      );
      expect(config.defaultModel).toBe("opus");
    });
  });

  describe("agent state", () => {
    beforeEach(async () => {
      await state.init();
    });

    it("should save and load agent state", async () => {
      const agent = {
        id: "test-a1b2",
        type: "spawned" as const,
        task: "test task",
        branch: "orra/test-a1b2",
        worktree: "worktrees/test-a1b2",
        pid: 12345,
        status: "running" as const,
        createdAt: "2026-04-06T14:30:00.000Z",
        updatedAt: "2026-04-06T14:30:00.000Z",
        exitCode: null,
        model: null,
        allowedTools: null,
      };
      await state.saveAgent(agent);
      const loaded = await state.loadAgent("test-a1b2");
      expect(loaded).toEqual(agent);
    });

    it("should return null for non-existent agent", async () => {
      const loaded = await state.loadAgent("nonexistent");
      expect(loaded).toBeNull();
    });

    it("should list all agents", async () => {
      const agent1 = {
        id: "agent-1",
        task: "task 1",
        branch: "orra/agent-1",
        worktree: "worktrees/agent-1",
        pid: 111,
        status: "running" as const,
        createdAt: "2026-04-06T14:30:00.000Z",
        updatedAt: "2026-04-06T14:30:00.000Z",
        exitCode: null,
        model: null,
        allowedTools: null,
      };
      const agent2 = {
        id: "agent-2",
        task: "task 2",
        branch: "orra/agent-2",
        worktree: "worktrees/agent-2",
        pid: 222,
        status: "completed" as const,
        createdAt: "2026-04-06T14:31:00.000Z",
        updatedAt: "2026-04-06T14:32:00.000Z",
        exitCode: 0,
        model: null,
        allowedTools: null,
      };
      await state.saveAgent(agent1);
      await state.saveAgent(agent2);
      const agents = await state.listAgents();
      expect(agents).toHaveLength(2);
      expect(agents.map((a) => a.id).sort()).toEqual(["agent-1", "agent-2"]);
    });
  });

  describe("agent log", () => {
    beforeEach(async () => {
      await state.init();
    });

    it("should append to log and read it back", async () => {
      await state.appendLog("test-a1b2", "line 1\n");
      await state.appendLog("test-a1b2", "line 2\n");
      const log = await state.readLog("test-a1b2");
      expect(log).toBe("line 1\nline 2\n");
    });

    it("should return empty string for non-existent log", async () => {
      const log = await state.readLog("nonexistent");
      expect(log).toBe("");
    });

    it("should tail last N lines", async () => {
      await state.appendLog("test-a1b2", "line 1\nline 2\nline 3\nline 4\nline 5\n");
      const tail = await state.readLog("test-a1b2", 2);
      expect(tail).toBe("line 4\nline 5");
    });
  });

  describe("links", () => {
    beforeEach(async () => {
      await state.init();
    });

    it("should save and load links", async () => {
      const link = {
        id: "link-x1y2",
        from: "agent-1",
        to: { task: "review" },
        on: "success" as const,
        status: "pending" as const,
        firedAgentId: null,
        createdAt: "2026-04-06T14:35:00.000Z",
      };
      await state.saveLinks([link]);
      const links = await state.loadLinks();
      expect(links).toEqual([link]);
    });
  });

  describe("config", () => {
    beforeEach(async () => {
      await state.init();
    });

    it("should load config", async () => {
      const config = await state.loadConfig();
      expect(config).toEqual({
        defaultModel: null,
        defaultAllowedTools: null,
        spawnCommand: null,
      });
    });
  });

  describe("readLogRange", () => {
    beforeEach(async () => {
      await state.init();
    });

    it("should read from offset to end", async () => {
      await state.appendLog("test-a1b2", "line 1\nline 2\nline 3\n");
      const result = await state.readLogRange("test-a1b2", 7);
      expect(result.content).toBe("line 2\nline 3\n");
      expect(result.newOffset).toBe(21);
    });

    it("should return empty content if offset is at end", async () => {
      await state.appendLog("test-a1b2", "line 1\n");
      const result = await state.readLogRange("test-a1b2", 7);
      expect(result.content).toBe("");
      expect(result.newOffset).toBe(7);
    });

    it("should read from 0 on first call", async () => {
      await state.appendLog("test-a1b2", "hello\nworld\n");
      const result = await state.readLogRange("test-a1b2", 0);
      expect(result.content).toBe("hello\nworld\n");
      expect(result.newOffset).toBe(12);
    });

    it("should return offset 0 for non-existent log", async () => {
      const result = await state.readLogRange("nonexistent", 0);
      expect(result.content).toBe("");
      expect(result.newOffset).toBe(0);
    });
  });

  describe("reconcile", () => {
    beforeEach(async () => {
      await state.init();
    });

    it("should mark dead running agents as interrupted", async () => {
      const agent = {
        id: "dead-agent",
        task: "task",
        branch: "orra/dead-agent",
        worktree: "worktrees/dead-agent",
        pid: 99999999,
        status: "running" as const,
        createdAt: "2026-04-06T14:30:00.000Z",
        updatedAt: "2026-04-06T14:30:00.000Z",
        exitCode: null,
        model: null,
        allowedTools: null,
      };
      await state.saveAgent(agent);
      await state.reconcile();
      const loaded = await state.loadAgent("dead-agent");
      expect(loaded!.status).toBe("interrupted");
    });

    it("should not touch completed agents", async () => {
      const agent = {
        id: "done-agent",
        task: "task",
        branch: "orra/done-agent",
        worktree: "worktrees/done-agent",
        pid: 99999999,
        status: "completed" as const,
        createdAt: "2026-04-06T14:30:00.000Z",
        updatedAt: "2026-04-06T14:31:00.000Z",
        exitCode: 0,
        model: null,
        allowedTools: null,
      };
      await state.saveAgent(agent);
      await state.reconcile();
      const loaded = await state.loadAgent("done-agent");
      expect(loaded!.status).toBe("completed");
    });
  });
});
