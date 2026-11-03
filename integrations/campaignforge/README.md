# CampaignForge integration (Phase 2 proposal)

Growth Intelligence produces leads, lead challenges, campaigns and content.
CampaignForge already has clients, a campaign pipeline, human review, a post
queue, moderation, publishing and analytics. This folder proposes the missing
piece, a **Leads module**.

| File | Goes to (in social-media-agency) |
| --- | --- |
| `migrations/YYMMDD_leads_module.sql` | `db/migrations/<YYMMDD>_leads_module.sql` + mirror in `db/init.sql` + `models/tables.py` |
| `leads_router.py` | `backend/src/agency/routers/leads.py` (register in `main.py`) |

Both are sketches. The tenant and client key types and the dependency functions
are marked `TODO`, because only the repo README could be read from this machine.
Check them against the code before merging.

## Mapping

- Business profile `<slug>` → CampaignForge **Client** with the same slug (copy the
  voice and avoid-list from `brand.json` into the client's brand settings).
- `campaigns/<c>/campaignforge-brief.md` → a CampaignForge **Campaign** (Brief →
  Strategy∥SEO → Content∥Ads → Human Review → QA). Approved posts land in **Posts › Queue**.
- Outreach drafts → `outreach_drafts`, moderated like posts, sent **manually**.
- `python scripts/leads.py push -b <slug>` → `POST /api/v1/leads/bulk-upsert` with a workspace API key.
- UI: a **Leads** tab with tier/status filters, challenge evidence, and the funnel.

## Phase 3

Port `lead-analyst`, `campaign-builder` and `feedback-analyst` into a LangGraph
`lead_graph` (`analyze → group → build_campaigns → human_review → manual send →
feedback`), compiled with `interrupt_before=["human_review"]` like the campaign
graph. Only the Instagram-browser steps stay local.
