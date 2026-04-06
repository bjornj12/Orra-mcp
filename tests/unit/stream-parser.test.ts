import { describe, it, expect } from "vitest";
import { stripAnsi, StreamParser } from "../../src/core/stream-parser.js";

describe("stripAnsi", () => {
  it("should remove ANSI color codes", () => {
    expect(stripAnsi("\x1b[31mred text\x1b[0m")).toBe("red text");
  });

  it("should remove cursor movement sequences", () => {
    expect(stripAnsi("\x1b[2J\x1b[HHello")).toBe("Hello");
  });

  it("should pass through clean text unchanged", () => {
    expect(stripAnsi("Hello, World!")).toBe("Hello, World!");
  });

  it("should handle empty string", () => {
    expect(stripAnsi("")).toBe("");
  });
});

describe("StreamParser", () => {
  it("should collect chunks and provide full output", () => {
    const chunks: string[] = [];
    const parser = new StreamParser((chunk) => {
      chunks.push(chunk);
    });

    parser.feed("Hello ");
    parser.feed("World\n");

    expect(chunks).toEqual(["Hello ", "World\n"]);
  });

  it("should strip ANSI from output before passing to callback", () => {
    const chunks: string[] = [];
    const parser = new StreamParser((chunk) => {
      chunks.push(chunk);
    });

    parser.feed("\x1b[32mgreen text\x1b[0m\n");
    expect(chunks).toEqual(["green text\n"]);
  });

  it("should track total bytes received", () => {
    const parser = new StreamParser(() => {});
    parser.feed("Hello");
    parser.feed("World");
    expect(parser.totalBytes).toBe(10);
  });
});
