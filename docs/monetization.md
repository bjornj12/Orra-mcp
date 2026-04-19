# Monetizing Orra (Post Open-Source)

A working brain dump of ways to make money off Orra once it's MIT and public. Split into conventional (proven playbooks) and unconventional (bets that could work because Orra sits in an unusual place — between the developer, their many Claude agents, and their repos). Not a plan. Inputs to a plan.

## What we're actually selling

Before pricing anything, name the moat. Orra is not "another MCP server." Its defensible positions are:

1. **Orchestration surface.** Orra is the layer that sees *all* your Claude sessions, worktrees, PRs, and headless agents at once. Single pane of glass for parallel AI dev.
2. **Memory layer.** `.orra/memory/` accumulates a longitudinal record of how an engineer (or team) actually ships. That's a data asset with compounding value.
3. **Directive library.** Curated, composable behaviors ("lanes") that encode engineering practice. Reusable across orgs.
4. **Headless fleet control.** `orra_spawn` + concurrency caps + allowlist = a safe control plane for running many autonomous Claude agents. Few tools have this.

Anything we charge for should map to one of these four. If it doesn't, it's probably a feature, not a product.

---

## Conventional (well-trodden)

### 1. Open-core with a Team/Cloud tier
The obvious one. Keep the MCP server MIT. Paid plan adds:
- **Hosted state sync** — shared `.orra/memory/` across laptops and CI for one engineer; shared across engineers for a team.
- **Team dashboard** — web UI over `orra_scan` for a whole org's worktrees / PRs / agents.
- **SSO, audit logs, RBAC** on directive installation and `orra_spawn` policies.
- **Policy engine** — org admins enforce `--allowed-tools` allowlists, concurrency caps, model choice, spend caps.

Per-seat pricing, ~$15–30/dev/mo. Enterprise tier with usage-based component on spawned agents.

### 2. Managed headless-agent runtime ("CI for agents")
`orra_spawn` today runs on the dev's laptop. Lift it into a hosted runner:
- Ephemeral sandboxes per spawn (safer than the laptop).
- Not battery/network-bound.
- Pre-warmed git clones, dependency caches.
- Per-agent-minute billing (pass through Anthropic token cost + margin on compute).

This is the biggest potential revenue line and the most capital-intensive. Also the most defensible — once a team's rebase/lint/snapshot fleet lives in your cloud, switching cost is real.

### 3. Directive Marketplace
Think "VS Code Marketplace" for directive packs. Authors publish packs (`rails-maintenance`, `monorepo-pr-shepherd`, `flaky-test-hunter`, `nextjs-migration-helper`). Free + paid listings. 80/20 rev share to authors. Orra curates a "verified" tier.

Cheap to stand up, hard to bootstrap (chicken-and-egg with packs/users), but becomes a real moat if it takes off — every installed pack makes Orra stickier.

### 4. Integrations as paid add-ons
Ship open-source state providers for the basics (GitHub, git). Sell the expensive-to-maintain ones:
- Linear / Jira / Shortcut / Asana
- Slack/Discord briefings ("Orra in your standup channel")
- Datadog / Honeycomb / Sentry ("agent hit prod errors → remediation spawn")
- PagerDuty / Opsgenie ("Orra drafts the rollback PR when you're paged")

Pricing: bundled with Team tier, or à la carte ($5–10/integration/mo).

### 5. Support / SLA contracts
Standard enterprise OSS move. Priority support, security review, private Slack, on-call for spawn misbehavior. $2k–20k/yr depending on team size. Low volume, high margin, great for enterprise trust.

### 6. Training, certification, content
"Claude Code power user" course. "Writing production directives" workshop. Partner with Anthropic for co-marketing. Probably not a primary revenue stream but funds evangelism and pipelines users into the paid plan.

### 7. Sponsorships / GitHub Sponsors
Floor-level. Covers nothing meaningful but signals legitimacy and pays for coffee early.

### 8. Dual license (AGPL core + commercial)
Alternative to open-core: license Orra under AGPL instead of MIT. Companies embedding it into internal dev platforms must buy a commercial license. Works; creates contribution friction; politically unpopular. Consider only if open-core struggles to convert.

---

## Unconventional (the interesting ones)

### 9. Usage-based on *outcomes*, not compute
Charge per successful autonomous remediation:
- "$0.25 per successfully rebased worktree"
- "$0.50 per snapshot update that lands green"
- "$1.00 per lint fix PR merged"

Only bill when the agent actually finished the job (tests green, PR approved, whatever the definition is). Aligns incentives with the customer better than seat or token pricing. Requires robust success-signal infrastructure, which Orra uniquely has via `orra_scan` classifications. Experimental but emotionally resonant — "you only pay when it works."

### 10. Engineering-productivity benchmarks as a data product
Orra sees, across every paying org: how long rebases take, how many agents land green on first try, time-from-open-to-merge, retry rates by directive. **Aggregate, anonymize, sell.**
- Annual "State of AI-assisted engineering" report — free, marketing.
- Live benchmarks dashboard — paid, per org, sold to engineering leaders who want to know if they're slow.
- Compliance angle: "prove to your board that AI code review happened before merge."

Be ruthlessly careful about consent and anonymization. Opt-in only. But the data is unique — nobody else is sitting at this layer.

### 11. "Shadow-mode engagement"
Two-week paid engagement: Orra runs in observe-only mode across a team; at the end, you hand them a report — the three highest-leverage directives to install, the worktrees that churn most, the rebase/CI patterns costing hours/week. Price: $10–25k per engagement. Converts into Team plan seats. Also a great wedge for services partners.

