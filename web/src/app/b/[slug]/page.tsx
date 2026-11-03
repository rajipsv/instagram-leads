import { CheckCircle2, Circle, MessageCircleReply, Search, Send, Sparkles, Target, Trophy, Users } from "lucide-react";
import Link from "next/link";
import { ChallengeBars, Funnel, WeeklyTrend } from "@/components/charts";
import { CopyCommand } from "@/components/client";
import { Card, Kpi, PageHeader, Pill, StatusBadge, cx, fmtAgo, humanize, pct } from "@/components/ui";
import { getBusiness, openNeeds, overview } from "@/lib/queries";

export const metadata = { title: "Overview" };

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export default async function Overview({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const business = await getBusiness(slug);
  const { counts: c, byChallenge, weekly, events, stages } = await overview(business.id);
  const needs = openNeeds(business.brand);
  const names = new Map((business.icp.challenge_library ?? []).map((ch) => [ch.id, ch.name]));

  const pipeline = [
    { label: "Instagram search", done: stages.leads > 0, detail: plural(stages.leads, "lead"), cmd: `/find-leads ${slug}` },
    { label: "Lead analysis", done: stages.analysed > 0, detail: `${stages.analysed} analysed`, cmd: `/analyze-leads ${slug}` },
    { label: "Content", done: stages.content > 0, detail: plural(stages.content, "piece"), cmd: `/content-plan ${slug}` },
    { label: "Campaigns", done: stages.campaigns > 0, detail: plural(stages.campaigns, "campaign"), cmd: `/build-campaign ${slug}` },
    { label: "Feedback", done: stages.learnings > 0, detail: plural(stages.learnings, "review"), cmd: `/feedback ${slug}` },
  ];
  const next = pipeline.find((p) => !p.done);

  return (
    <>
      <PageHeader title="Overview" subtitle={business.icp.target_customer} />

      {needs.length > 0 && (
        <Link href={`/b/${slug}/profile`}
          className="mb-4 flex cursor-pointer items-center gap-2 rounded-lg border border-accent/40 bg-accent-soft px-3 py-2 text-sm text-accent-text transition-colors duration-200 hover:border-accent">
          <Sparkles className="size-4 shrink-0" aria-hidden />
          <span><strong>{needs.length} brand facts are missing.</strong> Content and outreach will show [NEED] placeholders until you add them.</span>
        </Link>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Leads found" value={c.found} icon={Search} />
        <Kpi label="A-tier" value={c.a_tier} hint={`${c.qualified} A+B qualified`} icon={Target} />
        <Kpi label="Contacted" value={c.contacted} icon={Send} />
        <Kpi label="Reply rate" value={pct(c.replied, c.contacted)} hint={`${c.replied} replied`} icon={MessageCircleReply} tone="accent" />
        <Kpi label="Demos" value={c.demos} icon={Users} />
        <Kpi label="Won" value={c.won} icon={Trophy} tone="accent" />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card title="Weekly cycle" className="xl:col-span-1"
          action={next ? <Pill tone="primary">Next: {next.label}</Pill> : <Pill tone="success">All stages ran</Pill>}>
          <ol className="space-y-2">
            {pipeline.map((p, i) => (
              <li key={p.label} className={cx("flex items-center gap-3 rounded-lg px-2 py-1.5", p === next && "bg-primary-soft")}>
                {p.done
                  ? <CheckCircle2 className="size-4 shrink-0 text-success" aria-label="Done" />
                  : <Circle className="size-4 shrink-0 text-muted" aria-label="Not run yet" />}
                <span className="flex-1 text-sm"><span className="font-mono text-xs text-muted">{i + 1}</span> {p.label}</span>
                <span className="text-xs text-muted">{p.detail}</span>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-xs text-muted">Run the whole cycle in Claude Code:</p>
          <CopyCommand className="mt-1" command={`/growth-cycle ${slug}`} />
          {next && <><p className="mt-2 text-xs text-muted">Or just the next stage:</p><CopyCommand className="mt-1" command={next.cmd} /></>}
        </Card>

        <Card title="Funnel">
          <Funnel stages={[
            { label: "Found", value: c.found },
            { label: "Qualified (A+B)", value: c.qualified },
            { label: "Contacted", value: c.contacted },
            { label: "Replied", value: c.replied },
            { label: "Demo booked", value: c.demos },
            { label: "Won", value: c.won },
          ]} />
        </Card>

        <Card title="Qualified leads by challenge" action={<Link href={`/b/${slug}/leads`} className="cursor-pointer text-xs font-medium text-primary hover:underline">View leads</Link>}>
          {byChallenge.length === 0
            ? <p className="text-sm text-muted">No qualified leads yet.</p>
            : <ChallengeBars data={byChallenge.map((r) => ({ label: r.challenge === "unanalysed" ? "Not analysed yet" : names.get(r.challenge) ?? humanize(r.challenge), leads: r.leads }))} />}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card title="Last 8 weeks" className="xl:col-span-2">
          <WeeklyTrend data={weekly} />
          <ul className="mt-2 flex flex-wrap gap-4 text-xs text-muted" aria-hidden>
            <li className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-[#3b82f6]" />Found</li>
            <li className="flex items-center gap-1.5"><span className="h-0.5 w-4 border-t-2 border-dashed border-[#f59e0b]" />Contacted</li>
            <li className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-[#22c55e]" />Replied</li>
          </ul>
        </Card>
        <Card title="Recent activity">
          {events.length === 0 ? (
            <p className="text-sm text-muted">No outreach recorded yet. Status changes you save on a lead show up here.</p>
          ) : (
            <ul className="space-y-3">
              {events.map((e) => (
                <li key={e.id} className="text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/b/${slug}/leads?lead=${e.username}`} className="cursor-pointer font-medium hover:text-primary">@{e.username}</Link>
                    <StatusBadge status={e.to_status} />
                    <span className="ml-auto text-xs text-muted">{fmtAgo(e.created_at)}</span>
                  </div>
                  {e.note && <p className="mt-0.5 line-clamp-2 text-muted">{e.note}</p>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
