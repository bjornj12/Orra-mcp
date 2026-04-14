import { describe, it, expect } from "vitest";
import {
  DEFAULT_HEADLESS_ALLOWED_TOOLS,
  ConcurrencyLimitError,
} from "../../src/core/spawn-defaults.js";

describe("DEFAULT_HEADLESS_ALLOWED_TOOLS", () => {
  it("contains read-only file tools", () => {
    expect(DEFAULT_HEADLESS_ALLOWED_TOOLS).toContain("Read");
    expect(DEFAULT_HEADLESS_ALLOWED_TOOLS).toContain("Glob");
    expect(DEFAULT_HEADLESS_ALLOWED_TOOLS).toContain("Grep");
  });

  it("contains write tools (Edit, Write)", () => {
    expect(DEFAULT_HEADLESS_ALLOWED_TOOLS).toContain("Edit");
    expect(DEFAULT_HEADLESS_ALLOWED_TOOLS).toContain("Write");
  });

  it("contains common safe git operations", () => {
    expect(DEFAULT_HEADLESS_ALLOWED_TOOLS).toContain("Bash(git status:*)");
    expect(DEFAULT_HEADLESS_ALLOWED_TOOLS).toContain("Bash(git rebase:*)");
    expect(DEFAULT_HEADLESS_ALLOWED_TOOLS).toContain("Bash(git commit:*)");
  });

  it("contains npm test, lint, build", () => {
    expect(DEFAULT_HEADLESS_ALLOWED_TOOLS).toContain("Bash(npm test*)");
    expect(DEFAULT_HEADLESS_ALLOWED_TOOLS).toContain("Bash(npm run lint*)");
    expect(DEFAULT_HEADLESS_ALLOWED_TOOLS).toContain("Bash(npm run build*)");
  });

  it("does NOT contain destructive operations", () => {
    const dangerous = ["Bash(rm:*)", "Bash(sudo:*)", "Bash(curl:*)", "Bash(wget:*)"];
    for (const d of dangerous) {
      expect(DEFAULT_HEADLESS_ALLOWED_TOOLS).not.toContain(d);
    }
  });

  it("does NOT contain package install operations", () => {
    const installs = ["Bash(npm install*)", "Bash(yarn add*)", "Bash(pip install*)"];
    for (const i of installs) {
      expect(DEFAULT_HEADLESS_ALLOWED_TOOLS).not.toContain(i);
    }
  });
});

describe("ConcurrencyLimitError", () => {
  it("is an Error subclass with a typed name", () => {
    const err = new ConcurrencyLimitError(3, 3);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("ConcurrencyLimitError");
    expect(err.limit).toBe(3);
    expect(err.current).toBe(3);
    expect(err.message).toContain("3");
  });
});
