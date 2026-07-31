# Monetization Strategy

**Audience:** incoming Product Manager
**Mandate:** turn this repo into revenue
**Prerequisite reading:** [`PRODUCT_OVERVIEW.md`](./PRODUCT_OVERVIEW.md)

> **On numbers in this document.** Every dollar figure below is either a *decision framework* or an *illustrative example clearly marked as such*. No Replicate per-run price in this doc has been verified — the codebase contains no pricing data, and the app has never recorded cost. **Pull live per-model pricing from replicate.com and the owner's actual invoices before you commit to any price point.** Section 5 gives you the model to plug them into.

---

## 1. The core strategic finding

**The product you have is not the product the README describes.**

The repo is named for coloring books, but the last three months of commits — Workflows, scheduling, prompt slots, branching steps, video models, TikTok captions — built something else: **an unattended short-form content production line.** That is a larger market, a more painful problem, and a far better subscription business than coloring-book PDFs.

Your first strategic act should be to name that. The coloring-book capability doesn't disappear; it becomes one template inside a broader content-generation product.

**The second finding:** the thing standing between this repo and revenue is not features. It is that **the app has no concept of a second user, no concept of money, and no concept of what anything costs.** Every monetization path below is gated on the same three primitives — identity, metering, billing — and the sequencing question is entirely about how much of that you build before you charge anyone.

---

## 2. Market segments this could serve

Ranked by fit with what's already built.

### Tier 1 — Faceless short-form content creators ★ best fit

Operators running TikTok / Reels / Shorts channels that publish AI-generated content without appearing on camera. They publish daily or multiple times daily and their bottleneck is *volume of finished, captioned, vertical video.*

- **Why it fits:** the Workflows engine + z-image-turbo → p-video → tiktok-captions chain is precisely this pipeline, already working, already scheduled.
- **Willingness to pay:** high and proven. Incumbent tools in this category sit in the $20–$100/mo range.
- **What's missing for them:** direct publishing to TikTok/YouTube, a content calendar, and a way to review/approve before posting.

### Tier 2 — Low-content book publishers (Amazon KDP)

Sellers producing coloring books, activity books, and journals for Amazon KDP. The coloring-book cluster targets them directly, right down to the "easy for seniors" prompt engineering in `flux_2_pro.py`.

- **Why it fits:** text/photo → line art → print-ready PDF is the entire workflow, end to end.
- **Willingness to pay:** moderate. This audience is price-sensitive and heavily served by cheap tools.
- **What's missing:** KDP trim sizes (the PDF is hard-coded to US Letter, `pdf.py:33`), bleed and margin controls, cover generation, and page-count/interior compliance.

### Tier 3 — AI artists and LoRA trainers

The P-Image LoRA tab plus the captioned LoRA ZIP export forms a complete generate → curate → export → train → generate-with-your-LoRA loop. This is a real, underserved workflow.

- **Willingness to pay:** high per-user but a small market, and technically sophisticated buyers who will self-host rather than subscribe.
- **Best treated as:** a differentiating feature that wins Tier 1/2 power users, not a segment to build a business on.

### Tier 4 — Small agencies and social-media managers

Multi-client content production. Would need workspaces, brand kits, approval flows, and client-facing delivery — a materially bigger build. **Note this as the natural expansion after Tier 1 lands; do not target it now.**

---

## 3. Monetization models evaluated

| Model | Time to first revenue | Build cost | Ceiling | COGS risk |
|---|---|---|---|---|
| **A. Sell the outputs** (KDP books, run your own channels) | Days | None | Low, non-recurring | You bear it, but you control volume |
| **B. Self-hosted licence, bring-your-own Replicate key** | 4–6 weeks | Low | Moderate | **Zero — the customer pays Replicate directly** |
| **C. Hosted SaaS with credits** | 4–6 months | High | High | High — you own it and must price above it |
| **D. API / white-label for agencies** | 6+ months | High | High | High |

### Recommended sequence: **A → B → C**

Run them as overlapping phases rather than a strict waterfall.

**Phase 0 — Sell the outputs (start now, never stop).**
Use the tool as intended and sell what it produces: KDP coloring books, and one or two faceless channels driven by scheduled workflows. This is not a detour. It generates cash immediately, and more importantly it is the **only way to discover the real unit economics, the real failure modes, and the real feature gaps before you ask a stranger to pay.** Everything in Phases 1 and 2 is better-informed for having done it. Budget 4–8 weeks of the owner's time in parallel with Phase 1 engineering.

