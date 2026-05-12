import { describe, it, expect } from "vitest";
import * as path from "node:path";
import * as url from "node:url";
import { stripAnsi, parseTranscript, parseTranscriptLines } from "../../src/core/log-parser.js";

const FIXTURES_DIR = path.join(
  path.dirname(url.fileURLToPath(import.meta.url)),
  "..",
  "fixtures",
);

const SAMPLE_FIXTURE = path.join(FIXTURES_DIR, "transcript-sample.jsonl");

describe("stripAnsi", () => {
  it("removes CSI color codes", () => {
    expect(stripAnsi("[31mred[0m")).toBe("red");
  });

  it("removes bold and underline", () => {
    expect(stripAnsi("[1mbold[22m [4munder[24m")).toBe("bold under");
  });

  it("leaves plain text untouched", () => {
    expect(stripAnsi("hello world")).toBe("hello world");
  });

  it("handles mixed content", () => {
    expect(stripAnsi("prefix [32mgreen[0m suffix")).toBe("prefix green suffix");
  });
});

describe("parseTranscriptLines — empty / malformed input", () => {
  it("returns empty-signals shape on empty array", () => {
    const result = parseTranscriptLines([]);
    expect(result).toEqual({
      lastFileEdited: null,
      lastTestResult: "unknown",
      errorPattern: null,
      loopDetected: false,
      tailLines: [],
      lastActivityAt: null,
    });
  });

  it("skips blank lines and parse errors gracefully", () => {
    const result = parseTranscriptLines(["", "not json at all", "  "]);
    expect(result.tailLines).toEqual([]);
    expect(result.lastTestResult).toBe("unknown");
  });
});

describe("parseTranscriptLines — lastTestResult", () => {
  const testResultLine = JSON.stringify({
    type: "user",
    message: {
      role: "user",
      content: [{ type: "tool_result", tool_use_id: "t1", content: "Tests: 3 passed, 3 total" }],
    },
    timestamp: "2026-05-12T10:00:00.000Z",
  });

  const testFailLine = JSON.stringify({
    type: "user",
    message: {
      role: "user",
      content: [{ type: "tool_result", tool_use_id: "t1", content: "Tests: 1 failed, 1 passed, 2 total" }],
    },
    timestamp: "2026-05-12T10:00:00.000Z",
  });

  it("detects pass from tool_result containing 'Tests: N passed'", () => {
    expect(parseTranscriptLines([testResultLine]).lastTestResult).toBe("pass");
  });

  it("detects fail from tool_result containing 'Tests: N failed'", () => {
    expect(parseTranscriptLines([testFailLine]).lastTestResult).toBe("fail");
  });

  it("most recent signal wins (fail after pass)", () => {
    expect(parseTranscriptLines([testResultLine, testFailLine]).lastTestResult).toBe("fail");
  });

  it("returns unknown when no test signals present", () => {
    const plain = JSON.stringify({
      type: "assistant",
      message: { role: "assistant", content: [{ type: "text", text: "building..." }] },
      timestamp: "2026-05-12T10:00:00.000Z",
    });
    expect(parseTranscriptLines([plain]).lastTestResult).toBe("unknown");
  });
});

describe("parseTranscriptLines — lastFileEdited", () => {
  it("picks up file_path from Edit tool_use", () => {
    const line = JSON.stringify({
      type: "assistant",
      message: {
        role: "assistant",
        content: [{ type: "tool_use", id: "t1", name: "Edit", input: { file_path: "src/bar.ts" } }],
      },
      timestamp: "2026-05-12T10:00:00.000Z",
    });
    expect(parseTranscriptLines([line]).lastFileEdited).toBe("src/bar.ts");
  });

  it("picks up file_path from Write tool_use", () => {
    const line = JSON.stringify({
      type: "assistant",
      message: {
        role: "assistant",
        content: [{ type: "tool_use", id: "t1", name: "Write", input: { file_path: "README.md" } }],
      },
      timestamp: "2026-05-12T10:00:00.000Z",
    });
    expect(parseTranscriptLines([line]).lastFileEdited).toBe("README.md");
  });

  it("most recent match wins", () => {
    const line1 = JSON.stringify({
      type: "assistant",
      message: {
        role: "assistant",
        content: [{ type: "tool_use", id: "t1", name: "Edit", input: { file_path: "src/a.ts" } }],
      },
      timestamp: "2026-05-12T10:00:00.000Z",
    });
    const line2 = JSON.stringify({
      type: "assistant",
      message: {
        role: "assistant",
        content: [{ type: "tool_use", id: "t2", name: "Edit", input: { file_path: "src/b.ts" } }],
      },
      timestamp: "2026-05-12T10:00:01.000Z",
    });
    expect(parseTranscriptLines([line1, line2]).lastFileEdited).toBe("src/b.ts");
  });

  it("returns null when no file edits", () => {
    const line = JSON.stringify({
      type: "assistant",
      message: { role: "assistant", content: [{ type: "text", text: "hello" }] },
      timestamp: "2026-05-12T10:00:00.000Z",
    });
    expect(parseTranscriptLines([line]).lastFileEdited).toBeNull();
  });
});

describe("parseTranscriptLines — lastActivityAt", () => {
  it("returns the timestamp of the last line with a timestamp", () => {
    const lines = [
      JSON.stringify({ type: "user", message: { role: "user", content: "hi" }, timestamp: "2026-05-12T10:00:00.000Z" }),
      JSON.stringify({ type: "assistant", message: { role: "assistant", content: [{ type: "text", text: "ok" }] }, timestamp: "2026-05-12T10:00:01.000Z" }),
    ];
    expect(parseTranscriptLines(lines).lastActivityAt).toBe("2026-05-12T10:00:01.000Z");
  });

  it("returns null when no timestamps present", () => {
    const line = JSON.stringify({ type: "assistant", message: { role: "assistant", content: [] } });
    expect(parseTranscriptLines([line]).lastActivityAt).toBeNull();
  });
});

