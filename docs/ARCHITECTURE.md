# Growth Intelligence — Architecture

A **business-agnostic** agentic system that finds customers on Instagram,
works out what problems they have, creates content and targeted campaigns
around those problems, and learns from the results.

Any business is an input. Each one is a profile folder:

```
businesses/<slug>/icp.json     who the customers are, how to find them, which problems they have, how to score them
businesses/<slug>/brand.json   the only facts content and outreach may use (value props, offer, proof, voice)
```

Create a profile with `/onboard-business <slug> <website or description>`.
`businesses/tutorsala/` is a worked example (tutors, coaching centres and academies).

| Building block | Source | Role |
| --- | --- | --- |
| `instagram-search` | [vrajdesai78/instagram-skill](https://github.com/vrajdesai78/instagram-skill) | **Eyes.** Read-only Instagram research through your own signed-in Chrome: hashtags, keyword search, locations, profiles, posts, comments. |
| `ig-*` (13) | [Jakeschincariol/instagram-agent-skill](https://github.com/Jakeschincariol/instagram-agent-skill) | **Voice.** Draft-only content: weekly plan, Reels with scored hooks and timed beats, captions linted against the 125-character cut, carousels, Stories, DMs, replies, and a humanizer with local scripts. |
| Neon Postgres | `.env` → `DATABASE_URL` | **Memory.** Businesses, leads, challenges, campaigns, status history, learnings. |
| CampaignForge | [gengirish/social-media-agency](https://github.com/gengirish/social-media-agency) · [live](https://campaignforge.intelliforge.tech) | **Backbone (Phase 2).** Multi-tenant LangGraph pipeline, human review gate, post queue, moderation, publishing, analytics. |

---

## 1. The five stages

| Stage | What it does | Agents | Output |
| --- | --- | --- | --- |
| **1 Instagram Search** | Find the target businesses | `lead-scout` → `lead-qualifier` (+ `scripts/leads.py` scoring) | Scored A/B/C leads with reasons |
| **2 Lead Analysis** | Identify each lead's likely operational challenges, with evidence | `insights-miner` (market level) → `lead-analyst` (per lead) | `primary_challenge` + evidence per lead; market pains brief |
| **3 Content Generation** | Content that addresses those challenges | `content-strategist` | Reels, carousels, posts, all reviewed |
| **4 Campaign Generation** | One targeted campaign per challenge group | `campaign-builder` (drives `content-strategist` + `outreach-writer`) | Campaign briefs, outreach sequences, CampaignForge briefs |
| **5 Feedback Loop** | Learn from replies and results, improve the next cycle | `feedback-analyst` (+ `leads.py stats`) | Learnings + proposed ICP, challenge and messaging edits |

```
              ┌────────────────────────── businesses/<slug>/ (icp.json, brand.json) ──────────────────────────┐
              ▼                                                                                              │
 1 SEARCH                2 ANALYSIS                 3 CONTENT  ◄──┐       4 CAMPAIGNS                         │
 lead-scout ──► lead-  ──► insights-miner ──► lead-  ──────────────┼──► campaign-builder ──► outreach-writer  │
 (hashtags,     qualifier  (market pains)     analyst              │    (group by challenge)  (drafts; a      │
  search,       (profiles,                    (per-lead challenge, └── content-strategist      person sends)  │
  locations)    score A/B/C)                   evidence)                                          │           │
                                                                                                   ▼           │
                                         5 FEEDBACK  ◄──  status + reply notes (leads.py status)  ◄─ replies   │
                                         feedback-analyst ── proposed edits (person approves) ──────────────────┘
```

The orchestrator is `/growth-cycle <slug>`. It runs Feedback first, so every cycle
starts from what the last one learned.

---

## 2. The key constraint: where Instagram access runs

`instagram-search` calls Instagram's private web API from inside **your own
signed-in browser tab** (Claude-in-Chrome MCP). So:

* It runs **locally**, not on a server, and not at scale.
* It is **read-only**. Nothing in this system posts, follows, likes or DMs. Outreach is
  drafted, and a person sends it.
* Browser agents (scout, qualifier, miner, analyst) share one tab and run **one at a time**.

Content, campaign and feedback agents need no browser and can run anywhere,
including inside CampaignForge later.

```
 LOCAL (Claude Code + Chrome)                         CLOUD
 ┌────────────────────────────────────┐   db.py sync  ┌──────────────────┐   Phase 2   ┌───────────────────────────┐
 │ agents + skills + data/<slug>/*.json│─────────────►│ Neon Postgres    │◄───────────►│ CampaignForge             │
 └────────────────────────────────────┘               │ (multi-business) │             │ Clients · Queue · Publish │
                                                      └──────────────────┘             └───────────────────────────┘
```

---

## 3. Business profile (the generic input)

`icp.json`

| Key | Purpose |
| --- | --- |
| `business`, `slug`, `target_customer` | Identity |
| `lead_kind` | `business_accounts` (B2B) or `partners` (for B2C businesses: creators, complementary businesses, communities. Never private individuals) |
| `segments` | `{segment: [keywords]}` used for fit scoring and for labelling |
| `discovery` | hashtags, keyword searches, cities, daily profile-lookup cap |
| `size_band` | follower min / sweet spot / max |
| `buying_signals` | phrases that show they need the product now |
| `exclusions` | competitor/big-brand usernames, junk bio terms |
| `challenge_library` | the problems this business solves: `{id, name, signals, evidence_hint, value_prop_hint}` |
| `weights`, `tiers` | scoring weights and A/B cut-offs |

`brand.json` holds name, one-liner, audience, value props, proof points, offer, CTA,
voice, and content pillars. Any field starting with `NEED:` is unknown, and
agents write `[NEED: …]` instead of inventing it.

---

## 4. Lead scoring (`scripts/leads.py`)

| Component | Default max | Signal |
| --- | --- | --- |
| Fit | 35 | best-matching segment's keywords in name, bio, category or username (2 hits = full) |
| Size | 20 | full in the sweet spot, half elsewhere in range |
| Activity | 15 | last post ≤ 14 / 30 / 60 days |
| Engagement | 10 | (likes+comments)/followers, 3% = full |
| Buying signals | 20 | phrases in bio, link or recent captions (2 hits = full) |
| Multi-source bonus | +6 | found via several hashtags or searches |
| Disqualify (tier X) | — | private, excluded, too big or small, inactive > 180 days, do-not-contact |

Tier A ≥ 70, B ≥ 50, C below. Every score keeps its reasons. Statuses a person
sets (`contacted` onward) are never overwritten by re-scoring.

## 5. Lead analysis

`lead-analyst` checks each A/B lead against the `challenge_library` and records
`challenges: [{id, confidence: high|medium|low, evidence}]` and a
`primary_challenge`. Evidence must point to something checkable (a bio line, a
post shortcode, a repeated posting pattern). Challenges are never assigned from
segment alone. Recurring problems outside the library come back as
`new_challenges`, which is useful product input.

## 6. Campaigns

`campaign-builder` groups qualified leads by `primary_challenge` (≥ 5 leads per
campaign, max 3 per cycle). Each campaign has a **hypothesis** and KPI targets,
public content addressing the challenge, a 3-touch outreach sequence that points
to that content, and a CampaignForge brief. Lead statuses are recorded with
`--campaign <slug>`, so results are attributed to the campaign.

## 7. Feedback loop

Inputs: `leads.py stats` (reply, demo and win rates by segment, challenge, campaign,
tier), reply notes in lead history, campaign hypotheses, and real content metrics.
The analyst won't draw conclusions from fewer than 10 contacts in a group. It
proposes exact edits (weights, keywords, challenge entries, outreach lines,
content mix), and a person approves before anything changes.

---

## 8. Data

Local working store: `data/<slug>/` (git-ignored). `db.py sync` mirrors it to Neon.

| Table | Contents |
| --- | --- |
| `businesses` | slug, name, lead_kind, icp JSONB, brand JSONB |
| `leads` | profile fields, score, tier, reasons, status, challenges, primary_challenge, campaign, discovered_via, raw; unique per (business, platform, username) |
| `lead_events` | status changes with campaign and note (feedback history) |
| `content_items` | per business: week, format, pillar, hook, caption, review_status, CampaignForge post id |
| `campaigns` | per business: challenge, segment, status, brief JSONB |
| `learnings` | per business per week: stats JSONB + summary |

```
data/<slug>/
  raw/*.json                     scout + qualifier output
  leads.json, leads.csv          scored leads (source of truth locally)
  analysis/<week>.json           lead challenges
  content/insights-<week>.md     market pains
  content/<week>/                weekly content
  campaigns/<campaign>/          campaign.json, briefs, content/, outreach.md
  learnings/<week>.md            feedback output;  stats.json
  reports/<week>.md              cycle report
```

## 9. Guardrails

| Risk | Rule |
| --- | --- |
| Instagram account restriction | Skill rate limits (250–400 ms, ≤ 4 pages per call), ≤ 150 profile lookups per day per profile, stop after two 429s. Use a dedicated business account. |
| Spam / Meta ToS | No automated writes to Instagram. Drafts only, sent by a person, about 20 DMs a day max. |
| Personal data (India DPDP, GDPR) | Only public business or creator profiles. Commenters are used only in aggregate, never stored as leads. `do_not_contact` is permanent. |
| Made-up claims | Facts only from `brand.json`, otherwise `[NEED: …]`. Every draft passes `ig-human` and the fact check against `brand.json` (see CLAUDE.md). |
| Secrets | `.env` is git-ignored. Scripts never print `DATABASE_URL`. |

## 10. CampaignForge integration (Phase 2)

| Need | CampaignForge piece | Change |
| --- | --- | --- |
| One tenant per business profile | Clients | None. Create a Client per `<slug>`. |
| Campaign → content | Campaign pipeline + human review | None. Use `campaignforge-brief.md`. |
| Variants of a winner | Amplify | None |
| Approval before publish | Posts › Queue + moderation | None |
| Instagram publishing | not implemented | SocialBu MCP now; Meta Graph Content Publishing API later |
| Leads, challenges, campaigns-to-leads | not present | New Leads module, see `integrations/campaignforge/` |
| Ingest from the local agents | API-key auth middleware | `leads.py push` → `POST /api/v1/leads/bulk-upsert` |
| Cloud lead analysis and feedback | LangGraph + LLM router | Port lead-analyst, campaign-builder and feedback-analyst as a `lead_graph` with `interrupt_before=["human_review"]` |

## 11. Roadmap

| Phase | Scope |
| --- | --- |
| 1 Local MVP (now) | Profiles, 8 agents + orchestrator, scoring, Neon sync, manual sending |
| 2 Connect | Leads module in CampaignForge, briefs → campaigns, SocialBu scheduling |
| 3 Cloud agents | `lead_graph` in CampaignForge; only the browser steps stay local |
| 4 More sources | Google Maps / directory listings (Apify), LinkedIn for larger businesses; cross-source dedupe |
