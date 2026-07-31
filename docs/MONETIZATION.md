# Monetization Strategy

**Audience:** incoming Product Manager
**Mandate:** turn this repo into revenue
**Prerequisite reading:** [`PRODUCT_OVERVIEW.md`](./PRODUCT_OVERVIEW.md)

> **On numbers in this document.** Every dollar figure is either a *decision framework* or an *illustrative example clearly marked as such*. No Replicate per-run price here has been verified — the codebase contains no pricing data and the app has never recorded cost. **Pull live per-model pricing from replicate.com and the owner's actual invoices before committing to any price point.** §5 gives you the model to plug them into.

---

## 1. The core strategic finding

**The product is not what the README describes.**

The repo is named for coloring books, but the last three months of commits — Workflows, scheduling, prompt slots, branching steps, video models, captions — built something else. With the coloring-book and LoRA branches cut, what remains is one coherent thing:

> **An unattended production line for short-form social video.**
> Generate → edit → animate → caption, chained and scheduled, running with nobody watching.

Name that, and the positioning writes itself.

**The second finding, unchanged by the narrowing:** what stands between this repo and revenue is not features. It is that **the app has no concept of a second user, no concept of money, and no concept of what anything costs.** Every path below is gated on the same three primitives — identity, metering, billing. The sequencing question is entirely about how much of that you build before charging anyone.

**What the narrowing bought you:** a sharper story, ~600 fewer LOC to maintain, two fewer Python dependencies, and one clear pipeline to market instead of three unrelated tools sharing a login. It also removed two segments (Amazon KDP publishers, LoRA trainers) that this document no longer addresses.

---

## 2. Market segments

### Primary — Faceless short-form content creators ★

Operators running TikTok / Reels / Shorts channels publishing AI-generated content without appearing on camera. They publish daily or several times daily, and their bottleneck is *volume of finished, captioned, vertical video.*

- **Why it fits:** the flagship pipeline (z-image-turbo → p-image-edit → p-video → tiktok-captions) on a schedule *is* this job, already working.
- **Willingness to pay:** high and proven; incumbents in this category sit at $20–$100/mo.
- **The hard problem you can actually solve:** character and style consistency across hundreds of posts. Flux Klein's multi-reference input plus p-image-edit's `subject_consistency` / `style_consistency` / `scene_consistency` presets plus workflow `initial_image_ids` pinning is a real answer to this. Most competitors generate each post independently and drift. **Lead with consistency, not volume** — volume is table stakes, consistency is the complaint.
- **What's missing:** direct publishing to TikTok/YouTube, a content calendar, and review-before-post.

### Secondary — E-commerce sellers and product marketers

Small brands and Shopify/Etsy sellers who need lifestyle imagery and short video ads from a plain product photo.

- **Why it fits:** this is what half of p-image-edit's preset list already does. `white_to_scene` takes a white-background product shot into a lifestyle scene; `relight` and `light_restoration` fix bad phone lighting; `photous` and `anything_to_real` push toward photoreal; `upscale` finishes. Then p-video animates the result into an ad. The workflow engine batches it across a catalogue.
- **Willingness to pay:** **higher than creators** — this is a direct cost-of-goods substitute for a photoshoot, and the buyer has revenue to attribute it to.
- **What's missing:** bulk catalogue import, aspect-ratio presets per channel (Amazon/Shopify/Meta), and brand-kit consistency.
- **Recommendation:** validate this second, but validate it early. It may well out-monetize the primary segment on ARPU, and it costs you nothing extra to serve — it's the same four models with a different template pack and landing page.

### Expansion — Agencies and social media managers

Multi-client production. Needs workspaces, brand kits, approval flows, and client delivery — a materially bigger build. **Note it as the natural move after one of the above lands; do not target it now.**

---

## 3. Monetization models evaluated

