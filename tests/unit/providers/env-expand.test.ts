import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { expandEnv, expandRecord } from "../../../src/core/providers/env-expand.js";

describe("expandEnv", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, TEST_TOKEN: "secret123", EMPTY_VAR: "" };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should expand $VAR references", () => {
    expect(expandEnv("Bearer $TEST_TOKEN")).toBe("Bearer secret123");
  });

  it("should expand standalone $VAR", () => {
    expect(expandEnv("$TEST_TOKEN")).toBe("secret123");
  });

  it("should leave non-$ strings unchanged", () => {
    expect(expandEnv("plain text")).toBe("plain text");
  });

  it("should expand missing vars to empty string", () => {
    expect(expandEnv("$NONEXISTENT")).toBe("");
  });

  it("should expand multiple vars in one string", () => {
    expect(expandEnv("$TEST_TOKEN and $EMPTY_VAR end")).toBe("secret123 and  end");
  });
});

describe("expandRecord", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, MY_KEY: "expanded" };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should expand all values in a record", () => {
    const result = expandRecord({ "X-Key": "$MY_KEY", plain: "value" });
    expect(result).toEqual({ "X-Key": "expanded", plain: "value" });
  });

  it("should return empty record for undefined input", () => {
    expect(expandRecord(undefined)).toEqual({});
  });
});
