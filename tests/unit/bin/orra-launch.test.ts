import { describe, it, expect } from "vitest";
import { decideLaunchAction, ORRA_BOOTSTRAP_PROMPT } from "../../../src/bin/orra-launch.js";
import type { JobState } from "../../../src/core/daemon-state.js";

describe("decideLaunchAction", () => {
  it("spawns when no orra job exists", () => {
    const result = decideLaunchAction({ jobs: [], hasTty: true });
    expect(result.action).toBe("spawn");
    if (result.action === "spawn") {
      expect(result.bgArgs).toContain("--name");
      expect(result.bgArgs).toContain("orra");
      expect(result.bgArgs).toContain("--agent");
      expect(result.bgArgs).toContain("orchestrator");
      expect(result.bgArgs).toContain("--");
      // bootstrap prompt must appear as a single string after --
      const sepIdx = result.bgArgs.indexOf("--");
      expect(sepIdx).toBeGreaterThan(-1);
      expect(result.bgArgs[sepIdx + 1]).toBe(ORRA_BOOTSTRAP_PROMPT);
    }
  });

  it("spawns when no job named 'orra' exists (other jobs present)", () => {
    const otherJob: Partial<JobState> = { name: "some-other-agent", daemonShort: "11223344" };
    const result = decideLaunchAction({
      jobs: [otherJob as JobState],
      hasTty: true,
    });
    expect(result.action).toBe("spawn");
  });

  it("attaches when orra job exists and hasTty is true", () => {
    const orraJob: Partial<JobState> = { name: "orra", daemonShort: "abcd1234" };
    const result = decideLaunchAction({
      jobs: [orraJob as JobState],
      hasTty: true,
    });
    expect(result.action).toBe("attach");
    if (result.action === "attach") {
      expect(result.shortId).toBe("abcd1234");
    }
  });

  it("prints attach hint when orra job exists and hasTty is false", () => {
    const orraJob: Partial<JobState> = { name: "orra", daemonShort: "abcd1234" };
    const result = decideLaunchAction({
      jobs: [orraJob as JobState],
      hasTty: false,
    });
    expect(result.action).toBe("print-attach-hint");
    if (result.action === "print-attach-hint") {
      expect(result.shortId).toBe("abcd1234");
    }
  });

  it("bgArgs include --bg flag when spawning", () => {
    const result = decideLaunchAction({ jobs: [], hasTty: false });
    expect(result.action).toBe("spawn");
    if (result.action === "spawn") {
      expect(result.bgArgs[0]).toBe("--bg");
    }
  });

  it("bootstrap prompt is a non-empty string", () => {
    expect(typeof ORRA_BOOTSTRAP_PROMPT).toBe("string");
    expect(ORRA_BOOTSTRAP_PROMPT.length).toBeGreaterThan(0);
  });
});
