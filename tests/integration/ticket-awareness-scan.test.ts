import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execFileSync } from "node:child_process";
import { TicketStore } from "../../src/core/ticket-store.js";
import { scanAll } from "../../src/core/awareness.js";

let tmpRoot: string;
let projectRoot: string;
let worktreeRoot: string;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "orra-scan-tickets-"));
  projectRoot = path.join(tmpRoot, "project");
  fs.mkdirSync(projectRoot);
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: projectRoot });
  execFileSync("git", ["config", "user.email", "t@t"], { cwd: projectRoot });
  execFileSync("git", ["config", "user.name", "t"], { cwd: projectRoot });
  fs.writeFileSync(path.join(projectRoot, "README"), "x");
  execFileSync("git", ["add", "."], { cwd: projectRoot });
  execFileSync("git", ["commit", "-q", "-m", "init"], { cwd: projectRoot });

  worktreeRoot = path.join(tmpRoot, "wt-feat");
  execFileSync("git", ["worktree", "add", "-b", "feat", worktreeRoot], { cwd: projectRoot });
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe("scan + ticket integration", () => {
  it("includes attached ticket on the matching worktree entry", async () => {
    const store = new TicketStore(projectRoot);
    await store.write("wt-feat", {
      primary: { id: "uuid-1", identifier: "AUTH-142", title: "Refresh JWT" },
      source: "manual",
      manual: true,
    });

    const result = await scanAll(projectRoot);
    const entry = result.worktrees.find((w) => w.id === "wt-feat");
    expect(entry).toBeDefined();
    expect(entry?.ticket?.primary?.identifier).toBe("AUTH-142");
  });

  it("omits ticket field when no ticket file exists", async () => {
    const result = await scanAll(projectRoot);
    const entry = result.worktrees.find((w) => w.id === "wt-feat");
    expect(entry).toBeDefined();
    expect(entry?.ticket).toBeUndefined();
  });
});

describe("scan archives orphan tickets", () => {
  it("moves a ticket to _archived/ when its worktree no longer exists", async () => {
    const store = new TicketStore(projectRoot);
    await store.write("wt-deleted", {
      primary: { id: "uuid-1", identifier: "GONE-1" },
      source: "manual",
      manual: true,
    });

    expect(await store.read("wt-deleted")).not.toBeNull();
    await scanAll(projectRoot);
    expect(await store.read("wt-deleted")).toBeNull();
    const archivedPath = path.join(projectRoot, ".orra", "tickets", "_archived", "wt-deleted.json");
    expect(fs.existsSync(archivedPath)).toBe(true);
  });
});