**Phase 1 — Self-hosted licence, BYO API key (the recommended first *software* revenue).**
Package the Docker Compose stack as a paid product. The customer supplies their own `REPLICATE_API_TOKEN`. You sell a licence key that unlocks it, plus updates and support.

This is the highest-leverage move available, because **it monetizes without solving multi-tenancy, billing infrastructure, credits, cost control, or abuse.** The three hardest problems in this repo all evaporate when the customer runs their own instance with their own key. You are shipping approximately what exists today, plus a licence check, a setup experience a non-developer can survive, and documentation.

- Suggested shape: **$149–$249 one-time**, or **$29/mo** for updates and support. Validate against a landing page before building.
- Honest constraint: the addressable buyer is technical enough to run Docker. That is a real ceiling, and it is why Phase 1 is a stepping stone rather than the destination.

**Phase 2 — Hosted SaaS with credits (the actual business).**
Once Phase 1 proves demand and Phase 0 proves the economics, build the real thing: signup, workspaces, credits, Stripe, object storage, a job queue, moderation. Section 6 sizes this.

**Do not start with Phase 2.** The gap list in `PRODUCT_OVERVIEW.md` §5 is a 4–6 month build for a small team, and you would be building it before knowing whether anyone pays.

---

## 4. Packaging and pricing (Phase 2)

### Why credits, not unlimited

COGS is per-generation and **highly variable by model** — a video generation can cost one to two orders of magnitude more than a fast image generation. An unlimited plan at any defensible price gets destroyed by a single heavy user chaining video workflows on a 15-minute schedule. Credits make cost visible to the user and align price with spend.

**Design the credit unit so that the cheapest image generation costs 1 credit,** then price every other model as a multiple of the underlying Replicate cost with your margin applied uniformly. Publish the multipliers. Users of tools like this expect and accept this model.

### Proposed tiers — *structure is the recommendation, prices are placeholders pending §5*

| | **Free** | **Creator** | **Studio** | **Agency** |
|---|---|---|---|---|
| Price/mo | $0 | ~$29 | ~$79 | ~$199 |
| Credits/mo | 50 | 1,500 | 5,000 | 15,000 |
| Image models | ✓ | ✓ | ✓ | ✓ |
| Video models | — | ✓ | ✓ | ✓ |
| Scheduled workflows | — | 3 | 15 | Unlimited |
| Min. schedule interval | — | 6 hours | 1 hour | 15 min |
| PDF export | Watermarked | ✓ | ✓ | ✓ |
| LoRA dataset export | — | — | ✓ | ✓ |
| Custom LoRA weights | — | — | ✓ | ✓ |
| Asset retention | 7 days | 90 days | 1 year | Unlimited |
| Seats | 1 | 1 | 3 | 10 |
| Commercial-use licence | — | ✓ | ✓ | ✓ |
| API access | — | — | — | ✓ |

**Feature-gating rationale:**
- **Video behind the paywall.** It is the expensive COGS and the highest-value output. Free users get images only — enough to feel the product, not enough to cost you.
- **Scheduled workflows are the retention hook.** A user with three live schedules is generating value while logged out; that is what makes churn hurt. Gate the *number* of workflows and the *minimum interval* — interval throttling doubles as infrastructure protection given the single-worker constraint.
- **LoRA export at Studio.** Small audience, high willingness to pay, genuinely differentiated.
- **Retention limits are a real cost lever.** Video files are large; unlimited storage on a $29 plan is a slow leak.
- **Credit top-ups** should be available on every paid tier — heavy users self-select into more revenue rather than churning at the cap.

### Annual and overage
Offer annual at ~2 months free (standard, improves cash position and LTV). Let credits roll over one month only, capped at the monthly allowance — generous enough to feel fair, bounded enough not to accumulate a liability.

---

## 5. Unit economics — the model to fill in

**This is the most important open work item.** You cannot price Phase 2 without it, and the app cannot tell you the answer because it has never recorded a cost.

### Cost per generation

```
cost_per_generation = replicate_price(model, params)
```

Build this table from live replicate.com pricing:

| Model | Billing basis | Price | Notes |
|---|---|---|---|
| `recraft-ai/recraft-v3-svg` | per image | ? | |
| `black-forest-labs/flux-2-pro` | per image | ? | |
| `black-forest-labs/flux-2-klein-9b` | per image | ? | ×N outputs, sequential calls |
| `prunaai/z-image-turbo` | per image | ? | Expected to be the cheapest — anchor 1 credit here |
| `google/nano-banana-2` | per image | ? | |
| `prunaai/p-image-lora` | per image | ? | |
| `prunaai/p-image-edit` | per image | ? | |
| `prunaai/p-video` | per second | ? | Duration 1–30s — **cost scales linearly with a user-controlled slider** |
| `xai/grok-imagine-video` | per second | ? | Capped at 8s |
| `shreejalmaharjan-27/tiktok-short-captions` | per run / compute-second | ? | |

