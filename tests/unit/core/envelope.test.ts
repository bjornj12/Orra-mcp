import { describe, it, expect } from "vitest";
import { ok, fail, toMcpContent } from "../../../src/core/envelope.js";

describe("envelope", () => {
  it("ok() wraps data with ok:true", () => {
    expect(ok({ x: 1 })).toEqual({ ok: true, data: { x: 1 } });
  });

  it("fail() wraps error with ok:false", () => {
    expect(fail("bad", { hint: "try again" })).toEqual({
      ok: false,
      error: "bad",
      hint: "try again",
    });
  });

  it("toMcpContent() returns compact JSON in text block", () => {
    const r = toMcpContent(ok({ a: 1 }));
    expect(r.content[0].type).toBe("text");
    expect(r.content[0].text).toBe('{"ok":true,"data":{"a":1}}');
    expect(r.isError).toBeUndefined();
  });

  it("toMcpContent() sets isError when ok is false", () => {
    const r = toMcpContent(fail("nope"));
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toBe('{"ok":false,"error":"nope"}');
  });
});