| Model | Time to first revenue | Build cost | Ceiling | COGS risk |
|---|---|---|---|---|
| **A. Sell the outputs** (run your own channels; sell video ads as a service) | Days | None | Low, non-recurring | You bear it, but you control volume |
| **B. Self-hosted licence, bring-your-own Replicate key** | 4–6 weeks | Low | Moderate | **Zero — the customer pays Replicate directly** |
| **C. Hosted SaaS with credits** | 4–6 months | High | High | High — you own it and must price above it |
| **D. API / white-label for agencies** | 6+ months | High | High | High |

### Recommended sequence: **A → B → C**, overlapping rather than waterfall

**Phase 0 — Sell the outputs (start now, never stop).**
Run one or two faceless channels off scheduled workflows, and take a handful of paid product-video gigs from the secondary segment. This is not a detour: it generates cash immediately, and it is the **only way to learn the real unit economics, failure modes, and feature gaps before asking a stranger to pay.** Everything in Phases 1 and 2 is better-informed for having done it. Budget 4–8 weeks of the owner's time in parallel with Phase 1 engineering.

**Phase 1 — Self-hosted licence, BYO API key (first *software* revenue).**
Package the Docker Compose stack as a paid product. The customer supplies their own `REPLICATE_API_TOKEN`; you sell a licence key that unlocks it, plus updates and support.

This is the highest-leverage move available, because **it monetizes without solving multi-tenancy, billing, credits, cost control, or abuse.** The three hardest problems in this repo all evaporate when the customer runs their own instance with their own key. You ship roughly what exists today plus a licence check, a setup experience a non-developer can survive, and documentation.

- Suggested shape: **$149–$249 one-time**, or **$29/mo** for updates and support. Validate with a landing page before building.
- Honest constraint: the buyer must be technical enough to run Docker. That's a real ceiling, and it's why Phase 1 is a stepping stone, not the destination.

**Phase 2 — Hosted SaaS with credits (the actual business).**
Once Phase 1 proves demand and Phase 0 proves the economics, build the real thing: signup, workspaces, credits, Stripe, object storage, a job queue, moderation. §6 sizes it.

**Do not start with Phase 2.** The gap list in `PRODUCT_OVERVIEW.md` §6 is a 4–6 month build for a small team, and you'd be building it before knowing whether anyone pays.

---

## 4. Packaging and pricing (Phase 2)

### Why credits, not unlimited

COGS is per-generation and **wildly variable by model.** A p-video run can cost one to two orders of magnitude more than a z-image-turbo image, and its cost scales with a **user-controlled duration slider (1–30s)**. An unlimited plan at any defensible price is destroyed by one user chaining 30-second video workflows on a 15-minute schedule. Credits make cost visible and align price with spend.

**Anchor 1 credit to a single z-image-turbo generation** — the cheapest operation — then price everything else as a published multiple of underlying Replicate cost with uniform margin. Users of tools like this expect and accept this.

### Proposed tiers — *structure is the recommendation, prices are placeholders pending §5*

| | **Free** | **Creator** | **Studio** | **Agency** |
|---|---|---|---|---|
| Price/mo | $0 | ~$29 | ~$79 | ~$199 |
| Credits/mo | 50 | 1,500 | 5,000 | 15,000 |
| Generate (z-image, flux) | ✓ | ✓ | ✓ | ✓ |
| Edit (p-image-edit presets) | 3 basic presets | All 18 | All 18 | All 18 |
| Animate (p-video) | — | ✓ max 5s | ✓ max 15s | ✓ max 30s |
| Captions | — | ✓ | ✓ | ✓ |
| Scheduled workflows | — | 3 | 15 | Unlimited |
| Min. schedule interval | — | 6 hours | 1 hour | 15 min |
| Saved reference sets (consistency) | 1 | 3 | 15 | Unlimited |
| Output watermark | Yes | — | — | — |
| Asset retention | 7 days | 90 days | 1 year | Unlimited |
| Seats | 1 | 1 | 3 | 10 |
| Commercial-use licence | — | ✓ | ✓ | ✓ |
| API access | — | — | — | ✓ |

**Gating rationale:**

