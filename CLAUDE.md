# Growth Intelligence

Generic agentic lead + content system on Instagram. Any business is an input:
`businesses/<slug>/icp.json` + `brand.json`. Design: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Commands (all take the business slug first)
`/onboard-business <slug> <url|description>` · `/growth-cycle <slug>` ·
`/daily-leads <slug> [count]` (N new leads a day, never repeats a known account) ·
`/find-leads` · `/qualify-leads` · `/mine-insights` · `/analyze-leads` ·
`/content-plan` · `/build-campaign` · `/outreach` · `/feedback`

## Rules for every agent
- **Instagram is read-only.** Never post, comment, like, follow or DM. Outreach is drafted for a person to send.
- Run browser agents (lead-scout, lead-qualifier, insights-miner, lead-analyst) one at a time. They share one Chrome tab.
- Respect the instagram-search rate limits and `discovery.max_profile_lookups_per_day`. Stop after two 429s in a row.
- Leads are public business or creator accounts only. Never store commenters or private individuals.
- Facts come only from `brand.json`. Unknown → `[NEED: …]`. Never invent metrics, testimonials or results.
- Scoring is done by `scripts/leads.py`, not by hand. Change weights only in `icp.json`, and only after the user approves.
- Never print or log `DATABASE_URL` or API keys from `.env`.
- Data lives in `data/<slug>/` (git-ignored). The web UI reads Neon, so **every command that
  writes to `data/<slug>/` ends with `python scripts/db.py sync -b <slug>`**. Run the sync only
  after all agents for that slug have finished writing (one sync at a time).

## Scripts
- `python scripts/leads.py {merge|rescore|list [--since DATE]|known|status|annotate|stats|export|funnel|push} -b <slug>`
- `python scripts/db.py {check|init|upsert-business|sync} -b <slug>`

## Required skills
Both are installed in `.claude/skills/`.

- **Search:** `instagram-search` (vrajdesai78/instagram-skill) + Claude in Chrome, signed in to Instagram.
  Used by lead-scout, lead-qualifier, insights-miner and lead-analyst.
- **Content:** the `ig-*` skills (Jakeschincariol/instagram-agent-skill):
  `ig-plan`, `ig-reel`, `ig-carousel`, `ig-caption`, `ig-story`, `ig-human`, `ig-dm`,
  `ig-reply`, `ig-comment`, `ig-repurpose`, `ig-profile`, `ig-audit`, `ig-viral`.
  Run their scripts with `python` (not `python3`) from the skill folder, for example
  `python .claude/skills/ig-reel/hookscore.py hooks.txt`.

## Using the ig-* skills in a multi-business system
- The skills read `~/.claude/instagram/{voice,swipe,log,plan}.md`. Do not use that shared
  folder. Use `businesses/<slug>/voice.md` (built from `brand.json` with the template in
  `.claude/instagram-templates/voice.md`) and `data/<slug>/ig/{swipe,log,plan}.md`.
- Never put a number or proof in `voice.md` that is not in `brand.json`.
- `{{your number}}` placeholders from the skills count as `[NEED: …]`.
- Every caption, script, DM and reply goes through `ig-human` before it is shown.
- **Fact check (last step, replaces samalyxx safety-review):** list every claim, number,
  offer, price and result in the draft, check each against `brand.json`, and turn any
  that are missing into `[NEED: …]`. Then set `review_status: "safety_passed"`.
- `ig-viral` and `ig-comment` stay read-only and draft-only: no posting, liking or
  commenting from the browser, and `ig-viral` follows the instagram-search rate limits.
