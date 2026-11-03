import "server-only";
import { notFound } from "next/navigation";
import { sql } from "./db";
import type { AgentRun, Business, Campaign, ContentItem, Lead, LeadEvent, LeadStatus, Learning, Tier } from "./types";

const REACHED: LeadStatus[] = ["contacted", "replied", "demo_booked", "won", "lost"];
const REPLIED: LeadStatus[] = ["replied", "demo_booked", "won"];

export async function listBusinesses() {
  return (await sql()`
    SELECT b.id, b.slug, b.name, b.lead_kind, b.icp, b.brand, b.updated_at,
      count(l.id)::int AS leads,
      count(l.id) FILTER (WHERE l.tier = 'A')::int AS a_tier,
      count(l.id) FILTER (WHERE l.status = ANY(${REACHED}))::int AS contacted,
      count(l.id) FILTER (WHERE l.status = ANY(${REPLIED}))::int AS replied
    FROM businesses b LEFT JOIN leads l ON l.business_id = b.id
    GROUP BY b.id ORDER BY b.name`) as (Business & { leads: number; a_tier: number; contacted: number; replied: number })[];
}

export async function getBusiness(slug: string): Promise<Business> {
  const rows = (await sql()`SELECT id, slug, name, lead_kind, icp, brand, updated_at FROM businesses WHERE slug = ${slug}`) as Business[];
  if (!rows[0]) notFound();
  return rows[0];
}

/** Brand fields still marked NEED: … (facts agents are not allowed to invent). */
export function openNeeds(brand: Record<string, unknown>): { field: string; text: string }[] {
  const out: { field: string; text: string }[] = [];
  const walk = (v: unknown, field: string) => {
    if (typeof v === "string" && v.trim().startsWith("NEED")) out.push({ field, text: v.replace(/^NEED:?\s*/, "") });
    else if (Array.isArray(v)) v.forEach((x) => walk(x, field));
    else if (v && typeof v === "object") Object.entries(v).forEach(([k, x]) => walk(x, `${field}.${k}`));
  };
  Object.entries(brand).forEach(([k, v]) => { if (!k.startsWith("_")) walk(v, k); });
  return out;
}

export async function overview(businessId: string) {
  const db = sql();
  const [counts, byChallenge, weekly, events, stages] = await Promise.all([
    db`SELECT
         count(*) FILTER (WHERE tier <> 'X')::int AS found,
         count(*) FILTER (WHERE tier IN ('A','B'))::int AS qualified,
         count(*) FILTER (WHERE tier = 'A')::int AS a_tier,
         count(*) FILTER (WHERE status = ANY(${REACHED}))::int AS contacted,
         count(*) FILTER (WHERE status = ANY(${REPLIED}))::int AS replied,
         count(*) FILTER (WHERE status IN ('demo_booked','won'))::int AS demos,
         count(*) FILTER (WHERE status = 'won')::int AS won
       FROM leads WHERE business_id = ${businessId}`,
    db`SELECT coalesce(primary_challenge, 'unanalysed') AS challenge, count(*)::int AS leads
       FROM leads WHERE business_id = ${businessId} AND tier IN ('A','B')
       GROUP BY 1 ORDER BY 2 DESC LIMIT 8`,
    db`WITH weeks AS (
         SELECT generate_series(date_trunc('week', now()) - interval '7 weeks', date_trunc('week', now()), interval '1 week') AS wk)
       SELECT to_char(w.wk, 'DD Mon') AS week,
         (SELECT count(*) FROM leads l WHERE l.business_id = ${businessId} AND date_trunc('week', l.first_seen_at) = w.wk)::int AS found,
         (SELECT count(*) FROM lead_events e JOIN leads l ON l.id = e.lead_id
            WHERE l.business_id = ${businessId} AND e.to_status = 'contacted' AND date_trunc('week', e.created_at) = w.wk)::int AS contacted,
         (SELECT count(*) FROM lead_events e JOIN leads l ON l.id = e.lead_id
            WHERE l.business_id = ${businessId} AND e.to_status = 'replied' AND date_trunc('week', e.created_at) = w.wk)::int AS replied
       FROM weeks w ORDER BY w.wk`,
    db`SELECT e.id, l.username, e.from_status, e.to_status, e.note, e.campaign, e.created_at
       FROM lead_events e JOIN leads l ON l.id = e.lead_id
       WHERE l.business_id = ${businessId} ORDER BY e.created_at DESC LIMIT 8`,
    db`SELECT
         (SELECT count(*) FROM leads WHERE business_id = ${businessId})::int AS leads,
         (SELECT count(*) FROM leads WHERE business_id = ${businessId} AND primary_challenge IS NOT NULL)::int AS analysed,
         (SELECT count(*) FROM content_items WHERE business_id = ${businessId})::int AS content,
         (SELECT count(*) FROM campaigns WHERE business_id = ${businessId})::int AS campaigns,
         (SELECT count(*) FROM learnings WHERE business_id = ${businessId})::int AS learnings`,
  ]);
  return {
    counts: counts[0] as Record<"found" | "qualified" | "a_tier" | "contacted" | "replied" | "demos" | "won", number>,
    byChallenge: byChallenge as { challenge: string; leads: number }[],
    weekly: weekly as { week: string; found: number; contacted: number; replied: number }[],
    events: events as LeadEvent[],
    stages: stages[0] as Record<"leads" | "analysed" | "content" | "campaigns" | "learnings", number>,
  };
}

