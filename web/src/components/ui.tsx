import clsx from "clsx";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { STATUS_LABEL, type LeadStatus, type Tier } from "@/lib/types";

export const cx = clsx;

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="font-mono text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ className, children, title, action }: { className?: string; children: React.ReactNode; title?: string; action?: React.ReactNode }) {
  return (
    <section className={cx("rounded-xl border border-border bg-surface p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]", className)}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="text-sm font-semibold">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Kpi({ label, value, hint, icon: Icon, tone = "default" }: {
  label: string; value: React.ReactNode; hint?: React.ReactNode; icon?: LucideIcon; tone?: "default" | "accent";
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3 sm:p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
        {Icon && <Icon className={cx("size-4", tone === "accent" ? "text-accent" : "text-primary")} aria-hidden />}
      </div>
      <p className="mt-1 font-mono text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}

const TIER_STYLE: Record<Tier, string> = {
  A: "bg-primary text-white dark:text-bg",
  B: "bg-primary-soft text-primary",
  C: "bg-surface-2 text-muted",
  X: "bg-danger-soft text-danger",
};

export function TierBadge({ tier }: { tier: Tier | null }) {
  if (!tier) {
    return (
      <span className="inline-grid size-6 place-items-center rounded-md border border-dashed border-border font-mono text-xs text-muted"
        title="Not checked yet: profile lookup pending">
        ?<span className="sr-only"> not checked yet</span>
      </span>
    );
  }
  const t = tier;
  return (
    <span className={cx("inline-grid size-6 place-items-center rounded-md font-mono text-xs font-semibold", TIER_STYLE[t])}
      title={t === "X" ? "Disqualified" : `Tier ${t}`}>
      {t}
      <span className="sr-only">{t === "X" ? " disqualified" : ` tier`}</span>
    </span>
  );
}

const STATUS_STYLE: Record<LeadStatus, string> = {
  new: "bg-surface-2 text-muted",
  qualified: "bg-primary-soft text-primary",
  contacted: "bg-accent-soft text-accent-text",
  replied: "bg-success-soft text-success",
  demo_booked: "bg-success-soft text-success",
  won: "bg-success text-white dark:text-bg",
  lost: "bg-surface-2 text-muted line-through",
  do_not_contact: "bg-danger-soft text-danger",
};

export function StatusBadge({ status }: { status: LeadStatus }) {
  return (
    <span className={cx("inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium", STATUS_STYLE[status])}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export function Pill({ children, tone = "default", className }: { children: React.ReactNode; tone?: "default" | "primary" | "accent" | "success" | "danger"; className?: string }) {
  const tones = {
    default: "bg-surface-2 text-muted border-border",
    primary: "bg-primary-soft text-primary border-transparent",
    accent: "bg-accent-soft text-accent-text border-transparent",
    success: "bg-success-soft text-success border-transparent",
    danger: "bg-danger-soft text-danger border-transparent",
  };
  return <span className={cx("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium", tones[tone], className)}>{children}</span>;
}

export function EmptyState({ icon: Icon, title, children, command }: { icon: LucideIcon; title: string; children?: React.ReactNode; command?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border-strong bg-surface p-8 text-center">
      <div className="mx-auto mb-3 grid size-11 place-items-center rounded-full bg-primary-soft">
        <Icon className="size-5 text-primary" aria-hidden />
      </div>
      <h3 className="font-semibold">{title}</h3>
      {children && <div className="mx-auto mt-1 max-w-md text-sm text-muted">{children}</div>}
      {command && <code className="mt-4 inline-block rounded-md bg-surface-2 px-3 py-1.5 font-mono text-sm">{command}</code>}
    </div>
  );
}

export function ButtonLink({ href, children, variant = "secondary" }: { href: string; children: React.ReactNode; variant?: "primary" | "secondary" }) {
  return (
    <Link href={href} className={cx(
      "inline-flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-200",
      variant === "primary" ? "bg-primary text-white hover:bg-primary-hover dark:text-bg" : "border border-border bg-surface hover:bg-surface-2",
    )}>
      {children}
    </Link>
  );
}

export function pct(n: number, d: number) {
  return d ? `${Math.round((n / d) * 100)}%` : "–";
}

export function fmtDate(v: string | Date | null | undefined) {
  if (!v) return "–";
  const d = typeof v === "string" ? new Date(v) : v;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
}

export function fmtAgo(v: string | Date) {
  const d = typeof v === "string" ? new Date(v) : v;
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 14) return `${Math.floor(s / 86400)}d ago`;
  return fmtDate(d);
}

export function humanize(id: string | null | undefined) {
  if (!id) return "–";
  return id.replace(/[_-]+/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}
