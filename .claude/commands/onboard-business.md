---
description: Create a new business profile (ICP + brand) from a website URL or a short description
argument-hint: <slug> <website-url or "description">
---
Create a Growth Intelligence profile for a new business. Arguments: $ARGUMENTS
(the first word is the slug, the rest is a website URL or a description).

1. If `businesses/<slug>/` already exists, show its current files and ask before overwriting.
2. Gather facts. With a URL, read the homepage plus pricing/about/features pages
   (firecrawl-scrape skill, or WebFetch). With a description, use only that.
3. Copy `businesses/_template/` to `businesses/<slug>/` and fill in:
   - `brand.json`: name, one-liner, audience, value props, offer, CTA, voice,
     pillars, **only from facts you found**. Anything not found stays `NEED: …`.
   - `icp.json`: who their customers are on Instagram. Propose segments with 4–8
     keywords each, 8–10 hashtags, 2–4 keyword searches, buying-signal phrases,
     exclusions (competitors and big brands you found), and a size band that fits the market.
   - `icp.json` → `challenge_library`: 4–8 operational problems the customers have
     **that this business solves**. Each has caption/bio `signals`, what a post showing
     it looks like, and the matching value prop. This drives Lead Analysis and campaigns.
4. Check `lead_kind`. Instagram lead discovery is for **business or creator
   accounts**. If the business sells to individual consumers (B2C), set
   `lead_kind` to `"partners"` and aim the ICP at partner accounts (creators,
   complementary businesses, communities) instead of private individuals, and explain why.
5. Show a short summary: target customer, segments, top hashtags, every
   remaining `NEED`. Ask the user to confirm or edit before the first `/growth-cycle <slug>`.
6. If `DATABASE_URL` is set in `.env`, run `python scripts/db.py upsert-business -b <slug>`.
