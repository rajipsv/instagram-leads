-- Growth Intelligence schema (Postgres / Neon). Multi-business: every row belongs to a business.
-- Safe to re-run: python scripts/db.py init

CREATE TABLE IF NOT EXISTS businesses (
    id          BIGSERIAL PRIMARY KEY,
    slug        TEXT UNIQUE NOT NULL,
    name        TEXT NOT NULL,
    lead_kind   TEXT NOT NULL DEFAULT 'business_accounts',
    icp         JSONB NOT NULL DEFAULT '{}'::jsonb,
    brand       JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS leads (
    id                  BIGSERIAL PRIMARY KEY,
    business_id         BIGINT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    platform            TEXT NOT NULL DEFAULT 'instagram',
    username            TEXT NOT NULL,
    full_name           TEXT,
    profile_url         TEXT,
    bio                 TEXT,
    category            TEXT,
    external_url        TEXT,
    public_email        TEXT,
    followers           INTEGER,
    posts_count         INTEGER,
    is_private          BOOLEAN,
    is_business         BOOLEAN,
    city                TEXT,
    segment             TEXT,
    last_post_at        TIMESTAMPTZ,
    avg_engagement_rate DOUBLE PRECISION,
    score               DOUBLE PRECISION NOT NULL DEFAULT 0,
    tier                TEXT CHECK (tier IN ('A','B','C','X')),
    score_reasons       JSONB NOT NULL DEFAULT '[]'::jsonb,
    disqualified_reason TEXT,
    status              TEXT NOT NULL DEFAULT 'new'
                        CHECK (status IN ('new','qualified','contacted','replied','demo_booked','won','lost','do_not_contact')),
    notes               TEXT,
    discovered_via      JSONB NOT NULL DEFAULT '[]'::jsonb,
    raw                 JSONB NOT NULL DEFAULT '{}'::jsonb,
    first_seen_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (business_id, platform, username)
);
CREATE INDEX IF NOT EXISTS leads_business_tier_status ON leads (business_id, tier, status);

CREATE TABLE IF NOT EXISTS content_items (
    id                    TEXT NOT NULL,
    business_id           BIGINT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    week                  TEXT NOT NULL,
    publish_date          DATE,
    format                TEXT CHECK (format IN ('reel','carousel','post','story')),
    pillar                TEXT,
    hook                  TEXT,
    caption               TEXT,
    review_status         TEXT NOT NULL DEFAULT 'draft',
    campaignforge_post_id TEXT,
    body                  JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (business_id, id)
);

CREATE TABLE IF NOT EXISTS lead_events (
    id          BIGSERIAL PRIMARY KEY,
    lead_id     BIGINT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    from_status TEXT,
    to_status   TEXT NOT NULL,
    note        TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Lead analysis, campaigns and feedback loop
ALTER TABLE leads ADD COLUMN IF NOT EXISTS challenges        JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS primary_challenge TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS campaign          TEXT;
ALTER TABLE lead_events ADD COLUMN IF NOT EXISTS campaign    TEXT;

CREATE TABLE IF NOT EXISTS campaigns (
    business_id BIGINT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    slug        TEXT NOT NULL,
    name        TEXT NOT NULL,
    challenge   TEXT,
    segment     TEXT,
    status      TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','running','paused','done')),
    brief       JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (business_id, slug)
);

CREATE TABLE IF NOT EXISTS learnings (
    business_id BIGINT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    week        TEXT NOT NULL,
    stats       JSONB NOT NULL DEFAULT '{}'::jsonb,
    summary     TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (business_id, week)
);
