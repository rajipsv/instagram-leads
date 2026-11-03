#!/usr/bin/env python3
"""PC runner: runs agent jobs requested from the web UI ("Run daily leads" button).

The web app (local or on Vercel) only adds a row to `agent_runs` in Neon. This script, running on the
PC that has Claude Code and Chrome signed in to Instagram, picks the row up, runs the slash command
with Claude Code in headless mode, syncs to Neon and writes the result back.

  python scripts/runner.py            # keep running, checking for jobs every 20 s
  python scripts/runner.py --once     # run the next queued job (if any) and exit
  powershell -File scripts/install_runner.ps1   # start it automatically when you log in to Windows

Only whitelisted commands run. Nothing from the database is passed to a shell.
"""
from __future__ import annotations

import argparse
import re
import shutil
import socket
import subprocess
import sys
import time
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _env import ROOT  # noqa: E402
from db import connect  # noqa: E402

POLL_SECONDS = 20
RUN_TIMEOUT_S = 60 * 60
SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{0,63}$")
# What headless Claude may use: the project's scripts, files under data/, web search, Chrome and Apify.
# Instagram stays read-only through the agents' own rules; nothing here can post or DM.
ALLOWED_TOOLS = [
    "Read", "Glob", "Grep", "Agent", "Skill", "WebSearch", "WebFetch", "TodoWrite",
    "Write(data/**)", "Edit(data/**)",
    "Bash(python scripts/leads.py:*)", "Bash(python scripts/db.py:*)",
    "mcp__claude-in-chrome", "mcp__claude_ai_Apify",
]
COMMANDS = {"daily-leads": lambda slug, n: f"/daily-leads {slug} {n}"}
NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0)  # no console pop-ups when started by Windows at login

if sys.stdout is None:  # started with pythonw (no console): log to data/runner.log instead
    (ROOT / "data").mkdir(exist_ok=True)
    sys.stdout = sys.stderr = open(ROOT / "data" / "runner.log", "a", encoding="utf-8", buffering=1)


def log(msg: str) -> None:
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


def heartbeat(conn) -> None:
    conn.execute("""INSERT INTO runner_heartbeat (id, host, seen_at) VALUES (1, %s, now())
                    ON CONFLICT (id) DO UPDATE SET host = EXCLUDED.host, seen_at = now()""", (socket.gethostname(),))
    conn.commit()


def recover_stale(conn) -> None:
    n = conn.execute("""UPDATE agent_runs SET status = 'failed', finished_at = now(),
                          summary = 'Stopped: the PC runner restarted while this was running.'
                        WHERE status = 'running' AND started_at < now() - interval '2 hours'""").rowcount
    conn.commit()
    if n:
        log(f"marked {n} stale run(s) as failed")


def claim(conn):
    row = conn.execute("""
        UPDATE agent_runs r SET status = 'running', started_at = now()
        FROM businesses b
        WHERE r.id = (SELECT id FROM agent_runs WHERE status = 'queued' ORDER BY requested_at LIMIT 1 FOR UPDATE SKIP LOCKED)
          AND b.id = r.business_id
        RETURNING r.id, r.command, r.count, b.slug""").fetchone()
    conn.commit()
    return row


def finish(conn, run_id: int, status: str, summary: str) -> None:
    conn.execute("UPDATE agent_runs SET status = %s, summary = %s, finished_at = now() WHERE id = %s",
                 (status, summary[-4000:], run_id))
    conn.commit()


def run_job(run_id: int, command: str, count: int, slug: str, dry_run: bool = False) -> tuple[str, str]:
    if command not in COMMANDS:
        return "failed", f"Unknown command '{command}'."
    if not SLUG_RE.match(slug) or not (ROOT / "businesses" / slug / "icp.json").exists():
        return "failed", f"No business profile for '{slug}' on this PC."
    claude = shutil.which("claude")
    if not claude:
        return "failed", "Claude Code (claude) is not installed or not on PATH on the runner PC."
    count = max(1, min(30, int(count)))
    log_dir = ROOT / "data" / slug / "daily" / "runs"
    log_dir.mkdir(parents=True, exist_ok=True)
    log_file = log_dir / f"run-{run_id}.log"
    args = [claude, "-p", COMMANDS[command](slug, count), "--chrome", "--output-format", "text",
            "--allowedTools", *ALLOWED_TOOLS]
    if dry_run:  # tests the queue and Claude Code without touching Instagram or the data
        p = subprocess.run([claude, "-p", "Reply with exactly: runner test OK", "--output-format", "text"], cwd=ROOT,
                           capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=300,
                           creationflags=NO_WINDOW)
        return ("done" if p.returncode == 0 else "failed"), f"Dry run (no Instagram, no data changed): {p.stdout.strip()[-500:]}"
    log(f"run {run_id}: /{command} {slug} {count}")
    try:
        p = subprocess.run(args, cwd=ROOT, capture_output=True, text=True, encoding="utf-8", errors="replace",
                           timeout=RUN_TIMEOUT_S, creationflags=NO_WINDOW)
        out, ok = (p.stdout or "") + (p.stderr or ""), p.returncode == 0
    except subprocess.TimeoutExpired as e:
        out, ok = f"{e.stdout or ''}\nTimed out after {RUN_TIMEOUT_S // 60} minutes.", False
    log_file.write_text(out, encoding="utf-8")

    # Always save whatever was found, even if the run stopped early (one sync at a time: this runner is sequential).
    sync = subprocess.run([sys.executable, "scripts/db.py", "sync", "-b", slug], cwd=ROOT, capture_output=True, text=True,
                          creationflags=NO_WINDOW)
    report = ROOT / "data" / slug / "daily" / f"{date.today().isoformat()}.md"
    summary = report.read_text(encoding="utf-8") if report.exists() else out.strip()[-3000:] or "No output."
    if sync.returncode != 0:
        summary += "\n\nDatabase sync failed on the runner PC; run `python scripts/db.py sync -b " + slug + "`."
        ok = False
    return ("done" if ok else "failed"), summary


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--once", action="store_true", help="run the next queued job, then exit")
    ap.add_argument("--dry-run", action="store_true", help="test the setup: Claude answers a test prompt instead")
    a = ap.parse_args()
    conn = connect()
    recover_stale(conn)
    log("runner started; waiting for jobs from the web UI")
    while True:
        try:
            heartbeat(conn)
            job = claim(conn)
            if job:
                run_id, command, count, slug = job
                status, summary = run_job(run_id, command, count, slug, a.dry_run)
                finish(conn, run_id, status, summary)
                log(f"run {run_id}: {status}")
            if a.once:
                return
        except Exception as e:  # keep the runner alive across network blips; never print the DB URL
            log(f"error: {type(e).__name__}")
            try:
                conn.close()
            except Exception:
                pass
            time.sleep(POLL_SECONDS)
            conn = connect()
            continue
        time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    main()
