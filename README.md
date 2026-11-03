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
  environment. Without `APP_PASSWORD` the app has no lock locally, and refuses to serve on Vercel.

### "Run daily leads" button (PC runner)

The overview page has a **Run daily leads** button, and it works from the Vercel site too. The button only queues a job
in Neon (`agent_runs`). A small runner on your PC picks it up, runs `/daily-leads <slug> <count>` with Claude Code in
headless mode, syncs to Neon and posts the result back to the page. Daily leads needs Claude Code and Chrome signed in
to Instagram, which only exist on your PC, so it can't run on Vercel.

```powershell
powershell -ExecutionPolicy Bypass -File scripts/install_runner.ps1           # start the runner at every Windows login
python scripts/runner.py --once --dry-run                                     # test the setup (no Instagram)
powershell -ExecutionPolicy Bypass -File scripts/install_runner.ps1 -Remove   # uninstall
```

Before pressing the button, keep the PC on, with Chrome open and signed in to Instagram in another tab. The page shows
whether the runner is online. Its log is in `data/runner.log`, and each run's full output is in
`data/<slug>/daily/runs/`. Headless Claude can only use the project's scripts, files under `data/`, web search, Chrome
and Apify (see `ALLOWED_TOOLS` in `scripts/runner.py`). If the database already exists, run `python scripts/db.py init`
once to add the new tables.

### Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Frajipsv%2Finstagram-leads&root-directory=web&env=DATABASE_URL,APP_PASSWORD&envDescription=Neon%20connection%20string%20and%20a%20password%20for%20the%20dashboard)

Or by hand:

1. In Vercel, **Add New → Project** and import this repo.
2. Set **Root Directory** to `web` (the framework is detected as Next.js).
3. Add environment variables `DATABASE_URL` (your Neon connection string) and `APP_PASSWORD`.
4. Deploy.

From the CLI instead: `cd web && vercel link && vercel env add DATABASE_URL && vercel env add APP_PASSWORD && vercel --prod`.

Notes:
- `web/vercel.json` runs the functions in `cle1` (Cleveland), next to a Neon database in AWS `us-east-2`.
  Change the region if your Neon project is elsewhere.
- The agents and Python scripts still run on your computer. They share the same Neon database with the hosted app,
  so run `python scripts/db.py sync -b <slug>` to move changes both ways.

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
