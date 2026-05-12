import { describe, it, expect } from "vitest";
import { resolveAgentId } from "../../src/bin/orra-hook.js";

// buildPermissionResponse and parseAllowDeny have been deleted in Task 8.
// The PermissionRequest hook branch is removed — use `claude attach <shortId>`
// to interact with a waiting agent instead.

describe("resolveAgentId", () => {
  it("should return env var if set", () => {
    expect(resolveAgentId({ ORRA_AGENT_ID: "test-123" }, "/tmp")).toBe("test-123");
  });

  it("should return null if no env var and no file", () => {
    expect(resolveAgentId({}, "/tmp/nonexistent")).toBeNull();
  });
});
