---
description: Find N new qualified leads for a business today (default 10), never repeating a known account
argument-hint: <slug> [count]
---
Arguments: $ARGUMENTS

Daily lead run for business `<slug>` (first argument). Target = second argument, else
`icp.discovery.daily.new_leads_target` (default 10). Read `icp.discovery.daily` for all limits.

1. **Pre-check.** If `data/<slug>/daily/<YYYY-MM-DD>.md` already exists, stop: today is done.
   Run `python scripts/leads.py known -b <slug> --file data/<slug>/daily/known.txt`.
   These accounts are never looked up or reported again, whatever their tier or status.
2. **Pick today's sources (rotate).** Read `data/<slug>/daily/rotation.json` (create it if
   missing: `{"hashtag_index": 0, "keyword_index": 0}`). Take the next `hashtags_per_day`
   hashtags and `keyword_searches_per_day` keyword searches from `icp.discovery`, wrapping
   round the list, and save the advanced indexes at the end of the run.
3. **lead-scout** with these overrides: only today's sources; skip every username in
   `known.txt`; wait `delay_ms_between_calls` (random within the range) between calls; at most
   `max_search_calls` calls; on a 429 wait `backoff_on_429_s`, and stop after
   `stop_after_429s_in_a_row`. Stop early once it has about 3x the target in new candidates.
4. `python scripts/leads.py merge -b <slug>`.
5. **Website check, not Instagram profile lookups** (user priority since 2026-11-03: follower
   counts are not needed). For today's new candidates only (`first_seen_at` = today, not in
   `known.txt`), search Google / the open web (WebSearch, or the Apify web tools; never the
   Instagram tab) for each centre's own website and any management system (student/parent
   login, portal, app, Classplus, Teachmint and similar). Directory listings (Justdial,
   UrbanPro, Google Maps, Facebook, Linktree) are not a website. Write
   `data/<slug>/raw/websites-<YYYYMMDD-HHMM>.json` with `username`, `website_checked: true`,
   `external_url` (own site only, when sure), `website_signals`, `city`, `notes` (source URL),
   then `python scripts/leads.py merge -b <slug>`. The script scores; leads with no website or
   system rank highest and leads using a system are disqualified. The Instagram-based
   **lead-qualifier** runs only if the user asks for follower data.
6. Write `data/<slug>/daily/<YYYY-MM-DD>.md`: today's new A/B leads
   (`python scripts/leads.py list -b <slug> --since <YYYY-MM-DD>` filtered to A/B), each with
   handle, profile link, tier, score, website status (none / own site / uses a system) and the
   one-line reason, no-website leads first. Below it: sources used, search calls, web searches,
   429s, and whether the target was reached. If fewer than the target were
   found, say so plainly. Do not pad the list with C-tier leads.
7. **Always save to the database** so the leads show in the web UI:
   `python scripts/db.py sync -b <slug>`. Do this even if the run stopped early (429s, fewer
   than the target), so whatever was found is saved. If it fails, say so in the report and in
   the daily file; never print `DATABASE_URL`.

Read-only on Instagram, as always. No analysis, content or outreach in this command.
