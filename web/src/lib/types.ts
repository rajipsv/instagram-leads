export const STATUSES = [
  "new", "qualified", "contacted", "replied", "demo_booked", "won", "lost", "do_not_contact",
] as const;
export type LeadStatus = (typeof STATUSES)[number];
export type Tier = "A" | "B" | "C" | "X";

export const STATUS_LABEL: Record<LeadStatus, string> = {
  new: "New", qualified: "Qualified", contacted: "Contacted", replied: "Replied",
  demo_booked: "Demo booked", won: "Won", lost: "Lost", do_not_contact: "Do not contact",
};

export const CONTENT_STATUSES = ["draft", "safety_passed", "approved", "scheduled", "published", "rejected"] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

export const CAMPAIGN_STATUSES = ["draft", "approved", "running", "paused", "done"] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export interface Challenge {
  id: string;
  name: string;
  signals?: string[];
  evidence_hint?: string;
  value_prop_hint?: string;
}

export interface Icp {
  business?: string;
  target_customer?: string;
  lead_kind?: string;
  segments?: Record<string, string[]>;
  discovery?: { hashtags?: string[]; keyword_searches?: string[]; cities?: string[]; max_profile_lookups_per_day?: number };
  size_band?: Record<string, number>;
  buying_signals?: string[];
  exclusions?: { usernames?: string[]; bio_terms?: string[] };
  challenge_library?: Challenge[];
  weights?: Record<string, number>;
  tiers?: Record<string, number>;
}

export type Brand = Record<string, unknown>;

export interface Business {
  id: string;
  slug: string;
  name: string;
  lead_kind: string;
  icp: Icp;
  brand: Brand;
  updated_at: string;
}

export interface LeadChallenge { id: string; confidence: "high" | "medium" | "low"; evidence: string }

export interface Lead {
  id: string;
  username: string;
  full_name: string | null;
  profile_url: string | null;
  bio: string | null;
  category: string | null;
  external_url: string | null;
  public_email: string | null;
  followers: number | null;
  city: string | null;
  segment: string | null;
  last_post_at: string | null;
  avg_engagement_rate: number | null;
  score: number;
  tier: Tier | null;
  score_reasons: string[];
  disqualified_reason: string | null;
  status: LeadStatus;
  notes: string | null;
  challenges: LeadChallenge[];
  primary_challenge: string | null;
  campaign: string | null;
  discovered_via: { type: string; value: string }[];
  raw: { recent_posts?: { shortcode?: string; caption?: string; likes?: number; comments?: number; taken_at?: string }[] };
  updated_at: string;
}

export interface LeadEvent {
  id: string;
  username: string;
  from_status: string | null;
  to_status: LeadStatus;
  note: string | null;
  campaign: string | null;
  created_at: string;
}

export interface Campaign {
  slug: string;
  name: string;
  challenge: string | null;
  segment: string | null;
  status: CampaignStatus;
  brief: {
    goal?: string; audience?: string; key_message?: string; offer?: string; cta?: string; hypothesis?: string;
    kpis?: { reply_rate_target?: number; demo_target?: number }; lead_usernames?: string[];
  };
  updated_at: string;
}

export interface ContentItem {
  id: string;
  week: string;
  publish_date: string | null;
  format: "reel" | "carousel" | "post" | "story" | null;
  pillar: string | null;
  hook: string | null;
  caption: string | null;
  review_status: ContentStatus;
  body: { hashtags?: string[]; cta?: string; visual_brief?: string; script_or_slides?: string[]; needs?: string[]; source_insight?: string };
}

export interface Learning { week: string; summary: string | null; created_at: string }

export const RUN_STATUSES = ["queued", "running", "done", "failed", "cancelled"] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];
export interface AgentRun {
  id: string;
  command: string;
  count: number;
  status: RunStatus;
  summary: string | null;
  requested_at: string;
  started_at: string | null;
  finished_at: string | null;
}
