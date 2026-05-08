import { z } from "zod";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ok, fail, toMcpContent } from "../core/envelope.js";
import { SafeWorktreeIdSchema } from "../core/validation.js";
import { NormalizedIssueSchema } from "../core/types/normalized-issue.js";
import { TicketStore } from "../core/ticket-store.js";

const execFileAsync = promisify(execFile);

async function worktreeExists(projectRoot: string, worktreeId: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync("git", ["worktree", "list", "--porcelain"], { cwd: projectRoot });
    const paths = stdout.split("\n")
      .filter((line) => line.startsWith("worktree "))
      .map((line) => line.slice("worktree ".length));
    return paths.some((p) => p.split("/").pop() === worktreeId);
  } catch {
    return false;
  }
}

export const orraAttachTicketSchema = z.object({
  worktree: SafeWorktreeIdSchema.describe("Worktree ID (directory name) to attach the ticket to"),
  ticket: NormalizedIssueSchema.describe("Symphony-normalized issue object"),
  primary: z
    .boolean()
    .default(true)
    .describe("Whether this ticket is the primary one for the worktree (default true). false = append to related[]."),
  source: z
    .string()
    .default("manual")
    .describe("Origin of this attachment: 'manual' (user/Claude), 'directive', or 'linear-provider'"),
});

export async function handleOrraAttachTicket(
  projectRoot: string,
  args: z.infer<typeof orraAttachTicketSchema>,
) {
  const { worktree, ticket, primary, source } = args;

  if (!(await worktreeExists(projectRoot, worktree))) {
    return toMcpContent(fail(
      `Worktree "${worktree}" is not a registered git worktree in this project. Run 'git worktree list' to see available worktrees.`,
    ));
  }

  const store = new TicketStore(projectRoot);
  const existing = await store.read(worktree);

  if (primary) {
    if (existing?.manual && source !== "manual") {
      return toMcpContent(fail(
        `Cannot overwrite manual ticket on worktree "${worktree}" from source "${source}". Re-attach with source: "manual" to override.`,
      ));
    }
    await store.write(worktree, {
      primary: ticket,
      related: existing?.related,
      source,
      manual: source === "manual" ? true : existing?.manual,
    });
    return toMcpContent(ok({ worktree, identifier: ticket.identifier, primary: true }));
  }

  // primary: false — append to related[], require primary already exists.
  if (!existing?.primary) {
    return toMcpContent(fail(
      `Cannot attach related ticket: no primary ticket on worktree "${worktree}". Attach the primary first.`,
    ));
  }
  const related = existing.related ?? [];
  const filtered = related.filter((r) => r.id !== ticket.id);
  filtered.push(ticket);
  await store.write(worktree, {
    primary: existing.primary,
    related: filtered,
    source,
    manual: existing.manual,
  });
  return toMcpContent(ok({ worktree, identifier: ticket.identifier, primary: false }));
}
