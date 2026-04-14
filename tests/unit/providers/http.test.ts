import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHttpProvider } from "../../../src/core/providers/http.js";

describe("HttpProvider", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("should fetch and parse valid provider response", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        protocolVersion: "1.0",
        worktrees: [{ id: "feat-a", path: "/tmp/feat-a", branch: "feat/a" }],
      }),
    } as Response);

    const provider = createHttpProvider({
      type: "http", url: "http://localhost:3456/state", timeout: 5000,
      followRedirects: true, maxRedirects: 5,
    });

    const result = await provider.fetch();
    expect(result.worktrees).toHaveLength(1);
    expect(result.worktrees[0].id).toBe("feat-a");
  });

  it("should expand env vars in headers", async () => {
    const originalEnv = process.env;
    process.env = { ...originalEnv, MY_TOKEN: "secret" };

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ protocolVersion: "1.0", worktrees: [] }),
    } as Response);

    const provider = createHttpProvider({
      type: "http", url: "http://localhost/state",
      headers: { Authorization: "Bearer $MY_TOKEN" },
      timeout: 5000, followRedirects: true, maxRedirects: 5,
    });

    await provider.fetch();
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      "http://localhost/state",
      expect.objectContaining({
        headers: { Authorization: "Bearer secret" },
      }),
    );

    process.env = originalEnv;
  });

  it("should throw on non-ok response", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false, status: 500, statusText: "Internal Server Error",
    } as Response);

    const provider = createHttpProvider({
      type: "http", url: "http://localhost/state", timeout: 5000,
      followRedirects: true, maxRedirects: 5,
    });

    await expect(provider.fetch()).rejects.toThrow("500");
  });
});
