import { BarChart3, BookOpen } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { CopyCommand } from "@/components/client";
import { Card, EmptyState, PageHeader, Pill, fmtDate, humanize, pct } from "@/components/ui";
import { getBusiness, listLearnings, outcomeStats, type Dim } from "@/lib/queries";

export const metadata = { title: "Feedback" };

const DIM_LABEL: Record<Dim, string> = {
  primary_challenge: "By challenge", campaign: "By campaign", segment: "By segment", tier: "By tier",
};
const MIN_SAMPLE = 10;

export default async function FeedbackPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const business = await getBusiness(slug);
  const [stats, learnings] = await Promise.all([outcomeStats(business.id), listLearnings(business.id)]);
  const chName = (id: string) => business.icp.challenge_library?.find((c) => c.id === id)?.name ?? humanize(id);

  return (
    <>
      <PageHeader title="Feedback" subtitle="What's working, from recorded outreach outcomes. Groups under 10 contacts are marked too early." />

      {stats.total === 0 ? (
        <EmptyState icon={BarChart3} title="No outcomes recorded yet">
          Open a lead, send your message from Instagram, then save its status and the reply summary. Results appear here.
        </EmptyState>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {(Object.keys(DIM_LABEL) as Dim[]).map((d) => (
            <Card key={d} title={DIM_LABEL[d]}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide text-muted">
                    <tr>
                      <th scope="col" className="py-1.5 pr-2">Group</th>
                      <th scope="col" className="py-1.5 pr-2 text-right">Contacted</th>
                      <th scope="col" className="py-1.5 pr-2 text-right">Reply</th>
                      <th scope="col" className="py-1.5 pr-2 text-right">Demo</th>
                      <th scope="col" className="py-1.5 text-right">Won</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.byDim[d].map((g) => {
                      const replyRate = g.contacted ? g.replied / g.contacted : 0;
                      return (
                        <tr key={g.key} className="border-t border-border">
                          <td className="py-2 pr-2">
                            <span className="font-medium">{d === "primary_challenge" && g.key !== "(none)" ? chName(g.key) : d === "tier" ? `Tier ${g.key}` : humanize(g.key)}</span>
                            {g.contacted < MIN_SAMPLE && <Pill className="ml-2">too early</Pill>}
                          </td>
                          <td className="py-2 pr-2 text-right font-mono tabular-nums">{g.contacted}</td>
                          <td className="py-2 pr-2 text-right font-mono tabular-nums">
                            <span className="inline-flex items-center gap-2">
                              <span className="hidden h-1.5 w-12 overflow-hidden rounded-full bg-surface-2 sm:inline-block" aria-hidden>
                                <span className="block h-full bg-primary" style={{ width: `${Math.round(replyRate * 100)}%` }} />
                              </span>
                              {pct(g.replied, g.contacted)}
                            </span>
                          </td>
                          <td className="py-2 pr-2 text-right font-mono tabular-nums">{pct(g.demos, g.contacted)}</td>
                          <td className="py-2 text-right font-mono tabular-nums">{g.won}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          ))}
        </div>
      )}

      <h2 className="mb-3 mt-8 flex items-center gap-2 font-mono text-lg font-semibold"><BookOpen className="size-5 text-primary" aria-hidden />Learnings</h2>
      {learnings.length === 0 ? (
        <Card>
          <p className="text-sm text-muted">The Feedback Analyst writes a weekly review with proposed changes to scoring, challenges and messaging.</p>
          <CopyCommand className="mt-3 max-w-md" command={`/feedback ${slug}`} />
        </Card>
      ) : (
        <div className="space-y-3">
          {learnings.map((l, idx) => (
            <details key={l.week} open={idx === 0} className="group rounded-xl border border-border bg-surface">
              <summary className="flex cursor-pointer items-center gap-2 px-4 py-3">
                <span className="font-mono font-semibold">{l.week}</span>
                <span className="text-xs text-muted">saved {fmtDate(l.created_at)}</span>
              </summary>
              <div className="prose-gi border-t border-border px-4 pb-4">
                <ReactMarkdown>{l.summary ?? ""}</ReactMarkdown>
              </div>
            </details>
          ))}
        </div>
      )}
    </>
  );
}
