import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { handleOrraAttachTicket, orraAttachTicketSchema } from "../../src/tools/orra-attach-ticket.js";
import { TicketStore } from "../../src/core/ticket-store.js";

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "orra-attach-"));
  fs.mkdirSync(path.join(tmpRoot, "auth-refactor"));
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

function parse(input: unknown) {
  return orraAttachTicketSchema.parse(input);
}

describe("orra_attach_ticket — happy path", () => {
  it("writes a primary ticket to the store with source=manual", async () => {
    const result = await handleOrraAttachTicket(tmpRoot, parse({
      worktree: "auth-refactor",
      ticket: { id: "uuid-1", identifier: "AUTH-142", title: "Refresh JWT" },
    }));
    expect(result.isError).toBeUndefined();
    const env = JSON.parse(result.content[0].text);
    expect(env.ok).toBe(true);

    const store = new TicketStore(tmpRoot);
    const file = await store.read("auth-refactor");
    expect(file?.primary?.identifier).toBe("AUTH-142");
    expect(file?.source).toBe("manual");
    expect(file?.manual).toBe(true);
  });

  it("returns parsed worktree id in the response", async () => {
    const result = await handleOrraAttachTicket(tmpRoot, parse({
      worktree: "auth-refactor",
      ticket: { id: "uuid-1", identifier: "AUTH-142" },
    }));
    const env = JSON.parse(result.content[0].text);
    expect(env.data.worktree).toBe("auth-refactor");
    expect(env.data.identifier).toBe("AUTH-142");
  });
});

describe("orra_attach_ticket — validation", () => {
  it("rejects missing ticket.id at the schema layer", () => {
    expect(() => parse({
      worktree: "auth-refactor",
      ticket: { identifier: "AUTH-142" },
    })).toThrow();
  });

  it("rejects unsafe worktree IDs at the schema layer", () => {
    expect(() => parse({
      worktree: "../etc/passwd",
      ticket: { id: "uuid-1", identifier: "AUTH-142" },
    })).toThrow();
  });
});
