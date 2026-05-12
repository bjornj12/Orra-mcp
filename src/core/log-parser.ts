import * as fs from "node:fs/promises";

// ─── LogSignals (output shape, consumed by summary.ts) ────────────────────────

export interface LogSignals {
  lastFileEdited: string | null;
  lastTestResult: "pass" | "fail" | "unknown";
  errorPattern: string | null;
  loopDetected: boolean;
  tailLines: string[];
  lastActivityAt: string | null;
}

// ─── ANSI stripping ───────────────────────────────────────────────────────────

// ESC [ ... <final byte>  — CSI sequences: colors, bold, cursor moves, private
// modes (e.g. \x1b[?2026h), bracketed paste, etc. Written with \x1b (not a literal
// control byte) so the source stays greppable.
const ANSI_CSI_RE = /\x1b\[[0-?]*[ -/]*[@-~]/g;
// ESC ] ... (BEL | ESC \)  — OSC sequences: window title, hyperlinks (\x1b]0;…BEL).
const ANSI_OSC_RE = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;

export function stripAnsi(text: string): string {
  return text.replace(ANSI_OSC_RE, "").replace(ANSI_CSI_RE, "");
}

// ─── Signal detection heuristics ─────────────────────────────────────────────

const TEST_PATTERNS: Array<{ regex: RegExp; verdict: "pass" | "fail" }> = [
  { regex: /\btests?:.*?\b[1-9]\d*\s+failed/i, verdict: "fail" },
  { regex: /\btests?:.*\d+\s+passed/i, verdict: "pass" },
  { regex: /\b[1-9]\d*\s+failing\b/i, verdict: "fail" },
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
  const tail20 = tail.slice(-20);
  const counts = new Map<string, number>();
  for (const line of tail20) {
    counts.set(line, (counts.get(line) ?? 0) + 1);
  }
  for (const n of counts.values()) {
    if (n >= 3) return true;
  }
  return false;
}

// ─── Transcript JSONL turn types ─────────────────────────────────────────────

interface TextBlock {
  type: "text";
  text: string;
}

interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

interface ToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string | Array<{ type: string; text?: string }>;
}

type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock | Record<string, unknown>;

interface TranscriptLine {
  type?: string;
  timestamp?: string;
  message?: {
    role?: string;
    content?: string | ContentBlock[];
  };
}

// ─── Rendering helpers ────────────────────────────────────────────────────────

function renderToolUse(block: ToolUseBlock): string {
  const name = block.name ?? "";
  const input = block.input ?? {};

  if (name === "Bash") {
    const cmd = typeof input.command === "string" ? input.command : "";
    return `$ ${cmd}`;
  }
  if (name === "Edit" || name === "Write") {
    const filePath = typeof input.file_path === "string" ? input.file_path
      : typeof input.path === "string" ? input.path
      : "";
    return `✎ ${filePath}`;
  }
  // Other tools: generic compact rendering
  const args = Object.entries(input)
    .slice(0, 2)
    .map(([k, v]) => `${k}=${typeof v === "string" ? v.slice(0, 40) : String(v)}`)
    .join(", ");
  return `[${name}${args ? ` ${args}` : ""}]`;
}

function renderToolResult(block: ToolResultBlock): string {
  let text = "";
  if (typeof block.content === "string") {
    text = block.content;
  } else if (Array.isArray(block.content)) {
    const first = block.content.find((b) => typeof b === "object" && b.type === "text");
    text = first && typeof first === "object" && "text" in first ? String(first.text) : "";
  }
  const firstLine = text.split("\n")[0] ?? "";
  const ellipsis = text.includes("\n") ? "…" : "";
  return `⎿ ${firstLine}${ellipsis}`;
}

// ─── Core JSONL parser ────────────────────────────────────────────────────────

/**
 * Parse a Claude Code session transcript JSONL (array of raw lines, one JSON object each).
 * Returns the same LogSignals shape that summary.ts consumes.
 */
export function parseTranscriptLines(lines: string[]): LogSignals {
  const renderedLines: string[] = [];
  let lastActivityAt: string | null = null;
  // For file-edit detection: last Edit/Write file_path
  let lastFileEdited: string | null = null;
  // For test detection: collect all tool_result text content for the regex pass
  const testContentLines: string[] = [];

  for (const raw of lines) {
    const trimmed = raw.trim();
    if (!trimmed) continue;

    let obj: TranscriptLine;
    try {
      obj = JSON.parse(trimmed) as TranscriptLine;
    } catch {
      continue;
    }

    if (typeof obj.timestamp === "string" && obj.timestamp) {
      lastActivityAt = obj.timestamp;
    }

    const msg = obj.message;
    if (!msg) continue;

    const content = msg.content;
    if (!content) continue;

    // content can be a plain string (user text) or an array of blocks
    const blocks: ContentBlock[] = typeof content === "string"
      ? [{ type: "text", text: content } as TextBlock]
      : Array.isArray(content) ? content as ContentBlock[]
      : [];

    for (const block of blocks) {
      if (typeof block !== "object" || !block) continue;
      const btype = (block as Record<string, unknown>).type as string;

      if (btype === "text") {
        const textBlock = block as TextBlock;
        const lines = textBlock.text.split("\n").filter((l) => l.trim().length > 0);
        renderedLines.push(...lines);
      } else if (btype === "tool_use") {
        const toolBlock = block as ToolUseBlock;
        renderedLines.push(renderToolUse(toolBlock));

        // Track last file edited
        const name = toolBlock.name ?? "";
        if (name === "Edit" || name === "Write") {
          const input = toolBlock.input ?? {};
          const fp = typeof input.file_path === "string" ? input.file_path
            : typeof input.path === "string" ? input.path
            : null;
          if (fp) lastFileEdited = fp;
        }
      } else if (btype === "tool_result") {
        const resultBlock = block as ToolResultBlock;
        renderedLines.push(renderToolResult(resultBlock));

        // Collect raw text content for test-result detection
        if (typeof resultBlock.content === "string") {
          testContentLines.push(...resultBlock.content.split("\n"));
        } else if (Array.isArray(resultBlock.content)) {
          for (const sub of resultBlock.content) {
            if (typeof sub === "object" && sub && sub.type === "text" && typeof (sub as TextBlock).text === "string") {
              testContentLines.push(...(sub as TextBlock).text.split("\n"));
            }
          }
        }
      }
    }
  }

  // Keep last 50 rendered lines
  const tail50 = renderedLines.slice(-50);

  // Test detection: scan tool_result content + rendered lines for test signals
  const testLines = [...testContentLines, ...renderedLines];
  const lastTestResult = detectTestResult(testLines);

  // Error detection: over all rendered lines
  const errorPattern = detectErrorPattern(renderedLines);

  // Loop detection: over tail20 of rendered lines
  const loopDetected = detectLoop(tail50);

  return {
    lastFileEdited,
    lastTestResult,
    errorPattern,
    loopDetected,
    tailLines: tail50,
    lastActivityAt,
  };
}

/**
 * Parse a Claude Code session transcript from a `.jsonl` file path.
 * Returns empty signals (not throws) if the file is missing or unreadable.
 */
export async function parseTranscript(filePath: string): Promise<LogSignals> {
  let text: string;
  try {
    text = await fs.readFile(filePath, "utf-8");
  } catch {
    return {
      lastFileEdited: null,
      lastTestResult: "unknown",
      errorPattern: null,
      loopDetected: false,
      tailLines: [],
      lastActivityAt: null,
    };
  }
  return parseTranscriptLines(text.split("\n"));
}
