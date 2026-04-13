export interface LogSignals {
  lastActivityAt: string | null;
  lastFileEdited: string | null;
  lastTestResult: "pass" | "fail" | "unknown";
  testFailureSnippet: string | null;
  errorPattern: string | null;
  loopDetected: boolean;
  tailLines: string[];
}

// ANSI CSI sequences: ESC [ <params> <final-byte>
// Covers colors, bold, underline, cursor moves, etc.
const ANSI_CSI_RE = /\u001b\[[0-9;]*[A-Za-z]/g;

export function stripAnsi(text: string): string {
  return text.replace(ANSI_CSI_RE, "");
}

const TEST_PATTERNS: Array<{ regex: RegExp; verdict: "pass" | "fail" }> = [
  { regex: /\btests?:.*\d+\s+failed/i, verdict: "fail" },
  { regex: /\btests?:.*\d+\s+passed/i, verdict: "pass" },
  { regex: /\b\d+\s+failing\b/i, verdict: "fail" },
  { regex: /\b\d+\s+passing\b/i, verdict: "pass" },
  { regex: /\bFAIL\b/, verdict: "fail" },
  { regex: /\bPASS\b/, verdict: "pass" },
  { regex: /✗/, verdict: "fail" },
  { regex: /✓/, verdict: "pass" },
];

function detectTestResult(lines: string[]): "pass" | "fail" | "unknown" {
  // Walk lines newest-to-oldest, first hit wins.
  for (let i = lines.length - 1; i >= 0; i--) {
    for (const { regex, verdict } of TEST_PATTERNS) {
      if (regex.test(lines[i])) return verdict;
    }
  }
  return "unknown";
}

export function parseLog(logText: string): LogSignals {
  const clean = stripAnsi(logText);
  const allLines = clean.split("\n");
  const nonBlank = allLines.filter((l) => l.trim().length > 0);
  const recent = nonBlank.slice(-50);

  return {
    lastActivityAt: null,
    lastFileEdited: null,
    lastTestResult: detectTestResult(recent),
    testFailureSnippet: null,
    errorPattern: null,
    loopDetected: false,
    tailLines: nonBlank.slice(-20),
  };
}