describe("parseTranscriptLines — tailLines rendering", () => {
  it("renders assistant text blocks as-is", () => {
    const line = JSON.stringify({
      type: "assistant",
      message: { role: "assistant", content: [{ type: "text", text: "Hello world" }] },
      timestamp: "2026-05-12T10:00:00.000Z",
    });
    const result = parseTranscriptLines([line]);
    expect(result.tailLines).toContain("Hello world");
  });

  it("renders Bash tool_use as '$ <command>'", () => {
    const line = JSON.stringify({
      type: "assistant",
      message: {
        role: "assistant",
        content: [{ type: "tool_use", id: "t1", name: "Bash", input: { command: "npm test" } }],
      },
      timestamp: "2026-05-12T10:00:00.000Z",
    });
    const result = parseTranscriptLines([line]);
    expect(result.tailLines.some((l) => l.startsWith("$ npm test"))).toBe(true);
  });

  it("renders tool_result as '⎿ <first line>...'", () => {
    const line = JSON.stringify({
      type: "user",
      message: {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: "t1", content: "line1\nline2" }],
      },
      timestamp: "2026-05-12T10:00:00.000Z",
    });
    const result = parseTranscriptLines([line]);
    expect(result.tailLines.some((l) => l.startsWith("⎿ line1"))).toBe(true);
  });

  it("renders Edit tool_use as '✎ <path>'", () => {
    const line = JSON.stringify({
      type: "assistant",
      message: {
        role: "assistant",
        content: [{ type: "tool_use", id: "t1", name: "Edit", input: { file_path: "src/foo.ts" } }],
      },
      timestamp: "2026-05-12T10:00:00.000Z",
    });
    const result = parseTranscriptLines([line]);
    expect(result.tailLines.some((l) => l.startsWith("✎ src/foo.ts"))).toBe(true);
  });

  it("keeps only the last 50 rendered lines", () => {
    const lines: string[] = [];
    for (let i = 0; i < 60; i++) {
      lines.push(JSON.stringify({
        type: "assistant",
        message: { role: "assistant", content: [{ type: "text", text: `line ${i}` }] },
        timestamp: "2026-05-12T10:00:00.000Z",
      }));
    }
    const result = parseTranscriptLines(lines);
    expect(result.tailLines.length).toBe(50);
    // Should have the last 50 lines (10..59)
    expect(result.tailLines[0]).toBe("line 10");
    expect(result.tailLines[49]).toBe("line 59");
  });
});

describe("parseTranscriptLines — loopDetected", () => {
  it("detects loop when same tailLine repeats 3+ times in the tail", () => {
    const lines: string[] = [];
    // Add 25 unique lines first
    for (let i = 0; i < 25; i++) {
      lines.push(JSON.stringify({
        type: "assistant",
        message: { role: "assistant", content: [{ type: "text", text: `unique-${i}` }] },
        timestamp: "2026-05-12T10:00:00.000Z",
      }));
    }
    // Then add 3 repeating lines
    for (let i = 0; i < 3; i++) {
      lines.push(JSON.stringify({
        type: "assistant",
        message: { role: "assistant", content: [{ type: "text", text: "repeating line" }] },
        timestamp: "2026-05-12T10:00:00.000Z",
      }));
    }
    expect(parseTranscriptLines(lines).loopDetected).toBe(true);
  });

  it("does not detect loop with unique lines", () => {
    const lines = Array.from({ length: 20 }, (_, i) =>
      JSON.stringify({
        type: "assistant",
        message: { role: "assistant", content: [{ type: "text", text: `unique-line-${i}` }] },
        timestamp: "2026-05-12T10:00:00.000Z",
      }),
    );
    expect(parseTranscriptLines(lines).loopDetected).toBe(false);
  });
});

describe("parseTranscript — reads from fixture file", () => {
  it("returns lastTestResult=pass from the sample fixture", async () => {
    const result = await parseTranscript(SAMPLE_FIXTURE);
    expect(result.lastTestResult).toBe("pass");
  });

  it("returns lastFileEdited=src/foo.ts from the sample fixture", async () => {
    const result = await parseTranscript(SAMPLE_FIXTURE);
    expect(result.lastFileEdited).toBe("src/foo.ts");
  });

  it("returns non-empty tailLines from the sample fixture", async () => {
    const result = await parseTranscript(SAMPLE_FIXTURE);
    expect(result.tailLines.length).toBeGreaterThan(0);
  });

  it("tailLines includes the rendered Bash command", async () => {
    const result = await parseTranscript(SAMPLE_FIXTURE);
    expect(result.tailLines.some((l) => l.includes("npm test"))).toBe(true);
  });

  it("tailLines includes a rendered Edit tool turn", async () => {
    const result = await parseTranscript(SAMPLE_FIXTURE);
    expect(result.tailLines.some((l) => l.includes("src/foo.ts"))).toBe(true);
  });

  it("returns lastActivityAt from the last timestamp in the fixture", async () => {
    const result = await parseTranscript(SAMPLE_FIXTURE);
    expect(result.lastActivityAt).toBe("2026-05-12T10:00:09.000Z");
  });

  it("returns null when the file does not exist", async () => {
    const result = await parseTranscript("/no/such/file.jsonl");
    expect(result.lastTestResult).toBe("unknown");
    expect(result.tailLines).toEqual([]);
  });
});
