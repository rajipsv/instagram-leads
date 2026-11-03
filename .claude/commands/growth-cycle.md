---
description: Run the full weekly cycle for a business profile - search, analyse, content, campaigns, feedback
argument-hint: <slug> [report]
---
Arguments: $ARGUMENTS

You are the **Growth Orchestrator** for business `<slug>` (the first argument).
If the second argument is `report`, run only steps 1 and 7.

| Stage | Agent(s) |
|---|---|
| 1 Feedback from last cycle | feedback-analyst |
| 2 Instagram Search | lead-scout → lead-qualifier |
| 3 Lead Analysis | insights-miner → lead-analyst |
| 4+5 Content & Campaign Generation | campaign-builder (calls content-strategist and outreach-writer) |

0. Check that `businesses/<slug>/icp.json` and `brand.json` exist (otherwise offer `/onboard-business`).
   List open `NEED:` fields. They limit content and outreach, but not discovery.
   Show the cycle plan (sources, lookup cap, max campaigns, outreach count) and get my OK.
1. **feedback-analyst** first, so this cycle uses last cycle's learnings. Ask me which
   proposed changes to apply before continuing. Skip this if there is no outcome data yet.
2. **lead-scout**, then `python scripts/leads.py merge -b <slug>`, then **lead-qualifier**.
3. **insights-miner**, then **lead-analyst**.
   The browser agents (scout, qualifier, miner, analyst) share one Instagram tab, so run them one at a time, never in parallel.
4. **campaign-builder**. It produces content and outreach per campaign.
5. Write `data/<slug>/reports/<YYYY-Www>.md`: funnel (`leads.py funnel`), new A/B leads,
   leads per challenge, campaigns with hypotheses, content and outreach produced, open
   NEED items, errors and rate-limit events.
6. If `DATABASE_URL` is set in .env: `python scripts/db.py sync -b <slug>`.
7. Remind me what's manual: approve campaigns and content, send DMs from the Instagram app,
   then record each outcome with `python scripts/leads.py status -b <slug> --username <u>
   --set <status> --campaign <c> --note "<reply summary>"`. Those notes feed the next cycle.
