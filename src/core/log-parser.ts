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

const FILE_EDIT_RE = /^(?:modified|edited|wrote|created):\s*(\S.+)$/i;
const FILE_EDIT_VERB_RE = /^(?:wrote|created)\s+(\S.+)$/i;

function detectLastFileEdited(lines: string[]): string | null {
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    const m1 = line.match(FILE_EDIT_RE);
    if (m1) return m1[1].trim();
    const m2 = line.match(FILE_EDIT_VERB_RE);
    if (m2) return m2[1].trim();
  }
  return null;
}

const ERROR_FAMILIES: Array<{ regex: RegExp; family: string }> = [
  { regex: /\bENOENT\b/, family: "ENOENT" },
  { regex: /\bECONNREFUSED\b/, family: "ECONNREFUSED" },
  { regex: /\bETIMEDOUT\b|timed out|timeout/i, family: "timeout" },
  { regex: /command not found/i, family: "command_not_found" },
  { regex: /permission denied/i, family: "permission_denied" },
  { regex: /syntax error/i, family: "syntax_error" },
];

function detectErrorPattern(lines: string[]): string | null {
  for (let i = lines.length - 1; i >= 0; i--) {
    for (const { regex, family } of ERROR_FAMILIES) {
      if (regex.test(lines[i])) return family;
    }
  }
  return null;
}

function detectLoop(tail: string[]): boolean {
  const counts = new Map<string, number>();
  for (const line of tail) {
    counts.set(line, (counts.get(line) ?? 0) + 1);
  }
  for (const n of counts.values()) {
    if (n >= 3) return true;
  }
  return false;
}

export function parseLog(logText: string): LogSignals {
  const clean = stripAnsi(logText);
  const allLines = clean.split("\n");
  const nonBlank = allLines.filter((l) => l.trim().length > 0);
  const recent50 = nonBlank.slice(-50);
  const tail20 = nonBlank.slice(-20);

  return {
    lastActivityAt: null,
    lastFileEdited: detectLastFileEdited(recent50),
    lastTestResult: detectTestResult(recent50),
    testFailureSnippet: null,
    errorPattern: detectErrorPattern(recent50),
    loopDetected: detectLoop(tail20),
    tailLines: tail20,
  };
}
