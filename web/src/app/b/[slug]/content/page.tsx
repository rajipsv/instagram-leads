import { Check, Clapperboard, FileText, GalleryHorizontal, Image as ImageIcon, X } from "lucide-react";
import Link from "next/link";
import { Card, EmptyState, PageHeader, Pill, cx, fmtDate, humanize } from "@/components/ui";
import { setContentStatus } from "@/lib/actions";
import { getBusiness, listContent } from "@/lib/queries";
import { CONTENT_STATUSES, type ContentItem, type ContentStatus } from "@/lib/types";

export const metadata = { title: "Content" };

const FORMAT_ICON = { reel: Clapperboard, carousel: GalleryHorizontal, post: ImageIcon, story: FileText } as const;
const STATUS_TONE: Record<ContentStatus, "default" | "primary" | "accent" | "success" | "danger"> = {
  draft: "default", safety_passed: "accent", approved: "primary", scheduled: "primary", published: "success", rejected: "danger",
};

export default async function ContentPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ status?: string }> }) {
  const { slug } = await params;
  const { status } = await searchParams;
  const filter = CONTENT_STATUSES.includes(status as ContentStatus) ? status : undefined;
  const business = await getBusiness(slug);
  const items = await listContent(business.id, filter);
  const weeks = [...new Set(items.map((i) => i.week))];

  return (
    <>
      <PageHeader title="Content" subtitle="Drafted by the Content Strategist and checked by the safety review. You decide what gets posted." />
      <nav aria-label="Filter by status" className="mb-4 flex gap-1.5 overflow-x-auto pb-1">
        {[undefined, "safety_passed", "approved", "scheduled", "published", "rejected"].map((s) => (
          <Link key={s ?? "all"} href={`/b/${slug}/content${s ? `?status=${s}` : ""}`} aria-current={filter === s ? "page" : undefined}
            className={cx("cursor-pointer whitespace-nowrap rounded-full border px-3 py-1 text-sm transition-colors duration-200",
              filter === s ? "border-primary bg-primary text-white dark:text-bg" : "border-border bg-surface text-muted hover:text-text")}>
            {s === "safety_passed" ? "To review" : s ? humanize(s) : "All"}
          </Link>
        ))}
      </nav>

      {items.length === 0 ? (
        <EmptyState icon={FileText} title={filter ? "Nothing with this status" : "No content yet"} command={filter ? undefined : `/content-plan ${slug}`}>
          {filter ? "Try another filter." : "Content is planned from audience insights and campaign briefs."}
        </EmptyState>
      ) : (
        weeks.map((w) => (
          <section key={w} className="mb-6">
            <h2 className="mb-2 font-mono text-sm font-semibold text-muted">{w}</h2>
            <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {items.filter((i) => i.week === w).map((i) => <ContentCard key={i.id} item={i} slug={slug} />)}
            </ul>
          </section>
        ))
      )}
    </>
  );
}

function ContentCard({ item: i, slug }: { item: ContentItem; slug: string }) {
  const Icon = FORMAT_ICON[i.format ?? "post"] ?? FileText;
  const needs = i.body?.needs ?? [];
  const reviewable = i.review_status === "draft" || i.review_status === "safety_passed";
  return (
    <li>
      <Card className="flex h-full flex-col">
        <div className="flex items-center gap-2">
          <Icon className="size-4 text-primary" aria-hidden />
          <span className="text-sm font-medium">{humanize(i.format)}</span>
          {i.publish_date && <span className="text-xs text-muted">· {fmtDate(i.publish_date)}</span>}
          <Pill tone={STATUS_TONE[i.review_status]} className="ml-auto">{i.review_status === "safety_passed" ? "To review" : humanize(i.review_status)}</Pill>
        </div>
        {i.pillar && <p className="mt-2 text-xs text-muted">{i.pillar}</p>}
        {i.hook && <p className="mt-1 font-semibold">{i.hook}</p>}
        {i.caption && (
          <details className="mt-2 text-sm">
            <summary className="cursor-pointer text-primary">Caption</summary>
            <p className="mt-1 whitespace-pre-line">{i.caption}</p>
            {i.body?.hashtags?.length ? <p className="mt-1 text-muted">{i.body.hashtags.map((h) => `#${h.replace(/^#/, "")}`).join(" ")}</p> : null}
          </details>
        )}
        {i.body?.script_or_slides?.length ? (
          <details className="mt-1 text-sm">
            <summary className="cursor-pointer text-primary">{i.format === "carousel" ? "Slides" : "Script"} ({i.body.script_or_slides.length})</summary>
            <ol className="mt-1 list-decimal space-y-1 pl-5">{i.body.script_or_slides.map((s, n) => <li key={n}>{s}</li>)}</ol>
          </details>
        ) : null}
        {needs.length > 0 && (
          <div className="mt-2 rounded-md bg-accent-soft px-2.5 py-1.5 text-xs text-accent-text">
            <strong>Needs facts:</strong> {needs.join("; ")}
          </div>
        )}
        <div className="mt-auto flex gap-2 pt-3">
          {reviewable && <>
            <StatusButton slug={slug} id={i.id} to="approved" label="Approve" icon={Check} primary />
            <StatusButton slug={slug} id={i.id} to="rejected" label="Reject" icon={X} />
          </>}
          {i.review_status === "approved" && <StatusButton slug={slug} id={i.id} to="published" label="Mark posted" icon={Check} />}
        </div>
      </Card>
    </li>
  );
}

function StatusButton({ slug, id, to, label, icon: Icon, primary }: { slug: string; id: string; to: ContentStatus; label: string; icon: typeof Check; primary?: boolean }) {
  return (
    <form action={setContentStatus}>
      <input type="hidden" name="business" value={slug} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={to} />
      <button className={cx("inline-flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-200",
        primary ? "bg-primary text-white hover:bg-primary-hover dark:text-bg" : "border border-border bg-surface hover:bg-surface-2")}>
        <Icon className="size-4" aria-hidden />{label}
      </button>
    </form>
  );
}
