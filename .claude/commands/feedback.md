---
description: Learn from outreach replies and content results; propose ICP, challenge and campaign changes
argument-hint: <slug>
---
Business slug: $ARGUMENTS

Use the **feedback-analyst** subagent. Show the scoreboard and the proposed changes as a
numbered list. Ask me which to apply. For approved edits, edit businesses/<slug>/icp.json, run
`python scripts/leads.py rescore -b <slug>`, and, if DATABASE_URL is set, `python scripts/db.py sync -b <slug>`.
