import { Megaphone, Pause, Play, ThumbsUp } from "lucide-react";
import Link from "next/link";
import { Card, EmptyState, PageHeader, Pill, humanize, pct } from "@/components/ui";
import { setCampaignStatus } from "@/lib/actions";
import { getBusiness, listCampaigns } from "@/lib/queries";
import type { CampaignStatus } from "@/lib/types";

export const metadata = { title: "Campaigns" };

const STATUS_TONE: Record<CampaignStatus, "default" | "primary" | "accent" | "success"> = {
  draft: "accent", approved: "primary", running: "success", paused: "default", done: "default",
};

const NEXT: Record<CampaignStatus, { to: CampaignStatus; label: string; icon: typeof Play }[]> = {
  draft: [{ to: "approved", label: "Approve", icon: ThumbsUp }],
  approved: [{ to: "running", label: "Mark running", icon: Play }],
  running: [{ to: "paused", label: "Pause", icon: Pause }, { to: "done", label: "Mark done", icon: ThumbsUp }],
  paused: [{ to: "running", label: "Resume", icon: Play }],
  done: [],
};

export default async function CampaignsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const business = await getBusiness(slug);
  const campaigns = await listCampaigns(business.id);
  const chName = (id: string | null) => business.icp.challenge_library?.find((c) => c.id === id)?.name ?? humanize(id);

  return (
    <>
      <PageHeader title="Campaigns" subtitle="One campaign per challenge group. Each one tests a hypothesis, and the Feedback step checks it." />
      {campaigns.length === 0 ? (
        <EmptyState icon={Megaphone} title="No campaigns yet" command={`/build-campaign ${slug}`}>
          Campaigns are built from analysed leads. Run Lead Analysis first, then the Campaign Builder.
        </EmptyState>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {campaigns.map((c) => {
            const rawTarget = c.brief.kpis?.reply_rate_target;
            const target = rawTarget === undefined ? undefined : rawTarget > 1 ? rawTarget / 100 : rawTarget; // accepts 0.2 or 20
            const rate = c.contacted ? c.replied / c.contacted : null;
            return (
              <li key={c.slug}>
                <Card className="h-full">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h2 className="font-semibold">{c.name}</h2>
                      <p className="text-sm text-muted">{chName(c.challenge)}{c.segment ? ` · ${humanize(c.segment)}` : ""}</p>
                    </div>
                    <Pill tone={STATUS_TONE[c.status]}>{humanize(c.status)}</Pill>
                  </div>

                  {c.brief.hypothesis && (
                    <p className="mt-3 rounded-lg border-l-4 border-accent bg-accent-soft/50 px-3 py-2 text-sm">
                      <span className="font-medium">Hypothesis: </span>{c.brief.hypothesis}
                    </p>
                  )}
                  {c.brief.key_message && <p className="mt-3 text-sm"><span className="text-muted">Key message: </span>{c.brief.key_message}</p>}

                  <dl className="mt-4 grid grid-cols-4 gap-2 text-center">
                    {[["Leads", c.leads], ["Contacted", c.contacted], ["Reply rate", pct(c.replied, c.contacted)], ["Demos", c.demos]].map(([k, v]) => (
                      <div key={k as string} className="rounded-lg bg-surface-2 py-2">
                        <dt className="text-[11px] uppercase tracking-wide text-muted">{k}</dt>
                        <dd className="font-mono font-semibold tabular-nums">{v}</dd>
                      </div>
                    ))}
                  </dl>
                  {target !== undefined && (
                    <p className="mt-2 text-xs text-muted">
                      Target reply rate {Math.round(target * 100)}%
                      {rate !== null && c.contacted >= 10 && (rate >= target
                        ? <span className="ml-1 text-success">· on target</span> : <span className="ml-1 text-accent-text">· below target</span>)}
                      {c.contacted < 10 && <span className="ml-1">· too early to judge (fewer than 10 contacted)</span>}
                    </p>
                  )}

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {NEXT[c.status].map(({ to, label, icon: Icon }) => (
                      <form key={to} action={setCampaignStatus}>
                        <input type="hidden" name="business" value={slug} />
                        <input type="hidden" name="campaign" value={c.slug} />
                        <input type="hidden" name="status" value={to} />
                        <button className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white transition-colors duration-200 hover:bg-primary-hover dark:text-bg">
                          <Icon className="size-4" aria-hidden />{label}
                        </button>
                      </form>
                    ))}
                    <Link href={`/b/${slug}/leads?campaign=${encodeURIComponent(c.slug)}`} className="cursor-pointer px-2 py-1.5 text-sm text-primary hover:underline">
                      See leads
                    </Link>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
