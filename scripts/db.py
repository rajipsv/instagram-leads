#!/usr/bin/env python3
"""Sync Growth Intelligence data to Postgres (Neon). Needs DATABASE_URL in .env.

  pip install -r requirements.txt
  python scripts/db.py check                         # test the connection, show row counts
  python scripts/db.py init                          # create tables (safe to re-run)
  python scripts/db.py upsert-business -b tutorsala  # store businesses/<slug>/icp.json + brand.json
  python scripts/db.py pull -b tutorsala             # bring web-UI decisions (statuses, approvals) into data/<slug>/
  python scripts/db.py sync -b tutorsala             # pull, then push leads, content, campaigns, learnings
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime
from pathlib import Path

from _env import ROOT, load_env

LEAD_COLS = ["full_name", "profile_url", "bio", "category", "external_url", "public_email", "followers",
             "posts_count", "is_private", "is_business", "city", "segment", "last_post_at",
             "avg_engagement_rate", "score", "tier", "disqualified_reason", "status", "notes",
             "primary_challenge", "campaign"]
JSON_COLS = ["score_reasons", "discovered_via", "challenges"]


def connect():
    load_env()
    url = os.environ.get("DATABASE_URL")
    if not url:
        sys.exit("DATABASE_URL is empty. Paste your Neon connection string into .env.")
    try:
        import psycopg
    except ImportError:
        sys.exit("Missing driver: pip install -r requirements.txt")
    return psycopg.connect(url, connect_timeout=15)


def business_id(cur, slug: str) -> int:
    cur.execute("SELECT id FROM businesses WHERE slug = %s", (slug,))
    row = cur.fetchone()
    if not row:
        sys.exit(f"Business '{slug}' not in database. Run: python scripts/db.py upsert-business -b {slug}")
    return row[0]


def cmd_check(a):
    with connect() as conn, conn.cursor() as cur:
        cur.execute("SELECT version()")
        print(cur.fetchone()[0].split(",")[0])
        cur.execute("SELECT to_regclass('public.leads') IS NOT NULL")
        if not cur.fetchone()[0]:
            print("Connected. Tables not created yet. Run: python scripts/db.py init")
            return
        cur.execute("""SELECT b.slug, count(l.id), count(l.id) FILTER (WHERE l.tier='A')
                       FROM businesses b LEFT JOIN leads l ON l.business_id=b.id GROUP BY b.slug ORDER BY b.slug""")
        for slug, n, a_ in cur.fetchall():
            print(f"{slug}: {n} leads ({a_} A-tier)")


def cmd_init(a):
    sql = (ROOT / "db" / "schema.sql").read_text(encoding="utf-8")
    with connect() as conn:
        conn.execute(sql)
    print("Schema ready.")


def cmd_upsert_business(a):
    biz = ROOT / "businesses" / a.business
    icp = json.loads((biz / "icp.json").read_text(encoding="utf-8"))
    brand = json.loads((biz / "brand.json").read_text(encoding="utf-8"))
    with connect() as conn:
        conn.execute("""INSERT INTO businesses (slug, name, lead_kind, icp, brand) VALUES (%s,%s,%s,%s,%s)
                        ON CONFLICT (slug) DO UPDATE SET name=EXCLUDED.name, lead_kind=EXCLUDED.lead_kind,
                        icp=EXCLUDED.icp, brand=EXCLUDED.brand, updated_at=now()""",
                     (a.business, icp.get("business", a.business), icp.get("lead_kind", "business_accounts"),
                      json.dumps(icp), json.dumps(brand)))
    print(f"Business '{a.business}' saved.")


HUMAN_CONTENT = {"approved", "rejected", "scheduled", "published"}
HUMAN_CAMPAIGN = {"approved", "running", "paused", "done"}


def _same_time(iso: str, dt) -> bool:
    try:
        return datetime.fromisoformat(iso.replace("Z", "+00:00")) == dt
    except (ValueError, TypeError):
        return False


def cmd_pull(a):
    """Bring decisions made in the web UI (lead status, content and campaign approvals) into data/<slug>/."""
    data = ROOT / "data" / a.business
    with connect() as conn, conn.cursor() as cur:
        bid = business_id(cur, a.business)
        cur.execute("""SELECT l.username, e.from_status, e.to_status, e.note, e.campaign, e.created_at
                       FROM lead_events e JOIN leads l ON l.id = e.lead_id
                       WHERE l.business_id = %s ORDER BY e.created_at""", (bid,))
        events = cur.fetchall()
        cur.execute("SELECT id, review_status FROM content_items WHERE business_id = %s", (bid,))
        content = dict(cur.fetchall())
        cur.execute("SELECT slug, status FROM campaigns WHERE business_id = %s", (bid,))
        camps = dict(cur.fetchall())

    added = 0
    lp = data / "leads.json"
    if lp.exists():
        leads = {l["username"]: l for l in json.loads(lp.read_text(encoding="utf-8"))}
        for username, frm, to, note, campaign, at in events:
            lead = leads.get(username)
            if not lead:
                continue
            hist = lead.setdefault("history", [])
            if any(h.get("to") == to and _same_time(h.get("at", ""), at) for h in hist):
                continue
            hist.append({"at": at.isoformat(), "from": frm, "to": to, "campaign": campaign, "note": note})
            if note:
                lead["notes"] = ((lead.get("notes") or "") + f"\n[{at.date()}] {note}").strip()
            added += 1
        # Only rewrite leads.json when the database had something new, so a sync never
        # clobbers a file an agent is writing at the same time.
        if added:
            for lead in leads.values():
                hist = lead.get("history") or []
                if hist:
                    hist.sort(key=lambda h: datetime.fromisoformat(h["at"].replace("Z", "+00:00")))
                    lead["status"] = hist[-1]["to"]
                    if hist[-1].get("campaign"):
                        lead["campaign"] = hist[-1]["campaign"]
            rows = sorted(leads.values(), key=lambda l: (-l.get("score", 0), l["username"]))
            lp.write_text(json.dumps(rows, indent=2, ensure_ascii=False), encoding="utf-8")

    changed = 0
    for f in sorted((data / "content").glob("*/items.json")) if (data / "content").exists() else []:
        items = json.loads(f.read_text(encoding="utf-8"))
        before = changed
        for i in items:
            db_status = content.get(i.get("id"))
            if db_status in HUMAN_CONTENT and db_status != i.get("review_status"):
                i["review_status"] = db_status
                changed += 1
        if changed > before:
            f.write_text(json.dumps(items, indent=2, ensure_ascii=False), encoding="utf-8")
    for f in sorted((data / "campaigns").glob("*/campaign.json")) if (data / "campaigns").exists() else []:
        c = json.loads(f.read_text(encoding="utf-8"))
        db_status = camps.get(c.get("slug", f.parent.name))
        if db_status in HUMAN_CAMPAIGN and db_status != c.get("status"):
            c["status"] = db_status
            changed += 1
            f.write_text(json.dumps(c, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Pulled {added} status changes and {changed} approvals from the database for '{a.business}'.")


def cmd_sync(a):
    cmd_pull(a)  # never overwrite decisions made in the web UI
    data = ROOT / "data" / a.business
    leads = json.loads((data / "leads.json").read_text(encoding="utf-8")) if (data / "leads.json").exists() else []
    items = []
    for f in sorted((data / "content").glob("*/items.json")) if (data / "content").exists() else []:
        week = f.parent.name
        items += [{**i, "week": i.get("week", week)} for i in json.loads(f.read_text(encoding="utf-8"))]

    cols = ["business_id", "platform", "username", *LEAD_COLS, *JSON_COLS, "raw"]
    placeholders = ",".join(["%s"] * len(cols))
    updates = ",".join(f"{c}=EXCLUDED.{c}" for c in [*LEAD_COLS, *JSON_COLS, "raw"])
    events = 0
    with connect() as conn, conn.cursor() as cur:
        bid = business_id(cur, a.business)
        for l in leads:
            vals = [bid, l.get("platform", "instagram"), l["username"], *[l.get(c) for c in LEAD_COLS],
                    *[json.dumps(l.get(c, [])) for c in JSON_COLS], json.dumps(l)]
            cur.execute(f"""INSERT INTO leads ({','.join(cols)}) VALUES ({placeholders})
                            ON CONFLICT (business_id, platform, username) DO UPDATE SET {updates}, updated_at=now()
                            RETURNING id""", vals)
            lead_id = cur.fetchone()[0]
            # Every status change recorded by `leads.py status` is in l["history"]; insert the ones not yet stored.
            for h in l.get("history", []):
                cur.execute("""INSERT INTO lead_events (lead_id, from_status, to_status, note, campaign, created_at)
                               SELECT %s,%s,%s,%s,%s,%s WHERE NOT EXISTS (
                                 SELECT 1 FROM lead_events WHERE lead_id=%s AND to_status=%s AND created_at=%s)""",
                            (lead_id, h.get("from"), h["to"], h.get("note"), h.get("campaign"), h["at"],
                             lead_id, h["to"], h["at"]))
                events += cur.rowcount
        for i in items:
            cur.execute("""INSERT INTO content_items (id, business_id, week, publish_date, format, pillar, hook, caption,
                           review_status, campaignforge_post_id, body) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                           ON CONFLICT (business_id, id) DO UPDATE SET week=EXCLUDED.week, publish_date=EXCLUDED.publish_date,
                           format=EXCLUDED.format, pillar=EXCLUDED.pillar, hook=EXCLUDED.hook, caption=EXCLUDED.caption,
                           review_status=EXCLUDED.review_status, campaignforge_post_id=EXCLUDED.campaignforge_post_id,
                           body=EXCLUDED.body, updated_at=now()""",
                        (i["id"], bid, i["week"], i.get("publish_date"), i.get("format"), i.get("pillar"), i.get("hook"),
                         i.get("caption"), i.get("review_status", "draft"), i.get("campaignforge_post_id"), json.dumps(i)))
        campaigns = sorted((data / "campaigns").glob("*/campaign.json")) if (data / "campaigns").exists() else []
        for f in campaigns:
            c = json.loads(f.read_text(encoding="utf-8"))
            cur.execute("""INSERT INTO campaigns (business_id, slug, name, challenge, segment, status, brief)
                           VALUES (%s,%s,%s,%s,%s,%s,%s) ON CONFLICT (business_id, slug) DO UPDATE SET name=EXCLUDED.name,
                           challenge=EXCLUDED.challenge, segment=EXCLUDED.segment, status=EXCLUDED.status,
                           brief=EXCLUDED.brief, updated_at=now()""",
                        (bid, c.get("slug", f.parent.name), c.get("name", f.parent.name), c.get("challenge"),
                         c.get("segment"), c.get("status", "draft"), json.dumps(c)))
        learnings = sorted((data / "learnings").glob("*.md")) if (data / "learnings").exists() else []
        stats = (data / "stats.json").read_text(encoding="utf-8") if (data / "stats.json").exists() else "{}"
        for f in learnings:
            cur.execute("""INSERT INTO learnings (business_id, week, stats, summary) VALUES (%s,%s,%s,%s)
                           ON CONFLICT (business_id, week) DO UPDATE SET summary=EXCLUDED.summary""",
                        (bid, f.stem, stats, f.read_text(encoding="utf-8")))
    print(f"Synced {len(leads)} leads ({events} status changes logged), {len(items)} content items, "
          f"{len(campaigns)} campaigns, {len(learnings)} learnings for '{a.business}'.")


def main():
    load_env()
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("command", choices=["check", "init", "upsert-business", "pull", "sync"])
    ap.add_argument("--business", "-b", default=os.environ.get("DEFAULT_BUSINESS"))
    a = ap.parse_args()
    if a.command in ("upsert-business", "pull", "sync") and not a.business:
        sys.exit("Pass -b <slug> or set DEFAULT_BUSINESS in .env")
    globals()[f"cmd_{a.command.replace('-', '_')}"](a)


if __name__ == "__main__":
    main()
