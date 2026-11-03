"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { sql } from "./db";
import { CAMPAIGN_STATUSES, CONTENT_STATUSES, STATUSES } from "./types";

export type ActionState = { ok: boolean; message: string } | null;

const slug = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/);

const leadStatusSchema = z.object({
  business: slug,
  username: z.string().min(1).max(64),
  status: z.enum(STATUSES),
  campaign: z.string().max(64).optional().transform((v) => (v ? v : null)),
  note: z.string().max(1000).optional().transform((v) => (v ? v.trim() : null)),
});

/** Records a status change the same way `leads.py status` does: updates the lead and appends a lead_event. */
export async function updateLeadStatus(_prev: ActionState, form: FormData): Promise<ActionState> {
  const parsed = leadStatusSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, message: "Check the status and note, then try again." };
  const { business, username, status, campaign, note } = parsed.data;
  if (status === "do_not_contact" && !note) return { ok: false, message: "Add a note saying why this lead must not be contacted." };
  const db = sql();
  const rows = (await db`
    SELECT l.id, l.status, l.campaign FROM leads l JOIN businesses b ON b.id = l.business_id
    WHERE b.slug = ${business} AND l.username = ${username}`) as { id: string; status: string; campaign: string | null }[];
  const lead = rows[0];
  if (!lead) return { ok: false, message: "Lead not found. It may have been removed by a sync." };
  const camp = campaign ?? lead.campaign;
  const stamp = new Date().toISOString().slice(0, 10);
  await db.transaction([
    db`UPDATE leads SET status = ${status}, campaign = ${camp},
         notes = CASE WHEN ${note}::text IS NULL THEN notes ELSE trim(coalesce(notes, '') || E'\n[' || ${stamp} || '] ' || ${note}) END,
         disqualified_reason = CASE
           WHEN ${status} = 'do_not_contact' THEN 'do not contact: ' || ${note}::text
           WHEN disqualified_reason LIKE 'do not contact%' THEN NULL
           ELSE disqualified_reason END,
         tier = CASE WHEN ${status} = 'do_not_contact' THEN 'X' ELSE tier END,
         score = CASE WHEN ${status} = 'do_not_contact' THEN 0 ELSE score END,
         updated_at = now()
       WHERE id = ${lead.id}`,
    db`INSERT INTO lead_events (lead_id, from_status, to_status, note, campaign) VALUES (${lead.id}, ${lead.status}, ${status}, ${note}, ${camp})`,
  ]);
  revalidatePath(`/b/${business}`, "layout");
  return { ok: true, message: `@${username} is now ${status.replace("_", " ")}.` };
}

const contentSchema = z.object({ business: slug, id: z.string().min(1).max(128), status: z.enum(CONTENT_STATUSES) });

export async function setContentStatus(form: FormData) {
  const p = contentSchema.parse(Object.fromEntries(form));
  await sql()`
    UPDATE content_items c SET review_status = ${p.status}, updated_at = now()
    FROM businesses b WHERE b.id = c.business_id AND b.slug = ${p.business} AND c.id = ${p.id}`;
  revalidatePath(`/b/${p.business}`, "layout");
}

const campaignSchema = z.object({ business: slug, campaign: z.string().min(1).max(64), status: z.enum(CAMPAIGN_STATUSES) });

export async function setCampaignStatus(form: FormData) {
  const p = campaignSchema.parse(Object.fromEntries(form));
  await sql()`
    UPDATE campaigns c SET status = ${p.status}, updated_at = now()
    FROM businesses b WHERE b.id = c.business_id AND b.slug = ${p.business} AND c.slug = ${p.campaign}`;
  revalidatePath(`/b/${p.business}`, "layout");
}

const runSchema = z.object({ business: slug, count: z.coerce.number().int().min(1).max(30) });

/** Queues a daily-leads run. The PC runner (scripts/runner.py) picks it up; this only writes a row. */
export async function requestDailyLeads(_prev: ActionState, form: FormData): Promise<ActionState> {
  const parsed = runSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, message: "Pick between 1 and 30 leads." };
  const { business, count } = parsed.data;
  const db = sql();
  const rows = (await db`
    INSERT INTO agent_runs (business_id, command, count)
    SELECT b.id, 'daily-leads', ${count} FROM businesses b
    WHERE b.slug = ${business}
      AND NOT EXISTS (SELECT 1 FROM agent_runs r WHERE r.business_id = b.id AND r.command = 'daily-leads'
                      AND r.status IN ('queued', 'running'))
    RETURNING id`) as { id: string }[];
  revalidatePath(`/b/${business}`);
  if (!rows.length) return { ok: false, message: "A daily-leads run is already queued or running." };
  return { ok: true, message: "Queued. Your PC runner will start it within a minute." };
}

/** Cancels a run that has not started yet. */
export async function cancelRun(_prev: ActionState, form: FormData): Promise<ActionState> {
  const parsed = z.object({ business: slug, id: z.string().regex(/^\d+$/) }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, message: "Could not cancel." };
  const { business, id } = parsed.data;
  await sql()`UPDATE agent_runs r SET status = 'cancelled', finished_at = now() FROM businesses b
              WHERE r.id = ${id} AND r.status = 'queued' AND b.id = r.business_id AND b.slug = ${business}`;
  revalidatePath(`/b/${business}`);
  return { ok: true, message: "Cancelled." };
}