### Cost per workflow run

```
run_cost = Σ over steps ( step.num_outputs × cost_per_generation(step.model, step.params) )
```

### Cost per user per month

```
monthly_cogs = ad_hoc_cost
             + Σ over enabled workflows ( runs_per_month × run_cost )

where runs_per_month = (30 × 24 × 60) / schedule_interval_minutes
```

**Run this calculation before you finish reading this document, for the worst legal case on your cheapest paid tier.** A Creator-tier user with 3 workflows at a 6-hour interval, each producing a 5-second video, generates 360 video runs/month. If a 5-second video costs even $0.20, that user costs you $72/month on a $29 plan. **The schedule-interval limit in the tier table is not a nicety — it is the primary margin control, and its value must be derived from this arithmetic, not chosen by feel.**

### Target
Gross margin ≥ 70% at the median user on each paid tier, with the *worst-case* user on that tier still gross-margin-positive. If the worst case is negative, tighten the interval limit or move the model to a higher tier — do not rely on averages, because scheduled workloads mean your heavy users are heavy *every single month*.

---

## 6. Roadmap

Effort estimates assume one full-stack engineer. **S** = ≤1 week, **M** = 2–4 weeks, **L** = 1–2 months.

### Phase 1 — Sellable self-hosted product (target: 4–6 weeks)

| Item | Size | Why |
|---|---|---|
| Remove `admin`/`admin` default; force credential setup on first boot | S | Cannot ship a product with default creds |
| Persist auth tokens (signed JWT or file-backed) | S | Sessions currently die on every restart |
| Lock CORS to a configured origin; drop query-param token auth | S | Both are trivial fixes, both are real holes |
| Licence-key check on boot | S | The thing you're actually selling |
| One-command install + non-developer setup guide | M | This *is* the product for a non-technical buyer; skimping here kills conversion |
| Re-enable safety filters, with a documented self-host override | S | You are shipping to strangers now |
| Basic retry with backoff on Replicate failures | S | A failed step currently kills an entire scheduled run — the single worst reliability bug for unattended use |
| Landing page + Stripe/Gumroad checkout | S | |

### Phase 2 — Hosted SaaS (target: 4–6 months)

| Item | Size | Notes |
|---|---|---|
| Postgres + migrations; port all JSON storage | L | Foundational; blocks everything else |
| Real accounts: signup, email verification, reset, sessions | M | |
| Workspace/tenant model; scope every asset, job, and workflow to a tenant | L | Touches nearly every file. Doing this *after* Postgres is much cheaper than before |
| **Cost ledger** — record model, params, and computed cost on every generation | M | **Do this first among the money items.** It's the input to pricing, quotas, and margin monitoring, and it's independently useful the day it ships |
| Credits: balance, deduction, pre-flight estimate, hard stop at zero | M | Pre-flight estimate before expensive video runs is a UX requirement, not a nicety |
| Stripe: subscriptions, top-ups, webhooks, dunning | M | |
| Object storage (S3/R2) + signed URLs; retire the public `/generated/` mount | M | Also fixes the unauthenticated-asset leak |
| Real job queue (Redis/RQ or Celery) with per-tenant concurrency | L | Removes the single-worker ceiling — the hard scaling blocker |
| Content moderation + abuse rate limiting | M | Non-negotiable before public signup |
| Product analytics + error tracking | S | You currently cannot answer basic questions about usage |
| ToS, privacy policy, commercial-use licence terms | S | Legal review required |

### Phase 3 — Differentiation (post-revenue)

Ordered by expected impact on the Tier 1 segment:

1. **Direct publishing to TikTok / YouTube Shorts / Instagram Reels.** Completes the loop from prompt to published post. This is the feature that makes the product indispensable rather than convenient, and it is the strongest argument for the hosted version over self-hosted.
2. **Template gallery.** Pre-built workflows ("faceless quote video," "product ad," "KDP coloring book set"). Collapses time-to-first-value, which is the main conversion risk for a tool this configurable.
3. **KDP-compliant PDF export.** Trim sizes, bleed, margins, cover generation. Unlocks Tier 2 properly.
4. **Approval queue.** Review scheduled output before it publishes — the trust gate for anyone putting AI content on a real brand account.
5. **Managed LoRA training**, not just dataset export. Natural extension of an existing loop; high-margin.
6. **Brand kits** (fonts, palettes, logo overlays) — the entry point to Tier 4 agencies.

