#!/usr/bin/env python3
"""Lead store and scorer for Growth Intelligence. Standard library only.

Every command takes --business <slug>, which points to businesses/<slug>/icp.json
and stores data under data/<slug>/.

  python scripts/leads.py merge   --business tutorsala            # data/<slug>/raw/*.json -> leads.json (dedupe + score)
  python scripts/leads.py rescore --business tutorsala            # re-score after editing icp.json
  python scripts/leads.py list    --business tutorsala --tier A
  python scripts/leads.py status  --business tutorsala --username abc_classes --set contacted --campaign fee-chasing --note "DM 1"
  python scripts/leads.py annotate --business tutorsala --file data/tutorsala/analysis/2026-W45.json   # store lead challenges
  python scripts/leads.py stats   --business tutorsala            # reply/demo/win rates by segment, challenge, campaign (feedback loop)
  python scripts/leads.py export  --business tutorsala            # leads.csv
  python scripts/leads.py funnel  --business tutorsala
  python scripts/leads.py push    --business tutorsala            # POST to CampaignForge (needs CF_API_URL, CF_API_KEY)
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import re
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from _env import load_env

ROOT = Path(__file__).resolve().parent.parent
STATUSES = ["new", "qualified", "contacted", "replied", "demo_booked", "won", "lost", "do_not_contact"]
# Statuses set by a person; merge/rescore must never overwrite them.
HUMAN_STATUSES = set(STATUSES) - {"new", "qualified"}


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def paths(slug: str) -> dict[str, Path]:
    biz = ROOT / "businesses" / slug
    if not (biz / "icp.json").exists():
        sys.exit(f"No profile at {biz}/icp.json. Run /onboard-business or copy businesses/_template.")
    data = ROOT / "data" / slug
    (data / "raw").mkdir(parents=True, exist_ok=True)
    return {"icp": biz / "icp.json", "data": data, "raw": data / "raw",
            "leads": data / "leads.json", "csv": data / "leads.csv"}


def load_json(p: Path, default):
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else default


def save_leads(p: Path, leads: dict) -> None:
    rows = sorted(leads.values(), key=lambda l: (-l.get("score", 0), l["username"]))
    p.write_text(json.dumps(rows, indent=2, ensure_ascii=False), encoding="utf-8")


def load_leads(p: Path) -> dict:
    return {l["username"].lower(): l for l in load_json(p, [])}


def has(text: str, term: str) -> bool:
    """Whole-word-ish match, so 'iit' does not match 'kiit' but 'wa.me' still works."""
    return re.search(r"(?<![a-z0-9])" + re.escape(term.lower()) + r"(?![a-z0-9])", text) is not None


def days_since(iso: str | None) -> int | None:
    if not iso:
        return None
    try:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return (datetime.now(timezone.utc) - dt).days


def engagement(lead: dict) -> float | None:
    if lead.get("avg_engagement_rate") is not None:
        return lead["avg_engagement_rate"]
    posts, f = lead.get("recent_posts") or [], lead.get("followers") or 0
    if not posts or not f:
        return None
    return sum((p.get("likes", 0) + p.get("comments", 0)) for p in posts) / len(posts) / f


def host(url: str | None) -> str:
    u = (url or "").lower().strip()
    u = re.sub(r"^https?://", "", u)
    return re.sub(r"^www\.", "", u).split("/")[0]


def digital_level(lead: dict, dm: dict) -> tuple[str, str]:
    """How digital the lead already is: 'has_system', 'website_only' or 'none' (+ the evidence).
    Uses the profile link, bio, and `website_signals` (what the qualifier saw on their website)."""
    links = [lead.get("external_url")] + list(lead.get("bio_links") or [])
    hosts = [host(l) for l in links if l]
    text = " ".join([str(lead.get("bio") or ""), *(lead.get("website_signals") or []), *(l for l in links if l)]).lower()
    for d in dm.get("system_domains", []):
        if any(h == d or h.endswith("." + d) for h in hosts) or d in text:
            return "has_system", d
    for t in dm.get("management_terms", []):
        if has(text, t):
            return "has_system", t
    own = [h for h in hosts if h and not any(h == d or h.endswith("." + d) for d in dm.get("link_only_domains", []))]
    if own:
        return "website_only", own[0]
    if not lead.get("website_checked"):
        return "unknown", "website not checked yet"
    return "none", "no website found on Google/web search"


def score(lead: dict, icp: dict) -> dict:
    w, reasons = icp["weights"], []
    username = lead["username"].lower()
    text = " ".join(str(lead.get(k) or "") for k in ("full_name", "bio", "category", "username")).lower()
    caption_text = " ".join(p.get("caption", "") for p in lead.get("recent_posts") or []).lower()
    checked = lead.get("followers") is not None  # None = profile not looked up yet, not "0 followers"
    followers = lead.get("followers") or 0
    band = icp["size_band"]
    age = days_since(lead.get("last_post_at"))
    dm = icp.get("digital_maturity")
    level, level_why = digital_level(lead, dm) if dm else (None, "")

    # Disqualifiers
    dq = None
    if lead.get("is_private"):
        dq = "private account"
    elif username in {u.lower() for u in icp["exclusions"]["usernames"]}:
        dq = "excluded brand/competitor"
    elif any(has(text, t) for t in icp["exclusions"]["bio_terms"]):
        dq = "excluded bio term"
    elif dm and dm.get("exclude_has_system") and level == "has_system":
        dq = f"already uses a management system ({level_why})"
    elif checked and followers > band["max_followers"]:
        dq = f"too large ({followers} followers)"
    elif checked and followers < band["min_followers"]:
        dq = f"too small ({followers} followers)"
    elif age is not None and age > 180:
        dq = f"inactive ({age} days since last post)"
    if lead.get("status") == "do_not_contact":
        dq = "do not contact"
    if dq:
        return {**lead, "score": 0, "tier": "X", "score_reasons": [], "disqualified_reason": dq}

    # Fit: the segment with the most keyword hits wins; 2 hits = full marks
    best_seg, best_hits = None, []
    for seg, terms in icp["segments"].items():
        hits = [t for t in terms if has(text, t)]
        if len(hits) > len(best_hits):
            best_seg, best_hits = seg, hits
    fit = min(1.0, len(best_hits) / 2) * w["fit"]
    if best_hits:
        reasons.append(f"fit: {best_seg} ({', '.join(best_hits[:3])})")

    # Size: full points in the sweet spot, half points elsewhere in range
    # Follower counts are optional (not looked up by default): unknown = neutral half points
    if not checked:
        size = w["size"] / 2
        reasons.append("size: followers not checked")
    else:
        size = w["size"] if band["sweet_min"] <= followers <= band["sweet_max"] else w["size"] / 2
        reasons.append(f"size: {followers} followers")

    # Activity
    if age is None:
        act = w["activity"] / 3
    elif age <= 14:
        act = w["activity"]
    elif age <= 30:
        act = w["activity"] * 0.7
    elif age <= 60:
        act = w["activity"] * 0.4
    else:
        act = 0
    if age is not None:
        reasons.append(f"activity: last post {age}d ago")

    # Engagement: 3%+ is full marks
    er = engagement(lead)
    eng = 0 if er is None else min(1.0, er / 0.03) * w["engagement"]
    if er is not None:
        reasons.append(f"engagement: {er:.1%}")

    # Buying signals in bio, link or recent captions
    sig_text = f"{text} {lead.get('external_url') or ''} {caption_text}"
    sig_hits = [s for s in icp["buying_signals"] if has(sig_text, s)]
    sig = min(1.0, len(sig_hits) / 2) * w["signals"]
    if sig_hits:
        reasons.append(f"signals: {', '.join(sig_hits[:4])}")

    # Seen from several sources = stronger lead (+2 per extra source, max +6)
    bonus = min(6, 2 * (len(lead.get("discovered_via") or []) - 1))
    if bonus > 0:
        reasons.append(f"found via {len(lead['discovered_via'])} sources")

    # Digital maturity: leads still running on WhatsApp/notebooks are the best fit
    digital = 0
    if level:
        digital = dm.get("points", {}).get(level, 0)
        label = {"none": "no website or system", "website_only": "has a website", "has_system": "uses a system",
                 "unknown": "not checked"}[level]
        reasons.append(f"digital: {label} ({level_why}) {digital:+g}")

    total = round(max(0, min(100, fit + size + act + eng + sig + bonus + digital)), 1)
    tier = "A" if total >= icp["tiers"]["A"] else "B" if total >= icp["tiers"]["B"] else "C"
    return {**lead, "score": total, "tier": tier, "segment": best_seg, "digital_level": level,
            "score_reasons": reasons, "disqualified_reason": None}


def merge_record(old: dict | None, new: dict) -> dict:
    if not old:
        return {"platform": "instagram", "status": "new", "notes": "", "first_seen_at": now(), **new}
    merged = {**old, **{k: v for k, v in new.items() if v not in (None, "", [])}}
    seen = {(d["type"], d["value"]) for d in old.get("discovered_via", [])}
    merged["discovered_via"] = old.get("discovered_via", []) + [
        d for d in new.get("discovered_via", []) if (d["type"], d["value"]) not in seen]
    for keep in ("status", "notes", "first_seen_at", "history", "challenges", "primary_challenge", "campaign"):
        # person- and analyst-owned fields win over fresh scrape data
        if old.get(keep):
            merged[keep] = old[keep]
    return merged


def dnc_reason(lead: dict, icp: dict) -> str | None:
    """Why this lead must never be contacted, from icp.json `do_not_contact` rules, or None."""
    rules = icp.get("do_not_contact") or {}
    username = lead["username"].lower()
    if username in {u.lower().lstrip("@") for u in rules.get("usernames", [])}:
        return "listed in do_not_contact.usernames"
    if rules.get("include_excluded_usernames") and username in {
            u.lower() for u in icp.get("exclusions", {}).get("usernames", [])}:
        return "competitor or big brand (exclusions.usernames)"
    text = " ".join(str(lead.get(k) or "") for k in ("full_name", "bio", "category", "username")).lower()
    for term in rules.get("terms", []):
        if term.startswith("NEED"):
            continue
        if has(text, term) or term.lower().replace(" ", "") in username.replace("_", "").replace(".", ""):
            return f"matches do-not-contact term '{term}'"
    return None


def apply_score(lead: dict, icp: dict) -> dict:
    reason = dnc_reason(lead, icp)
    if reason and lead.get("status") in (None, "new", "qualified"):
        # Permanent: do_not_contact is a person-level status, so later merges never undo it.
        old = lead.get("status")
        lead = {**lead, "status": "do_not_contact", "dnc_reason": reason}
        lead.setdefault("history", [])
        lead["history"] = lead["history"] + [{"at": now(), "from": old, "to": "do_not_contact",
                                              "campaign": lead.get("campaign"), "note": f"auto: {reason}"}]
        lead["notes"] = (str(lead.get("notes") or "") + f"\n[{now()[:10]}] do not contact (auto): {reason}").strip()
    s = score(lead, icp)
    if s.get("status") not in HUMAN_STATUSES:
        # Qualified = tier A/B, or (if the ICP says so) any non-disqualified lead confirmed to have no website
        no_site = icp.get("digital_maturity", {}).get("qualify_if_no_website") and s.get("digital_level") == "none"
        s["status"] = "qualified" if s["tier"] in ("A", "B") or (no_site and s["tier"] != "X") else "new"
    s["updated_at"] = now()
    return s


def cmd_merge(a, p, icp):
    leads, files, count = load_leads(p["leads"]), sorted(p["raw"].glob("*.json")), 0
    for f in files:
        data = load_json(f, [])
        for rec in data if isinstance(data, list) else data.get("items", []):
            if not rec.get("username"):
                continue
            key = rec["username"].lower().lstrip("@")
            rec["username"] = key
            rec.setdefault("profile_url", f"https://www.instagram.com/{key}/")
            leads[key] = apply_score(merge_record(leads.get(key), rec), icp)
            count += 1
    save_leads(p["leads"], leads)
    print(f"Merged {count} records from {len(files)} raw files -> {len(leads)} unique leads")
    cmd_funnel(a, p, icp)


def cmd_dnc(a, p, icp):
    """Preview: leads the do_not_contact rules match (nothing is saved; merge/rescore applies them)."""
    hits = [(l, dnc_reason(l, icp)) for l in load_leads(p["leads"]).values()]
    hits = [(l, r) for l, r in hits if r or l.get("status") == "do_not_contact"]
    for l, r in hits:
        state = "already do_not_contact" if l.get("status") == "do_not_contact" else f"would flag (now {l.get('status')})"
        if l.get("status") in HUMAN_STATUSES - {"do_not_contact"}:
            state = f"match, but a person set '{l['status']}': left alone"
        print(f"@{l['username']:<32} {state:<40} {r or l.get('dnc_reason') or 'set by a person'}")
    print(f"{len(hits)} lead(s)")


def cmd_rescore(a, p, icp):
    leads = {k: apply_score(v, icp) for k, v in load_leads(p["leads"]).items()}
    save_leads(p["leads"], leads)
    cmd_funnel(a, p, icp)


def cmd_known(a, p, icp):
    """Every username already seen (any tier or status) plus ICP exclusions, one per line.
    Daily runs skip these so the same account is never looked up or reported twice."""
    names = set(load_leads(p["leads"])) | {u.lower().lstrip("@") for u in icp.get("exclusions", {}).get("usernames", [])}
    out = "\n".join(sorted(names))
    if a.file:
        Path(a.file).write_text(out + "\n", encoding="utf-8")
        print(f"Wrote {len(names)} known usernames to {a.file}")
    else:
        print(out)


def cmd_list(a, p, icp):
    rows = [l for l in load_leads(p["leads"]).values()
            if (not a.tier or l.get("tier") == a.tier) and (not a.status or l.get("status") == a.status)
            and (not a.since or (l.get("first_seen_at") or "") >= a.since)]
    rows.sort(key=lambda l: -l.get("score", 0))
    for l in rows[: a.limit]:
        why = l.get("disqualified_reason") or "; ".join(l.get("score_reasons", []))
        print(f"{l.get('tier','?')} {l.get('score',0):5.1f}  @{l['username']:<28} {l.get('status',''):<12} {why}")
    print(f"({len(rows)} shown of {len(load_leads(p['leads']))})")


def cmd_status(a, p, icp):
    if a.set not in STATUSES:
        sys.exit(f"status must be one of {STATUSES}")
    leads = load_leads(p["leads"])
    key = a.username.lower().lstrip("@")
    if key not in leads:
        sys.exit(f"@{key} not found")
    old_status = leads[key].get("status")
    leads[key]["status"] = a.set
    if a.campaign:
        leads[key]["campaign"] = a.campaign
    leads[key].setdefault("history", []).append(
        {"at": now(), "from": old_status, "to": a.set, "campaign": a.campaign or leads[key].get("campaign"), "note": a.note})
    if a.note:
        leads[key]["notes"] = (leads[key].get("notes", "") + f"\n[{now()[:10]}] {a.note}").strip()
    leads[key]["updated_at"] = now()
    save_leads(p["leads"], leads)
    print(f"@{key} -> {a.set}")


def cmd_export(a, p, icp):
    cols = ["tier", "score", "username", "full_name", "profile_url", "segment", "primary_challenge", "campaign",
            "city", "followers",
            "last_post_at", "public_email", "external_url", "status", "score_reasons", "disqualified_reason", "notes"]
    with p["csv"].open("w", newline="", encoding="utf-8") as fh:
        wr = csv.DictWriter(fh, fieldnames=cols, extrasaction="ignore")
        wr.writeheader()
        for l in sorted(load_leads(p["leads"]).values(), key=lambda l: -l.get("score", 0)):
            wr.writerow({**l, "score_reasons": "; ".join(l.get("score_reasons", []))})
    print(f"Wrote {p['csv']}")


def cmd_funnel(a, p, icp):
    leads = list(load_leads(p["leads"]).values())
    tiers = {t: sum(1 for l in leads if l.get("tier") == t) for t in "ABCX"}
    stats = {s: sum(1 for l in leads if l.get("status") == s) for s in STATUSES}
    print(f"[{icp.get('business', a.business)}] tiers: " + "  ".join(f"{k}={v}" for k, v in tiers.items()))
    print("status: " + "  ".join(f"{k}={v}" for k, v in stats.items() if v))


def cmd_annotate(a, p, icp):
    """Store Lead Analyst output: [{username, challenges:[{id, confidence, evidence}], primary_challenge}]."""
    if not a.file:
        sys.exit("--file is required")
    known = {c["id"] for c in icp.get("challenge_library", [])}
    leads, done, unknown = load_leads(p["leads"]), 0, set()
    for rec in load_json(Path(a.file), []):
        key = rec["username"].lower().lstrip("@")
        if key not in leads:
            continue
        unknown |= {c["id"] for c in rec.get("challenges", [])} - known
        leads[key]["challenges"] = rec.get("challenges", [])
        leads[key]["primary_challenge"] = rec.get("primary_challenge")
        leads[key]["updated_at"] = now()
        done += 1
    save_leads(p["leads"], leads)
    print(f"Annotated {done} leads")
    if unknown:
        print(f"Note: challenge ids not in icp.challenge_library: {sorted(unknown)}")


REACHED = {"contacted", "replied", "demo_booked", "won", "lost"}
REPLIED = {"replied", "demo_booked", "won"}


def cmd_stats(a, p, icp):
    """Outcome rates per segment / challenge / campaign / tier. Input for the feedback analyst."""
    leads = [l for l in load_leads(p["leads"]).values() if l.get("status") in REACHED
             or any(h.get("to") in REACHED for h in l.get("history", []))]
    if not leads:
        print("No contacted leads yet. Stats appear after outreach statuses are recorded.")
        return
    out = {}
    for dim in ("segment", "primary_challenge", "campaign", "tier"):
        groups = {}
        for l in leads:
            g = groups.setdefault(l.get(dim) or "(none)", {"contacted": 0, "replied": 0, "demo": 0, "won": 0})
            g["contacted"] += 1
            g["replied"] += l.get("status") in REPLIED
            g["demo"] += l.get("status") in {"demo_booked", "won"}
            g["won"] += l.get("status") == "won"
        out[dim] = groups
        print(f"\nby {dim}:")
        for k, g in sorted(groups.items(), key=lambda kv: -kv[1]["contacted"]):
            n = g["contacted"]
            print(f"  {k:<28} contacted={n:<4} reply={g['replied']/n:5.0%}  demo={g['demo']/n:5.0%}  won={g['won']}")
    (p["data"] / "stats.json").write_text(json.dumps({"generated_at": now(), **out}, indent=2), encoding="utf-8")
    print(f"\nWrote {p['data'] / 'stats.json'}")


def cmd_push(a, p, icp):
    url, key = os.environ.get("CF_API_URL"), os.environ.get("CF_API_KEY")
    if not url or not key:
        sys.exit("Set CF_API_URL (e.g. https://campaignforge-api.fly.dev) and CF_API_KEY. "
                 "The /leads endpoint is proposed in integrations/campaignforge/ and must exist first.")
    rows = [l for l in load_leads(p["leads"]).values() if l.get("tier") in ("A", "B")]
    body = json.dumps({"client_slug": a.business, "leads": rows}).encode()
    req = urllib.request.Request(f"{url.rstrip('/')}/api/v1/leads/bulk-upsert", data=body, method="POST",
                                 headers={"Content-Type": "application/json", "X-API-Key": key})
    with urllib.request.urlopen(req, timeout=30) as r:
        print(r.status, r.read().decode()[:500])


def main():
    load_env()
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("command", choices=["merge", "rescore", "list", "known", "status", "export", "funnel", "annotate", "stats", "push", "dnc"])
    ap.add_argument("--since", help="list: only leads first seen on/after this date (YYYY-MM-DD)")
    ap.add_argument("--business", "-b", default=os.environ.get("DEFAULT_BUSINESS"), help="profile slug under businesses/")
    ap.add_argument("--tier")
    ap.add_argument("--status")
    ap.add_argument("--limit", type=int, default=50)
    ap.add_argument("--username")
    ap.add_argument("--set")
    ap.add_argument("--note")
    ap.add_argument("--campaign")
    ap.add_argument("--file")
    a = ap.parse_args()
    if not a.business:
        sys.exit("Pass -b <slug> or set DEFAULT_BUSINESS in .env")
    p = paths(a.business)
    icp = load_json(p["icp"], {})
    globals()[f"cmd_{a.command}"](a, p, icp)


if __name__ == "__main__":
    main()