- **Video behind the paywall, and capped by duration per tier.** It is the dominant COGS *and* the highest-value output, and duration is the single biggest cost multiplier in the product. Free users get images only — enough to feel the product, not enough to cost you.
- **Scheduled workflows are the retention hook.** A user with three live schedules generates value while logged out; that's what makes churn hurt. Gate both the *count* and the *minimum interval* — interval throttling doubles as protection for the single-worker infrastructure.
- **Saved reference sets are the consistency feature**, and consistency is the differentiator (§2). Gating the *number* of saved character/style sets monetizes the thing users care most about without limiting output volume.
- **Preset access splits Free from paid.** The scene-construction and consistency presets are where the value is; give free users lighting fixes only.
- **Retention limits are a real cost lever** — video files are large, and unlimited storage on a $29 plan is a slow leak.
- **Credit top-ups on every paid tier.** Heavy users self-select into more revenue instead of churning at the cap.

### Annual and overage
Annual at ~2 months free — standard, improves cash position and LTV. Roll credits over one month only, capped at the monthly allowance: generous enough to feel fair, bounded enough not to accumulate a liability.

---

## 5. Unit economics — the model to fill in

**The most important open work item.** You cannot price Phase 2 without it, and the app cannot tell you the answer because it has never recorded a cost.

### Cost per generation

Build this table from live replicate.com pricing:

| Model | Billing basis | Price | Notes |
|---|---|---|---|
| `prunaai/z-image-turbo` | per image | ? | Expected cheapest — **anchor 1 credit here** |
| `black-forest-labs/flux-2-klein-9b` | per image | ? | ×N outputs as **sequential** calls (`flux_2_klein_9b.py:78-91`) — cost is strictly linear in output count |
| `prunaai/p-image-edit` | per image | ? | |
| `prunaai/p-video` | per second | ? | **Duration 1–30s, user-controlled — the largest cost lever in the product** |
| `shreejalmaharjan-27/tiktok-short-captions` | per run / compute-second | ? | Likely scales with video length |
| `google/nano-banana-2` | per image | ? | Secondary |
| `xai/grok-imagine-video` | per second | ? | Secondary, capped at 8s |

### Cost per workflow run

```
run_cost = Σ over steps ( step.num_outputs × cost_per_generation(step.model, step.params) )
```

Note that branching (`source_step_index`) lets one run fan out, so `num_outputs` on a late video step is a genuine multiplier — a single scheduled run is not a single generation.

### Cost per user per month

```
monthly_cogs = ad_hoc_cost
             + Σ over enabled workflows ( runs_per_month × run_cost )

where runs_per_month = (30 × 24 × 60) / schedule_interval_minutes
```

### Run this before you finish reading

Worst legal case on the cheapest paid tier: a Creator user with 3 workflows at a 6-hour interval, each producing one 5-second video with captions, is **360 video runs/month**. At an illustrative $0.20 per 5-second video plus captioning, that user costs ~$72–$90/month on a $29 plan.

**The schedule-interval limit and the per-tier video duration cap are not niceties — they are the primary margin controls, and their values must be derived from this arithmetic rather than chosen by feel.**

### Target
Gross margin ≥ 70% at the median user on each paid tier, with the **worst-case** user on that tier still gross-margin-positive. If the worst case is negative, tighten the interval limit, lower the duration cap, or move the model up a tier. Do not rely on averages: scheduled workloads mean your heavy users are heavy *every single month*.

---

## 6. Roadmap

One full-stack engineer. **S** = ≤1 week, **M** = 2–4 weeks, **L** = 1–2 months.

### Phase 1 — Sellable self-hosted product (target: 4–6 weeks)

