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

export function parseLog(logText: string): LogSignals {
  const clean = stripAnsi(logText);
  const allLines = clean.split("\n");
  const nonBlank = allLines.filter((l) => l.trim().length > 0);

  return {
    lastActivityAt: null,
    lastFileEdited: null,
    lastTestResult: "unknown",
    testFailureSnippet: null,
    errorPattern: null,
    loopDetected: false,
    tailLines: nonBlank.slice(-20),
  };
}
