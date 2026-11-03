-- Proposed CampaignForge migration: Leads module.
-- Rename to db/migrations/<YYMMDD>_leads_module.sql, mirror it in db/init.sql and models/tables.py,
-- and run it by hand on Neon (CampaignForge convention: forward-only, not Alembic).
-- TODO: check the tenant and client key types against CampaignForge's real tables before running.

CREATE TABLE IF NOT EXISTS leads (
    id                  BIGSERIAL PRIMARY KEY,
    workspace_id        UUID   NOT NULL,             -- tenant isolation
    client_id           UUID   NOT NULL,             -- CampaignForge Client = Growth Intelligence business slug
    platform            TEXT   NOT NULL DEFAULT 'instagram',
    username            TEXT   NOT NULL,
    full_name           TEXT,
    profile_url         TEXT,
    bio                 TEXT,
    followers           INTEGER,
    segment             TEXT,
    city                TEXT,
    score               DOUBLE PRECISION NOT NULL DEFAULT 0,
    tier                TEXT CHECK (tier IN ('A','B','C','X')),
    score_reasons       JSONB NOT NULL DEFAULT '[]'::jsonb,
    challenges          JSONB NOT NULL DEFAULT '[]'::jsonb,
    primary_challenge   TEXT,
    campaign_id         UUID,
    status              TEXT NOT NULL DEFAULT 'new'
                        CHECK (status IN ('new','qualified','contacted','replied','demo_booked','won','lost','do_not_contact')),
    owner_user_id       TEXT,
    notes               TEXT,
    raw                 JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (client_id, platform, username)
);
CREATE INDEX IF NOT EXISTS leads_ws_client_tier_status ON leads (workspace_id, client_id, tier, status);

CREATE TABLE IF NOT EXISTS lead_events (
    id          BIGSERIAL PRIMARY KEY,
    lead_id     BIGINT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    from_status TEXT,
    to_status   TEXT NOT NULL,
    campaign_id UUID,
    note        TEXT,
    actor       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS outreach_drafts (
    id          BIGSERIAL PRIMARY KEY,
    lead_id     BIGINT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    campaign_id UUID,
    step        SMALLINT NOT NULL DEFAULT 1,         -- 1 first DM, 2 follow-up, 3 value drop
    channel     TEXT NOT NULL DEFAULT 'instagram_dm',
    body        TEXT NOT NULL,
    moderation  JSONB,
    status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','sent_manually','skipped')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