| Item | Size | Why |
|---|---|---|
| **Execute the §2 cut list** (`PRODUCT_OVERVIEW.md`) — remove recraft, flux-2-pro, p-image-lora, PDF export, LoRA ZIP, and the now-dead params/deps | S | Do this first: everything below is cheaper against a smaller surface, and it's what makes the product legible |
| Retire the Coloring Book branding; rename repo, README, and UI to the pipeline positioning | S | You cannot sell "Coloring Book Generator" to a TikTok creator |
| Remove `admin`/`admin` default; force credential setup on first boot | S | Cannot ship a product with default creds |
| Persist auth tokens (signed JWT or file-backed) | S | Sessions currently die on every restart |
| Lock CORS to a configured origin; drop query-param token auth | S | Both trivial fixes, both real holes |
| **Retry with backoff on Replicate failures; don't abort the run on one failed step** | S | A failed step currently kills an entire scheduled run — the worst bug for unattended use, which is the whole value proposition |
| Licence-key check on boot | S | The thing you're actually selling |
| One-command install + non-developer setup guide | M | For a non-technical buyer this *is* the product; skimping kills conversion |
| Re-enable safety filters, with a documented self-host override | S | You're shipping to strangers now |
| Landing page + Stripe/Gumroad checkout | S | |

### Phase 2 — Hosted SaaS (target: 4–6 months)

| Item | Size | Notes |
|---|---|---|
| Postgres + migrations; port all JSON storage | L | Foundational; blocks everything else |
| Real accounts: signup, email verification, reset, sessions | M | |
| Workspace/tenant model; scope every asset, job, and workflow | L | Touches nearly every file. Much cheaper *after* Postgres than before |
| **Cost ledger** — record model, params, and computed cost on every generation | M | **Do this first among the money items.** It's the input to pricing, quotas, and margin monitoring, and useful the day it ships |
| Credits: balance, deduction, **pre-flight estimate**, hard stop at zero | M | The estimate before a long video run is a UX requirement, not a nicety |
| Stripe: subscriptions, top-ups, webhooks, dunning | M | |
| Object storage (S3/R2) + signed URLs; retire the public `/generated/` mount | M | Also fixes the unauthenticated-asset leak |
| Real job queue (Redis/RQ or Celery) with per-tenant concurrency | L | Removes the single-worker ceiling — the hard scaling blocker |
| Content moderation + abuse rate limiting | M | Non-negotiable before public signup |
| Product analytics + error tracking | S | You currently cannot answer basic usage questions |
| ToS, privacy policy, commercial-use licence terms | S | Legal review required |

### Phase 3 — Differentiation (post-revenue)

Ordered by expected impact on the primary segment:

1. **Direct publishing to TikTok / YouTube Shorts / Instagram Reels.** Completes prompt-to-published. This is what makes the product indispensable rather than convenient, and it's the strongest argument for hosted over self-hosted.
2. **Character/brand kits as a first-class object.** Today consistency is achievable but manual — pin `initial_image_ids`, pick the right preset. Make it a saved entity you attach to any workflow. This is the differentiator from §2; productise it properly.
3. **Template gallery.** Pre-built workflows per use case ("faceless quote video," "product ad from a white-background photo," "character explainer"). Collapses time-to-first-value, the main conversion risk for a tool this configurable. Also the cheapest way to test the e-commerce segment.
4. **Approval queue.** Review scheduled output before it publishes — the trust gate for anyone putting AI content on a real brand account.
5. **Bulk catalogue import** (CSV/Shopify) → per-product ad workflow. Unlocks the e-commerce segment at volume.
6. **Second inference provider** behind the existing `ImageModel` abstraction. Insurance against the risk below, and a margin lever.

---

## 7. Risks

