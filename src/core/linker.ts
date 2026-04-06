import * as crypto from "node:crypto";
import type { AgentState, Link, LinkTo, LinkTrigger } from "../types.js";

export function expandTemplate(template: string, agent: AgentState): string {
  return template
    .replace(/\{\{from\.branch\}\}/g, agent.branch)
    .replace(/\{\{from\.worktree\}\}/g, agent.worktree)
    .replace(/\{\{from\.task\}\}/g, agent.task)
    .replace(/\{\{from\.status\}\}/g, agent.status);
}

function exitCodeMatchesTrigger(
  exitCode: number,
  trigger: LinkTrigger
): boolean {
  if (trigger === "any") return true;
  if (trigger === "success") return exitCode === 0;
  if (trigger === "failure") return exitCode !== 0;
  return false;
}

export class Linker {
  private links: Link[] = [];

  createLink(from: string, to: LinkTo, on: LinkTrigger): Link {
    const link: Link = {
      id: `link-${crypto.randomBytes(4).toString("hex")}`,
      from,
      to,
      on,
      status: "pending",
      firedAgentId: null,
      createdAt: new Date().toISOString(),
    };
    this.links.push(link);
    return link;
  }

  findMatchingLinks(agentId: string, exitCode: number): Link[] {
    return this.links.filter(
      (link) =>
        link.from === agentId &&
        link.status === "pending" &&
        exitCodeMatchesTrigger(exitCode, link.on)
    );
  }

  evaluateAndExpire(agentId: string, exitCode: number): void {
    for (const link of this.links) {
      if (
        link.from === agentId &&
        link.status === "pending" &&
        !exitCodeMatchesTrigger(exitCode, link.on)
      ) {
        link.status = "expired";
      }
    }
  }

  markFired(linkId: string, firedAgentId: string): void {
    const link = this.links.find((l) => l.id === linkId);
    if (link) {
      link.status = "fired";
      link.firedAgentId = firedAgentId;
    }
  }

  getAllLinks(): Link[] {
    return [...this.links];
  }

  loadLinks(links: Link[]): void {
    this.links = [...links];
  }
}
