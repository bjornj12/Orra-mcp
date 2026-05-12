import { describe, it, expect } from "vitest";
import {
  isAgentsViewDisabled,
  versionAtLeast,
  checkAgentsViewAvailable,
} from "../../../src/core/agents-view-preflight.js";

describe("isAgentsViewDisabled", () => {
  it("returns false when env var is unset", () => {
    expect(isAgentsViewDisabled({})).toBe(false);
  });

  it("returns false when env var is empty string", () => {
    expect(isAgentsViewDisabled({ CLAUDE_CODE_DISABLE_AGENT_VIEW: "" })).toBe(false);
  });

  it("returns false when env var is '0'", () => {
    expect(isAgentsViewDisabled({ CLAUDE_CODE_DISABLE_AGENT_VIEW: "0" })).toBe(false);
  });

  it("returns false when env var is 'false'", () => {
    expect(isAgentsViewDisabled({ CLAUDE_CODE_DISABLE_AGENT_VIEW: "false" })).toBe(false);
  });

  it("returns false when env var is 'FALSE' (case-insensitive)", () => {
    expect(isAgentsViewDisabled({ CLAUDE_CODE_DISABLE_AGENT_VIEW: "FALSE" })).toBe(false);
  });

  it("returns true when env var is '1'", () => {
    expect(isAgentsViewDisabled({ CLAUDE_CODE_DISABLE_AGENT_VIEW: "1" })).toBe(true);
  });

  it("returns true when env var is 'true'", () => {
    expect(isAgentsViewDisabled({ CLAUDE_CODE_DISABLE_AGENT_VIEW: "true" })).toBe(true);
  });

  it("returns true when env var is 'yes'", () => {
    expect(isAgentsViewDisabled({ CLAUDE_CODE_DISABLE_AGENT_VIEW: "yes" })).toBe(true);
  });
});

describe("versionAtLeast", () => {
  it("returns true when version equals minimum", () => {
    expect(versionAtLeast("2.1.0", "2.1.0")).toBe(true);
  });

  it("returns true when minor is greater", () => {
    expect(versionAtLeast("2.1.139", "2.1.0")).toBe(true);
  });

  it("returns true when major is greater", () => {
    expect(versionAtLeast("3.0.0", "2.1.0")).toBe(true);
  });

  it("returns false when minor is less", () => {
    expect(versionAtLeast("2.0.99", "2.1.0")).toBe(false);
  });

  it("returns false when major is less", () => {
    expect(versionAtLeast("1.99.0", "2.1.0")).toBe(false);
  });

  it("returns false for null", () => {
    expect(versionAtLeast(null, "2.1.0")).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(versionAtLeast(undefined, "2.1.0")).toBe(false);
  });

  it("returns false for non-parseable string", () => {
    expect(versionAtLeast("not-a-version", "2.1.0")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(versionAtLeast("", "2.1.0")).toBe(false);
  });
});

describe("checkAgentsViewAvailable", () => {
  it("returns ok:true when version meets minimum and env is clean", async () => {
    const result = await checkAgentsViewAvailable({ version: "2.1.139", env: {} });
    expect(result).toEqual({ ok: true });
  });

  it("returns ok:true when version exactly meets minimum", async () => {
    const result = await checkAgentsViewAvailable({ version: "2.1.0", env: {} });
    expect(result).toEqual({ ok: true });
  });

  it("returns ok:false when version is too old", async () => {
    const result = await checkAgentsViewAvailable({ version: "1.9.0", env: {} });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("2.1");
    }
  });

  it("returns ok:false when version is null (claude not on PATH)", async () => {
    const result = await checkAgentsViewAvailable({ version: null, env: {} });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("no claude on PATH");
    }
  });

  it("returns ok:false when CLAUDE_CODE_DISABLE_AGENT_VIEW is set, mentioning the env var", async () => {
    const result = await checkAgentsViewAvailable({
      version: "2.1.0",
      env: { CLAUDE_CODE_DISABLE_AGENT_VIEW: "1" },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("CLAUDE_CODE_DISABLE_AGENT_VIEW");
    }
  });

  it("env check takes precedence over version check", async () => {
    const result = await checkAgentsViewAvailable({
      version: "2.1.139",
      env: { CLAUDE_CODE_DISABLE_AGENT_VIEW: "1" },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("CLAUDE_CODE_DISABLE_AGENT_VIEW");
    }
  });

  it("returns ok:false when version is '2.0.99'", async () => {
    const result = await checkAgentsViewAvailable({ version: "2.0.99", env: {} });
    expect(result.ok).toBe(false);
  });
});
