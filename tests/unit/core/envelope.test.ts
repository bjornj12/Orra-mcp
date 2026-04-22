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

  it("fail() extras cannot override reserved keys (ok/error/data)", () => {
    const env = fail("bad", {
      hint: "try again",
      ok: true,
      error: "good",
      data: { hacked: true },
    } as Record<string, unknown>);
    expect(env.ok).toBe(false);
    expect((env as { error: string }).error).toBe("bad");
    expect((env as Record<string, unknown>).hint).toBe("try again");
    expect((env as Record<string, unknown>).data).toEqual({ hacked: true });
    // toMcpContent should still flag this as an error
    expect(toMcpContent(env).isError).toBe(true);
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