### 12. Reverse market: idle agent capacity
Developers commonly have Claude Code open but *idle*. With opt-in, Orra routes small, well-scoped tasks (OSS bug-bounty items, documentation PRs, dependency bumps) to those idle sessions. Splits the bounty/fee three ways: task poster, developer, Orra. Requires trust infrastructure, scoping safety, and careful governance — but it's a genuinely new primitive. High-risk, high-idea-value.

### 13. "AI engineering manager" persona
Premium persona beyond the default orchestrator:
- Weekly retros per developer, per team.
- Cross-worktree priority reconciliation.
- Draft 1:1 agendas from the week's commitments/misses.
- Flag patterns ("you committed to ship X three Mondays in a row and it slipped").

Sold per-seat as a premium directive pack ($10–20/mo on top of Team). Leans on the memory layer — the longer it runs, the harder to replace.

### 14. Bring-your-own-key with a take-rate
Users bring their Anthropic API key; Orra adds a small observability/coordination take (~2–5%) on spawned agent spend in exchange for hosted orchestration + spend dashboards + alerts. Lightweight alternative to building a full managed runtime. Requires Anthropic partnership to bill cleanly; probably starts as "we track, you get the invoice; pay us separately for the UI."

### 15. Compliance & governance product
Regulated orgs (finance, healthcare) want a story for "how do we let AI agents touch our repos?" Orra already has the primitives: allowlists, audit logs (via hooks), policy caps, directive attestations. Package it:
- SOC2-friendly audit export
- Directive-signing (only install directives signed by your org)
- "No spawn touches prod branches without human approval" policies
- Retention policies on `.orra/memory/`

High ACV ($25–100k+), long sales cycles, eats engineering time. But real demand once enterprises start letting Claude merge PRs.

### 16. "Co-pilot for your co-pilot" retainer
Monthly retainer where Orra's team embeds, tunes directives to a specific codebase, writes custom state providers, trains the memory layer. Think DHH-era Rails consulting, applied to AI-assisted dev. $10–30k/mo per client. Doesn't scale; great early revenue and product-feedback loop.

### 17. Knowledge-graph API over the memory layer
After N months, `.orra/memory/` is a rich graph: what shipped, when, by whom, with which commitments met. Expose a query API:
- "Which worktrees touch the payment service?"
- "Which commitments slipped last quarter and why?"
- "Who is the de-facto owner of the billing code based on who ships it?"

Sells to engineering leaders and internal-tool teams. Also feeds integrations (Jira auto-grooming, etc.). Risky — touches sensitive data; mishandle it and trust evaporates.

### 18. Fleet-pattern licensing to Anthropic / Claude Code itself
If Orra's patterns (directive lanes, spawn safety envelope, memory layer) prove out in the wild, the upstream may want some of them. Not a 2026 revenue line, but keep it in mind: either acquihire, a licensing deal, or becoming a reference implementation paid via partnership.

### 19. Ship-velocity leagues (weird but sticky)
Opt-in: teams compete on anonymized metrics (time-to-green, agent success rate). Leaderboards, quarterly awards, sponsor-able. Low-revenue directly (sponsorships only), high-engagement — and engagement fuels every other monetization line.

### 20. "Orra Pro Personal" — individual power user plan
Mid-market missed by most B2B tools: the independent consultant or OSS maintainer juggling 8 worktrees solo. Pack hosted memory sync across their machines, a personal dashboard, and all paid directives for $9/mo. Low margin per user; huge addressable market; word-of-mouth inside companies.

---

## Anti-patterns — things to avoid

- **Ads in briefings.** Will poison trust in the orchestrator persona. Don't.
- **Paywalling core correctness.** Anything that makes the free tier *unsafe* (e.g., only Pro gets concurrency caps) will end in a GitHub issue storm.
- **Token reselling without Anthropic partnership.** ToS minefield.
- **Unopt-in telemetry.** Anything touching the memory layer must be opt-in, aggressively. It's the crown jewel and the biggest trust liability.
- **Charging for directives that should ship in core.** The shipped directive library must stay strong; Marketplace is for specialized packs, not hostage-taking.

---

## A plausible staged portfolio

Rough ordering, not a roadmap:

1. **Months 0–3:** ship open source, GitHub Sponsors, start Pro Personal ($9/mo hosted memory sync). Validate that people want to pay anything.
2. **Months 3–9:** Team tier + dashboard + paid integrations. First paid directives from third parties (Marketplace beta).
3. **Months 6–12:** Managed spawn runtime (#2) + shadow-mode engagements (#11) to fund it. These two together form the real business.
4. **Year 2:** Compliance/governance (#15), benchmarks data product (#10), AI-EM persona (#13). Whichever three show strongest pull after a year of selling Team.
5. **Opportunistic:** consulting retainers (#16) throughout — cheap revenue and product signal.

Outcome-based billing (#9) and the idle-capacity market (#12) are worth prototyping cheaply but not building a company around until they've been stress-tested.

---

## Open questions to resolve before picking

- **Who actually buys?** Individual dev, team lead, or VP of Eng? Each implies a very different go-to-market.
- **What's Anthropic's posture?** Partner, neutral, or competitor? The managed runtime play hinges on this.
- **Is the memory layer a product or a feature?** If product: benchmarks + knowledge graph are the biggest bets. If feature: lean harder into orchestration + spawn runtime.
- **What's our stance on data?** Strict "your `.orra/` never leaves your machine" is a trust moat but kills #10, #17, and half of #15. Pick one and mean it.
