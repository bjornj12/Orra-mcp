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

describe("parseLog — lastFileEdited", () => {
  it("picks up 'modified: <path>'", () => {
    expect(parseLog("modified: src/foo.ts").lastFileEdited).toBe("src/foo.ts");
  });

  it("picks up 'edited: <path>'", () => {
    expect(parseLog("edited: lib/bar.ts").lastFileEdited).toBe("lib/bar.ts");
  });

  it("picks up 'wrote <path>'", () => {
    expect(parseLog("wrote README.md").lastFileEdited).toBe("README.md");
  });

  it("most recent match wins", () => {
    const log = "modified: src/a.ts\nbuilding\nmodified: src/b.ts";
    expect(parseLog(log).lastFileEdited).toBe("src/b.ts");
  });

  it("null when no match", () => {
    expect(parseLog("hello world").lastFileEdited).toBeNull();
  });
});

describe("parseLog — errorPattern", () => {
  it("detects ENOENT family", () => {
    expect(parseLog("Error: ENOENT: no such file").errorPattern).toBe("ENOENT");
  });

  it("detects ECONNREFUSED family", () => {
    expect(parseLog("connect ECONNREFUSED 127.0.0.1:3000").errorPattern).toBe("ECONNREFUSED");
  });

  it("detects command not found", () => {
    expect(parseLog("/bin/sh: foo: command not found").errorPattern).toBe("command_not_found");
  });

  it("detects permission denied", () => {
    expect(parseLog("bash: /etc/hosts: Permission denied").errorPattern).toBe("permission_denied");
  });

  it("detects timeout", () => {
    expect(parseLog("Request timed out after 30s").errorPattern).toBe("timeout");
  });

  it("null when no error", () => {
    expect(parseLog("everything is fine").errorPattern).toBeNull();
  });
});

describe("parseLog — loopDetected", () => {
  it("true when one line repeats 3x in tail", () => {
    const log = Array(22).fill("unique").concat(["same", "same", "same"]).join("\n");
    expect(parseLog(log).loopDetected).toBe(true);
  });

  it("false when no repetition", () => {
    const log = Array.from({ length: 20 }, (_, i) => `line-${i}`).join("\n");
    expect(parseLog(log).loopDetected).toBe(false);
  });

  it("false when repetition is below threshold (2x)", () => {
    const log = "a\nb\na\nb\nc\nd".split("").join("\n");
    expect(parseLog(log).loopDetected).toBe(false);
  });

  it("only counts within last 20 non-blank lines", () => {
    // 3 repeats far in the past, not in tail
    const log = ["x", "x", "x", ...Array.from({ length: 25 }, (_, i) => `line-${i}`)].join("\n");
    expect(parseLog(log).loopDetected).toBe(false);
  });
});
