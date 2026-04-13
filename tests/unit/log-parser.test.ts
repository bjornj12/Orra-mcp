import { describe, it, expect } from "vitest";
import { stripAnsi, parseLog } from "../../src/core/log-parser.js";

describe("stripAnsi", () => {
  it("removes CSI color codes", () => {
    expect(stripAnsi("\u001b[31mred\u001b[0m")).toBe("red");
  });

  it("removes bold and underline", () => {
    expect(stripAnsi("\u001b[1mbold\u001b[22m \u001b[4munder\u001b[24m")).toBe("bold under");
  });

  it("leaves plain text untouched", () => {
    expect(stripAnsi("hello world")).toBe("hello world");
  });

  it("handles mixed content", () => {
    expect(stripAnsi("prefix \u001b[32mgreen\u001b[0m suffix")).toBe("prefix green suffix");
  });
});

describe("parseLog — empty input", () => {
  it("returns an empty-signals shape on empty string", () => {
    const result = parseLog("");
    expect(result).toEqual({
      lastActivityAt: null,
      lastFileEdited: null,
      lastTestResult: "unknown",
      testFailureSnippet: null,
      errorPattern: null,
      loopDetected: false,
      tailLines: [],
    });
  });

  it("returns empty-signals shape on whitespace-only input", () => {
    const result = parseLog("   \n\n   \n");
    expect(result.tailLines).toEqual([]);
    expect(result.lastTestResult).toBe("unknown");
  });
});