| Risk | Severity | Assessment |
|---|---|---|
| **COGS exceeds revenue on scheduled workloads** | **High** | The defining risk. Scheduled generation accrues cost with no user present to feel it, and p-video's duration slider multiplies it. Mitigated only by credits, pre-flight estimates, hard stops, interval limits, and duration caps — all of which must ship *with* Phase 2, not after |
| **Total dependence on Replicate** | High | Single point of failure for pricing, availability, and deprecation. Three of the four core models are `prunaai/*` — a single publisher, and not a large one. The `ImageModel` abstraction makes a second provider tractable; add one before you're forced to |
| **Model deprecation churn** | Medium | Seven models across five vendors. A model vanishing silently breaks scheduled workflows for every user at once — and unattended means nobody notices for hours. Budget maintenance, and add health checks on model availability |
| **Commoditisation** | High | Crowded, well-funded category. Your defensible ground is *workflow chaining + scheduling + slot randomisation + consistency*, not any individual model — competitors have the same models. Lead with the pipeline and the consistency story |
| **Content moderation and platform ToS** | High | Safety filters are currently disabled on three of the remaining models. Public signup without moderation invites CSAM, deepfakes, and IP infringement — an existential legal risk, not a product risk |
| **Copyright and commercial-use rights** | Medium | Customers will monetize outputs on TikTok and in paid ads. You must state what rights you convey, which requires reading each upstream model's licence. Legal review before promising commercial use |
| **Single-worker throughput** | Medium | ~12 generations/minute deployment-wide, and one 30-second video blocks everyone. Hard blocker for Phase 2; irrelevant for Phase 1 |
| **Self-host cannibalises SaaS** | Low–Medium | Real but manageable — hosted-only features (publishing integrations, no key management, no ops) keep the tiers distinct |

---

## 8. Metrics to instrument

**None of these are currently measurable.** The cost ledger and analytics items in Phase 2 exist to make this section possible; until they ship you are flying blind.

**Activation** — signup → first generation; signup → **first scheduled workflow** (the leading indicator of retention — watch this hardest); signup → first *completed four-step pipeline run*
**Engagement** — generations/user/week; workflow runs/week; ratio of scheduled to manual generations; assets downloaded as the proxy for *realised* value
**Monetization** — free→paid conversion; ARPU by segment; credit utilisation (chronic under-use predicts churn, chronic over-use signals an upgrade); top-up frequency
**Unit economics** — COGS/user/month; gross margin by tier; **margin of the 95th-percentile user by tier** (the tail is where scheduled workloads hurt); average p-video duration by tier
**Retention** — 30/90-day logo and revenue retention; churn split by whether the user ever created a scheduled workflow
**Reliability** — generation success rate by model; **workflow run completion rate** (the number that matters most for an unattended product); p50/p95 time-to-first-asset

---

## 9. Open questions for the owner

1. **Which segment leads?** Recommendation: faceless short-form creators, with e-commerce validated close behind — they share the whole pipeline and cost only a template pack and a landing page to test. This sets the name, the landing page, and the next three months.
2. **Is Phase 0 acceptable?** Spending 4–8 weeks selling output before selling software delays software revenue but de-risks everything after. Needs the owner's time, not just the engineer's.
3. **What is the actual monthly Replicate spend today, for what output volume?** §5 is blocked on this.
4. **Do we open-source the core?** Open-core (free self-host, paid hosted + publishing integrations) builds distribution fast at the cost of Phase 1 licence revenue. Genuinely arguable both ways; decide before the licence work starts.
5. **Team size and budget?** Phase 2 as scoped is 4–6 months for one engineer. A second engineer roughly halves the calendar on the Postgres/tenancy/queue critical path.
6. **Legal support?** ToS, commercial-use rights, and moderation policy are Phase 2 blockers a PM cannot resolve alone.

---

## 10. Recommendation in one paragraph

Rename the product around what it became — an unattended production line for short-form social video, generate → edit → animate → caption — and lead the pitch with character and style consistency, because that is the complaint competitors don't answer. Start selling output immediately to learn the unit economics the app cannot tell you. In parallel, spend 4–6 weeks executing the cut list and hardening what remains into a self-hosted, bring-your-own-key licensed product, because that monetizes the code as it stands without solving multi-tenancy, billing, or cost control. Use that revenue and those customers to justify the 4–6 month hosted SaaS build, and on that build treat the cost ledger as the first deliverable rather than the last — every pricing, packaging, and margin decision in this document is blocked until the product knows what it spends.
