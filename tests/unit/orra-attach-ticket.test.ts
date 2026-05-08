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

describe("orra_attach_ticket — primary vs related", () => {
  it("appends to related[] when primary=false", async () => {
    await handleOrraAttachTicket(tmpRoot, parse({
      worktree: "auth-refactor",
      ticket: { id: "uuid-1", identifier: "AUTH-142" },
    }));
    await handleOrraAttachTicket(tmpRoot, parse({
      worktree: "auth-refactor",
      ticket: { id: "uuid-2", identifier: "AUTH-150" },
      primary: false,
    }));
    const file = await new TicketStore(tmpRoot).read("auth-refactor");
    expect(file?.primary?.identifier).toBe("AUTH-142");
    expect(file?.related).toHaveLength(1);
    expect(file?.related?.[0].identifier).toBe("AUTH-150");
  });

  it("dedupes related[] by id", async () => {
    await handleOrraAttachTicket(tmpRoot, parse({
      worktree: "auth-refactor",
      ticket: { id: "uuid-1", identifier: "AUTH-142" },
    }));
    await handleOrraAttachTicket(tmpRoot, parse({
      worktree: "auth-refactor",
      ticket: { id: "uuid-2", identifier: "AUTH-150", title: "v1" },
      primary: false,
    }));
    await handleOrraAttachTicket(tmpRoot, parse({
      worktree: "auth-refactor",
      ticket: { id: "uuid-2", identifier: "AUTH-150", title: "v2" },
      primary: false,
    }));
    const file = await new TicketStore(tmpRoot).read("auth-refactor");
    expect(file?.related).toHaveLength(1);
    expect(file?.related?.[0].title).toBe("v2");
  });

  it("preserves related[] when overwriting primary", async () => {
    await handleOrraAttachTicket(tmpRoot, parse({
      worktree: "auth-refactor",
      ticket: { id: "uuid-1", identifier: "AUTH-142" },
    }));
    await handleOrraAttachTicket(tmpRoot, parse({
      worktree: "auth-refactor",
      ticket: { id: "uuid-2", identifier: "AUTH-150" },
      primary: false,
    }));
    await handleOrraAttachTicket(tmpRoot, parse({
      worktree: "auth-refactor",
      ticket: { id: "uuid-1", identifier: "AUTH-142", title: "Updated" },
    }));
    const file = await new TicketStore(tmpRoot).read("auth-refactor");
    expect(file?.primary?.title).toBe("Updated");
    expect(file?.related).toHaveLength(1);
    expect(file?.related?.[0].identifier).toBe("AUTH-150");
  });

  it("rejects related write when no primary exists yet", async () => {
    const result = await handleOrraAttachTicket(tmpRoot, parse({
      worktree: "auth-refactor",
      ticket: { id: "uuid-2", identifier: "AUTH-150" },
      primary: false,
    }));
    const env = JSON.parse(result.content[0].text);
    expect(env.ok).toBe(false);
    expect(env.error).toMatch(/no primary/i);
  });
});

describe("orra_attach_ticket — manual flag protection", () => {
  it("preserves manual=true when re-attaching with source=manual", async () => {
    await handleOrraAttachTicket(tmpRoot, parse({
      worktree: "auth-refactor",
      ticket: { id: "uuid-1", identifier: "AUTH-142" },
    }));
    await handleOrraAttachTicket(tmpRoot, parse({
      worktree: "auth-refactor",
      ticket: { id: "uuid-1", identifier: "AUTH-142", title: "Updated" },
    }));
    const file = await new TicketStore(tmpRoot).read("auth-refactor");
    expect(file?.manual).toBe(true);
  });

  it("refuses to overwrite a manual primary with a non-manual source", async () => {
    await handleOrraAttachTicket(tmpRoot, parse({
      worktree: "auth-refactor",
      ticket: { id: "uuid-1", identifier: "AUTH-142" },
    }));
    const result = await handleOrraAttachTicket(tmpRoot, parse({
      worktree: "auth-refactor",
      ticket: { id: "uuid-2", identifier: "AUTH-200" },
      source: "directive",
    }));
    const env = JSON.parse(result.content[0].text);
    expect(env.ok).toBe(false);
    expect(env.error).toMatch(/manual/i);
    const file = await new TicketStore(tmpRoot).read("auth-refactor");
    expect(file?.primary?.identifier).toBe("AUTH-142");
  });

  it("allows non-manual source to write when no manual flag is set", async () => {
    await handleOrraAttachTicket(tmpRoot, parse({
      worktree: "auth-refactor",
      ticket: { id: "uuid-1", identifier: "AUTH-142" },
      source: "directive",
    }));
    await handleOrraAttachTicket(tmpRoot, parse({
      worktree: "auth-refactor",
      ticket: { id: "uuid-2", identifier: "AUTH-200" },
      source: "linear-provider",
    }));
    const file = await new TicketStore(tmpRoot).read("auth-refactor");
    expect(file?.primary?.identifier).toBe("AUTH-200");
    expect(file?.manual).toBeFalsy();
  });
});
