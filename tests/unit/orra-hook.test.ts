import { describe, it, expect } from "vitest";
import { resolveAgentId, buildPermissionResponse, parseAllowDeny } from "../../src/bin/orra-hook.js";

describe("resolveAgentId", () => {
  it("should return env var if set", () => {
    expect(resolveAgentId({ ORRA_AGENT_ID: "test-123" }, "/tmp")).toBe("test-123");
  });

  it("should return null if no env var and no file", () => {
    expect(resolveAgentId({}, "/tmp/nonexistent")).toBeNull();
  });
});

describe("buildPermissionResponse", () => {
  it("should build allow response", () => {
    const response = buildPermissionResponse(true);
    expect(response).toEqual({
      hookSpecificOutput: {
        hookEventName: "PermissionRequest",
        decision: { behavior: "allow" },
      },
    });
  });

  it("should build deny response", () => {
    const response = buildPermissionResponse(false);
    expect(response).toEqual({
      hookSpecificOutput: {
        hookEventName: "PermissionRequest",
        decision: { behavior: "deny" },
      },
    });
  });
});

describe("parseAllowDeny", () => {
  it("should parse yes as allow", () => {
    expect(parseAllowDeny("yes")).toBe(true);
  });
  it("should parse y as allow", () => {
    expect(parseAllowDeny("y")).toBe(true);
  });
  it("should parse allow as allow", () => {
    expect(parseAllowDeny("allow")).toBe(true);
  });
  it("should parse no as deny", () => {
    expect(parseAllowDeny("no")).toBe(false);
  });
  it("should parse n as deny", () => {
    expect(parseAllowDeny("n")).toBe(false);
  });
  it("should parse deny as deny", () => {
    expect(parseAllowDeny("deny")).toBe(false);
  });
  it("should default to deny for unknown input", () => {
    expect(parseAllowDeny("something else")).toBe(false);
  });
});
