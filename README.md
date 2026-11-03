# Growth Intelligence

An agentic AI system that, for **any business you give it**:

1. **Searches Instagram** for the businesses that could be its customers
2. **Analyses each lead** to find its likely operational challenges, with evidence
3. **Generates content** that addresses those challenges
4. **Builds targeted campaigns**, one per challenge group (content + outreach sequence)
5. **Learns from responses** and improves the next cycle

It is built on two Claude skills (`instagram-search` for reading Instagram, and
the `ig-*` skills from Jakeschincariol/instagram-agent-skill for writing content), stores data in Neon Postgres, and is
designed to plug into [CampaignForge](https://campaignforge.intelliforge.tech).
Full design: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Setup (once)

```bash
git clone https://github.com/rajipsv/instagram-leads
cd instagram-leads
cp .env.example .env              # then fill in DATABASE_URL (never commit .env)

# 1. Python deps (Postgres driver only)
pip install -r requirements.txt

# 2. Database: put your Neon connection string in .env (see .env.example), then
python scripts/db.py init
python scripts/db.py check
```

3. The skills are already in `.claude/skills/` (`instagram-search` from
   vrajdesai78/instagram-skill and the `ig-*` skills from
   Jakeschincariol/instagram-agent-skill). To refresh them, re-copy
   `skills/instagram-search` and `skills/ig-*` from those repos into `.claude/skills/`.
   Their licences are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
4. Install **Claude in Chrome**, pair it with Claude Code, and sign in to Instagram in
   that Chrome yourself (use a business account, not a personal one).

## Add a business

```
/onboard-business acme-dental https://acmedental.example
```
This writes `businesses/acme-dental/icp.json` (who to find, their challenges,
scoring) and `brand.json` (facts, offer, voice). Fill in every `NEED:` it leaves.
To start by hand instead, copy `businesses/_template/`.
`businesses/tutorsala/` is a complete example.

## Run a weekly cycle

```
/growth-cycle tutorsala
```
Or one stage at a time:

| Stage | Command |
| --- | --- |
| Instagram search | `/find-leads tutorsala` → `/qualify-leads tutorsala` |
| Lead analysis | `/mine-insights tutorsala` → `/analyze-leads tutorsala` |
| Content | `/content-plan tutorsala` |
| Campaigns | `/build-campaign tutorsala` (includes outreach drafts) |
| Feedback | `/feedback tutorsala` |

What a person does: approve campaigns and content, send DMs from the
Instagram app, then record each outcome so the feedback loop can learn:

```bash
python scripts/leads.py status -b tutorsala --username abc_classes --set replied \
    --campaign fee-reminders --note "asked about price for 2 branches"
python scripts/leads.py stats -b tutorsala
python scripts/db.py sync -b tutorsala
```

## Web app (installable PWA)

A dashboard for leads, challenges, campaigns, content approval and feedback. It reads and writes
the same Neon database. Design system: [web/design-system/](web/design-system/growth-intelligence/MASTER.md).

```bash
cd web
npm install
npm run build && npm start        # http://127.0.0.1:3100  (npm run dev for development)
```

- **Install it**: open the app in Chrome or Edge and click the install icon, or use "Add to Home Screen" on a phone.
  Pages you've opened stay readable offline. Changes need a connection.
- **Changes made in the app** (lead status, reply notes, approvals) are saved to Neon. Run
  `python scripts/db.py sync -b <slug>` before the agents' next cycle. It pulls those changes into `data/<slug>/` first.
- **Before hosting it online** (needed to install it on a phone), set `APP_PASSWORD` and `DATABASE_URL` in the host's
  environment. Without `APP_PASSWORD` the app has no lock.

## Layout

```
businesses/<slug>/        business profiles (the input). _template/ and tutorsala/ included
.claude/agents/           8 agents + the /growth-cycle orchestrator: lead-scout, lead-qualifier, insights-miner, lead-analyst,
                          content-strategist, campaign-builder, outreach-writer, feedback-analyst
.claude/commands/         slash commands, including /growth-cycle
scripts/leads.py          dedupe, scoring, status, stats (standard library only)
scripts/db.py             Neon sync
db/schema.sql             Postgres schema (multi-business)
schemas/                  lead + content JSON schemas
integrations/campaignforge/  proposed Leads module for CampaignForge
web/                      Next.js PWA dashboard
examples/                 sample raw data for testing the scorer
data/                     working data per business (git-ignored)
```

## Guardrails

Read-only on Instagram, so a person sends every message. Public business accounts only.
No invented facts (`[NEED: …]` instead). Rate limits come from the skill.
See [docs/ARCHITECTURE.md §9](docs/ARCHITECTURE.md#9-guardrails).
