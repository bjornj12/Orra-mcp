import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { TicketStore } from "../../src/core/ticket-store.js";
import type { NormalizedIssue } from "../../src/core/types/normalized-issue.js";

let tmpRoot: string;
let store: TicketStore;

const sampleIssue: NormalizedIssue = {
  id: "uuid-1",
  identifier: "AUTH-142",
  title: "Refresh JWT",
};

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "orra-tickets-"));
  store = new TicketStore(tmpRoot);
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe("TicketStore — paths", () => {
  it("resolves safe worktree IDs to .orra/tickets/<id>.json", () => {
    expect(store.pathFor("auth-refactor")).toBe(
      path.join(tmpRoot, ".orra", "tickets", "auth-refactor.json"),
    );
  });

  it("sanitizes unsafe characters in worktree IDs", () => {
    expect(store.pathFor("feat/auth refactor!")).toBe(
      path.join(tmpRoot, ".orra", "tickets", "feat_auth_refactor_.json"),
    );
  });
});

describe("TicketStore — read", () => {
  it("returns null when no ticket file exists", async () => {
    expect(await store.read("auth-refactor")).toBeNull();
  });

  it("returns parsed file when present", async () => {
    await store.write("auth-refactor", { primary: sampleIssue, source: "manual" });
    const got = await store.read("auth-refactor");
    expect(got?.primary?.identifier).toBe("AUTH-142");
    expect(got?.source).toBe("manual");
    expect(got?.worktree).toBe("auth-refactor");
    expect(got?.synced_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe("TicketStore — write", () => {
  it("creates the tickets directory if missing", async () => {
    await store.write("auth-refactor", { primary: sampleIssue, source: "manual" });
    expect(fs.existsSync(path.join(tmpRoot, ".orra", "tickets"))).toBe(true);
  });

  it("overwrites existing files atomically", async () => {
    await store.write("auth-refactor", { primary: sampleIssue, source: "manual" });
    await store.write("auth-refactor", {
      primary: { ...sampleIssue, title: "Updated" },
      source: "manual",
    });
    const got = await store.read("auth-refactor");
    expect(got?.primary?.title).toBe("Updated");
  });

  it("stamps synced_at on every write", async () => {
    await store.write("auth-refactor", { primary: sampleIssue, source: "manual" });
    const before = (await store.read("auth-refactor"))?.synced_at;
    await new Promise((r) => setTimeout(r, 10));
    await store.write("auth-refactor", { primary: sampleIssue, source: "manual" });
    const after = (await store.read("auth-refactor"))?.synced_at;
    expect(after).not.toBe(before);
  });
});