export interface LeadFilters { tier?: string; status?: string; challenge?: string; campaign?: string; q?: string }

export async function listLeads(businessId: string, f: LeadFilters) {
  const q = f.q ? `%${f.q.toLowerCase()}%` : null;
  return (await sql()`
    SELECT id, username, full_name, profile_url, bio, category, external_url, public_email, followers, city, segment,
      last_post_at, avg_engagement_rate, score, tier, score_reasons, disqualified_reason, status, notes,
      challenges, primary_challenge, campaign, discovered_via, raw, updated_at
    FROM leads
    WHERE business_id = ${businessId}
      AND (${f.tier ?? null}::text IS NULL OR tier = ${f.tier ?? null})
      AND (${f.status ?? null}::text IS NULL OR status = ${f.status ?? null})
      AND (${f.challenge ?? null}::text IS NULL OR primary_challenge = ${f.challenge ?? null})
      AND (${f.campaign ?? null}::text IS NULL OR campaign = ${f.campaign ?? null})
      AND (${q}::text IS NULL OR lower(username || ' ' || coalesce(full_name,'') || ' ' || coalesce(bio,'')) LIKE ${q})
    ORDER BY (tier = 'X'), score DESC, username
    LIMIT 300`) as Lead[];
}

export async function leadHistory(businessId: string, username: string) {
  return (await sql()`
    SELECT e.id, l.username, e.from_status, e.to_status, e.note, e.campaign, e.created_at
    FROM lead_events e JOIN leads l ON l.id = e.lead_id
    WHERE l.business_id = ${businessId} AND l.username = ${username}
    ORDER BY e.created_at DESC`) as LeadEvent[];
}

export async function listCampaigns(businessId: string) {
  return (await sql()`
    SELECT c.slug, c.name, c.challenge, c.segment, c.status, c.brief, c.updated_at,
      count(l.id)::int AS leads,
      count(l.id) FILTER (WHERE l.status = ANY(${REACHED}))::int AS contacted,
      count(l.id) FILTER (WHERE l.status = ANY(${REPLIED}))::int AS replied,
      count(l.id) FILTER (WHERE l.status IN ('demo_booked','won'))::int AS demos
    FROM campaigns c LEFT JOIN leads l ON l.business_id = c.business_id AND l.campaign = c.slug
    WHERE c.business_id = ${businessId}
    GROUP BY c.business_id, c.slug ORDER BY c.updated_at DESC`) as (Campaign & {
      leads: number; contacted: number; replied: number; demos: number;
    })[];
}

export async function listContent(businessId: string, status?: string) {
  return (await sql()`
    SELECT id, week, publish_date, format, pillar, hook, caption, review_status, body
    FROM content_items
    WHERE business_id = ${businessId} AND (${status ?? null}::text IS NULL OR review_status = ${status ?? null})
    ORDER BY week DESC, publish_date NULLS LAST, id`) as ContentItem[];
}

export type Dim = "segment" | "primary_challenge" | "campaign" | "tier";

export async function outcomeStats(businessId: string) {
  const rows = (await sql()`
    SELECT segment, primary_challenge, campaign, tier, status FROM leads
    WHERE business_id = ${businessId} AND status = ANY(${REACHED})`) as
    { segment: string | null; primary_challenge: string | null; campaign: string | null; tier: Tier | null; status: LeadStatus }[];
  const dims: Dim[] = ["primary_challenge", "campaign", "segment", "tier"];
  const out = {} as Record<Dim, { key: string; contacted: number; replied: number; demos: number; won: number }[]>;
  for (const d of dims) {
    const m = new Map<string, { key: string; contacted: number; replied: number; demos: number; won: number }>();
    for (const r of rows) {
      const key = (r[d] as string | null) ?? "(none)";
      const g = m.get(key) ?? { key, contacted: 0, replied: 0, demos: 0, won: 0 };
      g.contacted++;
      if (REPLIED.includes(r.status)) g.replied++;
      if (r.status === "demo_booked" || r.status === "won") g.demos++;
      if (r.status === "won") g.won++;
      m.set(key, g);
    }
    out[d] = [...m.values()].sort((a, b) => b.contacted - a.contacted);
  }
  return { total: rows.length, byDim: out };
}

export async function listLearnings(businessId: string) {
  return (await sql()`SELECT week, summary, created_at FROM learnings WHERE business_id = ${businessId} ORDER BY week DESC`) as Learning[];
}

/** Latest agent runs for the "Run daily leads" card, plus whether the PC runner checked in recently. */
export async function runState(businessId: string) {
  const db = sql();
  const [runRows, beatRows] = await Promise.all([
    db`SELECT id::text, command, count, status, summary, requested_at, started_at, finished_at
       FROM agent_runs WHERE business_id = ${businessId} ORDER BY requested_at DESC LIMIT 5`,
    db`SELECT seen_at, host FROM runner_heartbeat WHERE id = 1`,
  ]);
  const runs = runRows as AgentRun[];
  const beat = beatRows as { seen_at: string; host: string | null }[];
  const seen = beat[0]?.seen_at ? new Date(beat[0].seen_at) : null;
  const busy = runs.some((r) => r.status === "running");
  return { runs, runnerSeenAt: seen?.toISOString() ?? null, runnerOnline: busy || (!!seen && Date.now() - seen.getTime() < 2 * 60_000) };
}
