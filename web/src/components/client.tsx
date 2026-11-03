"use client";

import { Check, Copy, Info, Loader2, Moon, Play, Sun } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { cancelRun, requestDailyLeads, updateLeadStatus, type ActionState } from "@/lib/actions";
import { STATUS_LABEL, STATUSES, type AgentRun, type LeadStatus } from "@/lib/types";
import { useOnline } from "./pwa";
import { cx } from "./ui";

export function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => setDark(document.documentElement.classList.contains("dark")), []);
  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try { localStorage.setItem("gi-theme", next ? "dark" : "light"); } catch {}
  };
  return (
    <button onClick={toggle} aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      className="inline-flex size-9 cursor-pointer items-center justify-center rounded-md text-muted transition-colors duration-200 hover:bg-surface-2 hover:text-text">
      {dark ? <Sun className="size-4" aria-hidden /> : <Moon className="size-4" aria-hidden />}
    </button>
  );
}

/** A shell command with a copy button (agent steps run in Claude Code, not in the browser). */
export function CopyCommand({ command, className }: { command: string; className?: string }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(command); setDone(true); setTimeout(() => setDone(false), 1500); } catch {}
  };
  return (
    <div className={cx("flex items-center gap-2 rounded-md border border-border bg-surface-2 py-1 pl-3 pr-1", className)}>
      <code className="min-w-0 flex-1 truncate font-mono text-xs sm:text-sm">{command}</code>
      <button onClick={copy} aria-label={`Copy command ${command}`}
        className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded text-muted transition-colors duration-200 hover:bg-surface hover:text-text">
        {done ? <Check className="size-3.5 text-success" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
      </button>
      <span aria-live="polite" className="sr-only">{done ? "Copied" : ""}</span>
    </div>
  );
}

/** Records a lead status change (+ campaign, + reply note). This feeds the feedback loop. */
export function LeadStatusForm({ business, username, status, campaign, campaigns }: {
  business: string; username: string; status: LeadStatus; campaign: string | null; campaigns: { slug: string; name: string }[];
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(updateLeadStatus, null);
  const online = useOnline();
  const field = "w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-text";
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="business" value={business} />
      <input type="hidden" name="username" value={username} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="lead-status" className="mb-1 block text-xs font-medium text-muted">Status</label>
          <select id="lead-status" name="status" defaultValue={status} className={field}>
            {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="lead-campaign" className="mb-1 block text-xs font-medium text-muted">Campaign</label>
          <select id="lead-campaign" name="campaign" defaultValue={campaign ?? ""} className={field}>
            <option value="">None</option>
            {campaigns.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label htmlFor="lead-note" className="mb-1 block text-xs font-medium text-muted">What happened? (reply summary, objection)</label>
        <textarea id="lead-note" name="note" rows={2} maxLength={1000} placeholder="e.g. Asked about price for 2 branches" className={field} />
      </div>
      <div className="flex items-center gap-3">
        <button disabled={pending || !online}
          className="cursor-pointer rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition-colors duration-200 hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60 dark:text-bg">
          {pending ? "Saving…" : "Save update"}
        </button>
        <p role="status" aria-live="polite" className={cx("text-sm", state?.ok ? "text-success" : "text-danger")}>
          {!online ? <span className="text-muted">Reconnect to save changes.</span> : state?.message}
        </p>
      </div>
    </form>
  );
}

const RUN_LABEL: Record<AgentRun["status"], string> = {
  queued: "Queued, waiting for your PC", running: "Running on your PC", done: "Done", failed: "Failed", cancelled: "Cancelled",
};
const RUN_TONE: Record<AgentRun["status"], string> = {
  queued: "bg-primary-soft text-primary", running: "bg-primary-soft text-primary", done: "bg-success-soft text-success",
  failed: "bg-danger-soft text-danger", cancelled: "bg-surface-2 text-muted",
};

/** "Run daily leads" button. It queues a job in Neon; scripts/runner.py on the user's PC runs it. */
export function RunDailyLeads({ business, defaultCount, runs, runnerOnline, runnerSeenAt }: {
  business: string; defaultCount: number; runs: AgentRun[]; runnerOnline: boolean; runnerSeenAt: string | null;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(requestDailyLeads, null);
  const [, cancel, cancelling] = useActionState<ActionState, FormData>(cancelRun, null);
  const online = useOnline();
  const router = useRouter();
  const last = runs[0];
  const active = last && (last.status === "queued" || last.status === "running");

  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), 10_000);
    return () => clearInterval(t);
  }, [active, router]);

  return (
    <div className="space-y-3">
      <form action={action} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="business" value={business} />
        <div>
          <label htmlFor="run-count" className="mb-1 block text-xs font-medium text-muted">New leads</label>
          <input id="run-count" name="count" type="number" min={1} max={30} defaultValue={defaultCount}
            className="w-20 rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-text" />
        </div>
        <button disabled={pending || !online || !!active}
          className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition-colors duration-200 hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60 dark:text-bg">
          {pending || active ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Play className="size-4" aria-hidden />}
          {active ? "Running…" : pending ? "Queuing…" : "Run daily leads"}
        </button>
        <span className={cx("inline-flex items-center gap-1.5 text-xs", runnerOnline ? "text-success" : "text-muted")}>
          <span className={cx("size-2 rounded-full", runnerOnline ? "bg-success" : "bg-border-strong")} aria-hidden />
          {runnerOnline ? "PC runner online" : runnerSeenAt ? `PC runner offline (last seen ${new Date(runnerSeenAt).toLocaleString()})` : "PC runner not set up"}
        </span>
      </form>

      <p className="flex gap-2 rounded-md border border-accent/40 bg-accent-soft px-3 py-2 text-xs text-accent-text">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <span>Before you run: keep your PC on, with Chrome open and <strong>signed in to Instagram in another tab</strong>.
          The search runs in that browser, read-only.</span>
      </p>

      <p role="status" aria-live="polite" className={cx("text-sm", state?.ok ? "text-success" : "text-danger")}>
        {!online ? <span className="text-muted">Reconnect to start a run.</span> : state?.message}
      </p>

      {last && (
        <div className="rounded-md border border-border p-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className={cx("rounded-full px-2 py-0.5 text-xs font-medium", RUN_TONE[last.status])}>{RUN_LABEL[last.status]}</span>
            <span className="text-xs text-muted">{last.count} leads · asked {new Date(last.requested_at).toLocaleString()}
              {last.finished_at && ` · finished ${new Date(last.finished_at).toLocaleString()}`}</span>
            {last.status === "queued" && (
              <form action={cancel} className="ml-auto">
                <input type="hidden" name="business" value={business} />
                <input type="hidden" name="id" value={last.id} />
                <button disabled={cancelling} className="cursor-pointer text-xs font-medium text-danger hover:underline">Cancel</button>
              </form>
            )}
          </div>
          {last.summary && (
            <details className="mt-2" open={last.status !== "done"}>
              <summary className="cursor-pointer text-xs font-medium text-primary">Result</summary>
              <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words font-mono text-xs text-text">{last.summary}</pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
