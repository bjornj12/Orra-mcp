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

describe("parseLog — lastTestResult", () => {
  it("detects PASS from 'Tests: 3 passed'", () => {
    const log = "running jest\nTests:       3 passed, 3 total\nDone in 1.2s";
    expect(parseLog(log).lastTestResult).toBe("pass");
  });

  it("detects FAIL from 'Tests: 1 failed'", () => {
    const log = "running jest\nTests:       2 passed, 1 failed, 3 total";
    expect(parseLog(log).lastTestResult).toBe("fail");
  });

  it("detects PASS from ✓ marker", () => {
    const log = "✓ should do the thing\n✓ should do another thing";
    expect(parseLog(log).lastTestResult).toBe("pass");
  });

  it("detects FAIL from ✗ marker", () => {
    const log = "✓ should do the thing\n✗ should do another thing\n  Error: expected 2 got 3";
    expect(parseLog(log).lastTestResult).toBe("fail");
  });

  it("detects PASS from 'N passing' (mocha style)", () => {
    expect(parseLog("  5 passing (120ms)").lastTestResult).toBe("pass");
  });

  it("detects FAIL from 'N failing'", () => {
    expect(parseLog("  3 passing\n  1 failing").lastTestResult).toBe("fail");
  });

  it("most recent signal wins (fail after pass)", () => {
    const log = "Tests: 3 passed\n... edit ...\nTests: 1 failed";
    expect(parseLog(log).lastTestResult).toBe("fail");
  });

  it("strips ANSI before matching", () => {
    const log = "\u001b[32m✓\u001b[0m should work";
    expect(parseLog(log).lastTestResult).toBe("pass");
  });

  it("returns 'unknown' when no test signals present", () => {
    expect(parseLog("building...\ndone").lastTestResult).toBe("unknown");
  });
});