---

## 7. Risks

| Risk | Severity | Assessment |
|---|---|---|
| **COGS exceeds revenue on scheduled workloads** | **High** | The defining risk of this product. Scheduled generation means costs accrue with no user present to feel them. Mitigated only by credits, pre-flight estimates, hard stops, and interval limits — all of which must ship *with* Phase 2, not after |
| **Total dependence on Replicate** | High | Single point of failure for pricing, availability, and model deprecation. The `ImageModel` abstraction makes a second provider tractable; add one before you're forced to. Also note several models are hobbyist-published and could vanish without notice |
| **Model deprecation churn** | Medium | Ten models across seven vendors. Budget ongoing maintenance; a model disappearing silently breaks scheduled workflows for every user at once |
| **Commoditisation** | High | The category is crowded and well-funded. Your defensible ground is the *workflow chaining + scheduling + slot randomisation* combination, not any individual model — competitors have the same models. Lead with the pipeline |
| **Content moderation and platform ToS** | High | Safety filters are currently disabled in four models. Public signup without moderation invites CSAM, deepfakes, and IP infringement — an existential legal risk, not a product risk |
| **Copyright and commercial-use rights** | Medium | Your customers will monetize outputs on Amazon and TikTok. You must state clearly what rights you convey, and that requires reading each upstream model's licence. Get legal review before promising commercial use |
| **Single-worker throughput** | Medium | ~12 generations/minute for the entire deployment, and one long video blocks everyone. Hard blocker for Phase 2; irrelevant for Phase 1 |
| **Self-host cannibalises SaaS** | Low–Medium | Real but manageable — hosted-only features (publishing integrations, no key management, no ops) keep the tiers distinct |

---

## 8. Metrics to instrument

**None of these are currently measurable.** The cost ledger and analytics items in Phase 2 exist to make this section possible; until they ship you are flying blind.

**Activation** — signup → first generation; signup → **first scheduled workflow** (the leading indicator of retention, watch this one hardest)
**Engagement** — generations/user/week; workflow runs/week; ratio of scheduled to manual generations; assets exported (PDF/ZIP/download) as the proxy for *realised* value
**Monetization** — free→paid conversion; ARPU; credit utilisation rate (chronic under-use predicts churn; chronic over-use signals a tier upgrade); top-up frequency
**Unit economics** — COGS/user/month; gross margin by tier; **margin of the 95th-percentile user by tier** (the tail is where scheduled workloads hurt)
**Retention** — 30/90-day logo and revenue retention; churn segmented by whether the user ever created a scheduled workflow
**Reliability** — generation success rate by model; workflow run completion rate; p50/p95 time-to-first-asset

---

## 9. Open questions for the owner

1. **Which segment do we lead with?** The recommendation is faceless short-form creators (Tier 1). This determines the name, the landing page, and the next three months of roadmap.
2. **Is Phase 0 acceptable?** Spending 4–8 weeks selling outputs before selling software delays software revenue but de-risks everything after it. Requires the owner's time, not just the engineer's.
3. **What is the actual monthly Replicate spend today, and for what output volume?** Section 5 is blocked on this.
4. **Do we open-source the core?** An open-core play (free self-host, paid hosted + publishing integrations) would build distribution fast, at the cost of some Phase 1 licence revenue. Genuinely arguable in both directions; needs a decision before the licence work starts.
5. **Team size and budget?** Phase 2 as scoped is 4–6 months for one engineer. Two engineers roughly halves the calendar on the Postgres/tenancy/queue track, which is the critical path.
6. **Do we have legal support?** ToS, commercial-use rights, and moderation policy are Phase 2 blockers that a PM cannot resolve alone.

---

## 10. Recommendation in one paragraph

Rename the product around what it actually became — an unattended short-form content pipeline, not a coloring-book generator. Start selling its output immediately to learn the unit economics the app cannot tell you. In parallel, spend 4–6 weeks hardening the existing stack into a self-hosted, bring-your-own-key licensed product, because that monetizes the code as it stands without solving multi-tenancy, billing, or cost control. Use that revenue and those customers to justify the 4–6 month hosted SaaS build, and on that build treat the cost ledger as the first deliverable, not the last — every pricing, packaging, and margin decision in this document is blocked until the product knows what it spends.
