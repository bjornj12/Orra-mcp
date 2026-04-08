import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { writeQuestion, pollForAnswer, writeTurnComplete } from "../../src/bin/orra-hook.js";

describe("File-based hook communication", () => {
  let tmpDir: string;
  const agentId = "test-agent-a1b2";

  function agentFilePath(): string {
    return path.join(tmpDir, ".orra", "agents", `${agentId}.json`);
  }

  function answerFilePath(): string {
    return path.join(tmpDir, ".orra", "agents", `${agentId}.answer.json`);
  }

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "orra-hooks-v2-test-"));
    fs.mkdirSync(path.join(tmpDir, ".orra", "agents"), { recursive: true });

    // Write initial agent state file
    const initialState = {
      id: agentId,
      type: "spawned",
      task: "test task",
      branch: "orra/test",
      worktree: "worktrees/test",
      pid: 0,
      status: "running",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      exitCode: null,
      model: null,
      allowedTools: null,
      pendingQuestion: null,
    };
    fs.writeFileSync(agentFilePath(), JSON.stringify(initialState, null, 2));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("writeQuestion", () => {
    it("should write pendingQuestion to agent state file", async () => {
      const tool = "Bash";
      const input = { command: "echo hello" };

      await writeQuestion(tmpDir, agentId, tool, input);

      const data = JSON.parse(fs.readFileSync(agentFilePath(), "utf-8"));
      expect(data.status).toBe("waiting");
      expect(data.pendingQuestion).toEqual({ tool, input });
    });
  });

  describe("pollForAnswer", () => {
    it("should resolve when answer file appears with allow", async () => {
      // Write answer file after a short delay
      setTimeout(() => {
        fs.writeFileSync(answerFilePath(), JSON.stringify({ allow: true }));
      }, 50);

      const result = await pollForAnswer(tmpDir, agentId, 2000, 20);

      expect(result.allow).toBe(true);
      // Answer file should be deleted after consumption
      expect(fs.existsSync(answerFilePath())).toBe(false);
    });

    it("should resolve with deny when answer file has allow: false", async () => {
      setTimeout(() => {
        fs.writeFileSync(answerFilePath(), JSON.stringify({ allow: false, reason: "too dangerous" }));
      }, 50);

      const result = await pollForAnswer(tmpDir, agentId, 2000, 20);

      expect(result.allow).toBe(false);
      expect(result.reason).toBe("too dangerous");
      expect(fs.existsSync(answerFilePath())).toBe(false);
    });

    it("should timeout and return deny if no answer file appears", async () => {
      const result = await pollForAnswer(tmpDir, agentId, 100, 20);

      expect(result.allow).toBe(false);
    });
  });

  describe("writeTurnComplete", () => {
    it("should update agent state to idle", async () => {
      // First set a pending question
      await writeQuestion(tmpDir, agentId, "Bash", { command: "ls" });

      await writeTurnComplete(tmpDir, agentId);

      const data = JSON.parse(fs.readFileSync(agentFilePath(), "utf-8"));
      expect(data.status).toBe("idle");
      expect(data.pendingQuestion).toBeNull();
    });
  });
});
