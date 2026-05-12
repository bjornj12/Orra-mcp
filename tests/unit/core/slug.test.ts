import { describe, it, expect } from "vitest";
import { slugify } from "../../../src/core/slug.js";

describe("slugify", () => {
  it("should convert task to slug", () => {
    expect(slugify("Refactor the auth middleware")).toBe("refactor-the-auth-middleware");
  });

  it("should strip special characters", () => {
    expect(slugify("Fix bug #123: can't login!")).toBe("fix-bug-123-cant-login");
  });

  it("should collapse multiple hyphens", () => {
    expect(slugify("a   b---c")).toBe("a-b-c");
  });

  it("should trim hyphens from edges", () => {
    expect(slugify("  hello world  ")).toBe("hello-world");
  });

  it("should truncate to 40 chars", () => {
    const long = "a".repeat(60);
    expect(slugify(long).length).toBeLessThanOrEqual(40);
  });

  it("should handle empty input gracefully", () => {
    const result = slugify("");
    expect(result).toBeTruthy();
    expect(result.length).toBeGreaterThan(0);
  });

  it("should handle inputs that would produce empty slugs", () => {
    expect(slugify("...")).toBeTruthy();
    expect(slugify("!!!")).toBeTruthy();
    expect(slugify("___")).toBeTruthy();
  });

  it("should return isSafeWorktreeId-valid output for degenerate inputs", () => {
    // These all strip to empty after processing; the fallback must be safe.
    for (const input of ["", "...", "!!!", "___"]) {
      const result = slugify(input);
      expect(result).toMatch(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/);
    }
  });
});
